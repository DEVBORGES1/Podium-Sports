import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { applyStockChange, lockStock } from '../../lib/stock.js';
import { normalizeSearch } from '../../lib/text.js';
import { paged } from '../../lib/validation.js';
import { availabilityOf } from '../products/products.service.js';
import type { createMovementSchema, inventoryListQuery, movementsQuery } from './inventory.schemas.js';

export const OPEN_ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY'] as const;

export async function listInventory(query: z.infer<typeof inventoryListQuery>) {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.categoryId) conditions.push(Prisma.sql`p.category_id = ${query.categoryId}::uuid`);
  if (query.stock === 'out') conditions.push(Prisma.sql`p.stock_quantity = 0`);
  if (query.stock === 'low') conditions.push(Prisma.sql`p.stock_quantity > 0 AND p.stock_quantity <= p.min_stock`);
  if (query.stock === 'ok') conditions.push(Prisma.sql`p.stock_quantity > p.min_stock`);
  for (const term of normalizeSearch(query.q ?? '').split(' ').filter(Boolean).slice(0, 6)) {
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
                  AND o.status IN ('PENDING', 'ACCEPTED', 'PROCESSING', 'READY')
             ), 0)::bigint AS reserved,
             (SELECT MAX(m.created_at) FROM inventory_movements m WHERE m.product_id = p.id) AS last_movement_at
        FROM products p JOIN categories c ON c.id = p.category_id
       WHERE ${where}
       ORDER BY (p.stock_quantity = 0) DESC, (p.stock_quantity <= p.min_stock) DESC, p.name ASC
       LIMIT ${query.pageSize} OFFSET ${offset}`,
  ]);

  const items = rows.map((r) => ({
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
  }));
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
        product: { select: { id: true, name: true } },
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
      product: m.product,
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
    let delta: number;
    if (input.type === 'ADJUSTMENT') {
      const current = await lockStock(tx, input.productId);
      delta = input.newBalance - current;
      if (delta === 0) throw unprocessable(`O saldo já é ${current}. Nenhum ajuste necessário.`);
    } else {
      delta = input.type === 'IN' ? input.quantity : -input.quantity;
    }
    const movement = await applyStockChange(tx, {
      productId: input.productId,
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
