import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { applyStockChange, assertStockTarget, lockStock } from '../../lib/stock.js';
import { normalizeSearch } from '../../lib/text.js';
import { paged } from '../../lib/validation.js';
import { OPEN_ORDER_STATUSES } from '../orders/orders.labels.js';
import { availabilityOf } from '../products/products.service.js';
import type { batchMovementsSchema, createMovementSchema, inventoryListQuery, movementsQuery } from './inventory.schemas.js';

export async function listInventory(query: z.infer<typeof inventoryListQuery>) {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.categoryId) conditions.push(Prisma.sql`p.category_id = ${query.categoryId}::uuid`);
  if (query.stock === 'out') conditions.push(Prisma.sql`p.stock_quantity = 0`);
  if (query.stock === 'low') conditions.push(Prisma.sql`p.stock_quantity > 0 AND p.stock_quantity <= p.min_stock`);
  if (query.stock === 'ok') conditions.push(Prisma.sql`p.stock_quantity > p.min_stock`);
  for (const term of normalizeSearch(query.q ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)) {
    conditions.push(Prisma.sql`p.search_text LIKE ${'%' + term.replace(/[%_\\]/g, '\\$&') + '%'}`);
  }
  const where = Prisma.join(conditions, ' AND ');
  const offset = (query.page - 1) * query.pageSize;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*)::bigint AS total FROM products p WHERE ${where}`,
    prisma.$queryRaw<
      {
        id: string;
        name: string;
        slug: string;
        is_active: boolean;
        stock_quantity: number;
        min_stock: number;
        category_name: string;
        reserved: bigint;
        last_movement_at: Date | null;
      }[]
    >`
      SELECT p.id, p.name, p.slug, p.is_active, p.stock_quantity, p.min_stock, c.name AS category_name,
             COALESCE((
               SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                WHERE oi.product_id = p.id
                  AND o.status::text IN (${Prisma.join([...OPEN_ORDER_STATUSES])})
             ), 0)::bigint AS reserved,
             (SELECT MAX(m.created_at) FROM inventory_movements m WHERE m.product_id = p.id) AS last_movement_at
        FROM products p JOIN categories c ON c.id = p.category_id
       WHERE ${where}
       ORDER BY (p.stock_quantity = 0) DESC, (p.stock_quantity <= p.min_stock) DESC, p.name ASC
       LIMIT ${query.pageSize} OFFSET ${offset}`,
  ]);

  // Variações dos produtos da página, com o que está reservado em pedidos abertos de cada uma.
  const ids = rows.map((r) => r.id);
  const variantRows = ids.length
    ? await prisma.$queryRaw<{ id: string; product_id: string; label: string; stock_quantity: number; is_active: boolean; reserved: bigint }[]>`
        SELECT v.id, v.product_id, v.label, v.stock_quantity, v.is_active,
               COALESCE((
                 SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                  WHERE oi.variant_id = v.id
                    AND o.status::text IN (${Prisma.join([...OPEN_ORDER_STATUSES])})
               ), 0)::bigint AS reserved
          FROM product_variants v
         WHERE v.product_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
         ORDER BY v.sort_order ASC, v.created_at ASC`
    : [];
  const variantsByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows) variantsByProduct.set(v.product_id, [...(variantsByProduct.get(v.product_id) ?? []), v]);
  const typeRows = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, variantType: true } }) : [];
  const typeOf = new Map(typeRows.map((t) => [t.id, t.variantType]));

  const items = rows.map((r) => {
    const variants = variantsByProduct.get(r.id) ?? [];
    return {
      productId: r.id,
      name: r.name,
      slug: r.slug,
      categoryName: r.category_name,
      isActive: r.is_active,
      stockQuantity: r.stock_quantity,
      minStock: r.min_stock,
      reservedInOpenOrders: Number(r.reserved),
      status: availabilityOf(r.stock_quantity, r.min_stock),
      lastMovementAt: r.last_movement_at,
      variantType: variants.length > 0 ? (typeOf.get(r.id) ?? 'Opção') : null,
      variants: variants.map((v) => ({
        id: v.id,
        label: v.label,
        stockQuantity: v.stock_quantity,
        isActive: v.is_active,
        reservedInOpenOrders: Number(v.reserved),
      })),
    };
  });
  return paged(items, Number(countRows[0]?.total ?? 0), query.page, query.pageSize);
}

export async function listMovements(query: z.infer<typeof movementsQuery>) {
  const where: Prisma.InventoryMovementWhereInput = {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, variantType: true } },
        variant: { select: { id: true, label: true } },
        profile: { select: { id: true, name: true } },
        order: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return paged(
    rows.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      balanceBefore: m.balanceBefore,
      balanceAfter: m.balanceAfter,
      reason: m.reason,
      createdAt: m.createdAt,
      product: { id: m.product.id, name: m.product.name },
      /** Saldos antes/depois são os da variação quando houver. */
      variant: m.variant ? { id: m.variant.id, label: m.variant.label, type: m.product.variantType ?? 'Opção' } : null,
      user: m.profile,
      order: m.order,
    })),
    total,
    query.page,
    query.pageSize,
  );
}

export async function createMovement(input: z.infer<typeof createMovementSchema>, profileId: string) {
  return prisma.$transaction(async (tx) => {
    await assertStockTarget(tx, input.productId, input.variantId);
    let delta: number;
    if (input.type === 'ADJUSTMENT') {
      const current = await lockStock(tx, input.productId, input.variantId);
      delta = input.newBalance - current;
      if (delta === 0) throw unprocessable(`O saldo já é ${current}. Nenhum ajuste necessário.`);
    } else {
      delta = input.type === 'IN' ? input.quantity : -input.quantity;
    }
    const movement = await applyStockChange(tx, {
      productId: input.productId,
      variantId: input.variantId,
      delta,
      type: input.type,
      reason: input.reason || (input.type === 'IN' ? 'Entrada de mercadoria' : null),
      profileId,
    });
    await audit(
      {
        profileId,
        action: `inventory.${input.type.toLowerCase()}`,
        entityType: 'product',
        entityId: input.productId,
        metadata: { movementId: movement.id, delta, balanceBefore: movement.balanceBefore, balanceAfter: movement.balanceAfter, reason: movement.reason },
      },
      tx,
    );
    return movement;
  });
}

/** Grava vários ajustes de uma vez (tabela de estoque). Se um falhar (ex.: saldo insuficiente), nenhum é aplicado. */
export async function createMovementsBatch(input: z.infer<typeof batchMovementsSchema>, profileId: string) {
  // Ordem fixa de travamento das linhas: dois lotes simultâneos nunca se bloqueiam mutuamente.
  const key = (i: { productId: string; variantId: string | null }) => `${i.productId}:${i.variantId ?? ''}`;
  const items = [...input.items].sort((a, b) => key(a).localeCompare(key(b)));
  return prisma.$transaction(async (tx) => {
    const movements = [];
    for (const item of items) {
      await assertStockTarget(tx, item.productId, item.variantId);
      const type = item.delta > 0 ? 'IN' : 'OUT';
      const movement = await applyStockChange(tx, {
        productId: item.productId,
        variantId: item.variantId,
        delta: item.delta,
        type,
        reason: input.reason || (type === 'IN' ? 'Entrada de mercadoria' : null),
        profileId,
      });
      await audit(
        {
          profileId,
          action: `inventory.${type.toLowerCase()}`,
          entityType: 'product',
          entityId: item.productId,
          metadata: {
            movementId: movement.id,
            delta: item.delta,
            balanceBefore: movement.balanceBefore,
            balanceAfter: movement.balanceAfter,
            reason: movement.reason,
            batch: true,
          },
        },
        tx,
      );
      movements.push(movement);
    }
    return { items: movements };
  });
}

export async function updateMinStock(productId: string, minStock: number, profileId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id: productId }, select: { minStock: true } });
    if (!current) throw notFound('Produto não encontrado.');
    const saved = await tx.product.update({ where: { id: productId }, data: { minStock }, select: { id: true, minStock: true, stockQuantity: true } });
    await audit(
      { profileId, action: 'inventory.min_stock', entityType: 'product', entityId: productId, metadata: { from: current.minStock, to: minStock } },
      tx,
    );
    return saved;
  });
}
