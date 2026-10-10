import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Prisma, type Order, type OrderItem, type OrderStatus, type PaymentStatus } from '@prisma/client';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { audit } from '../../lib/audit.js';
import { AppError, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { applyStockChange } from '../../lib/stock.js';
import { mediaUrl } from '../../lib/storage.js';
import { paged } from '../../lib/validation.js';
import { MAX_QUANTITY_PER_ITEM } from '../products/products.schemas.js';
import { priceOf, productInclude, type ProductWithRelations } from '../products/products.service.js';
import { getSettings } from '../settings/settings.service.js';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, STATUS_TRANSITIONS } from './orders.labels.js';
import type { adminOrdersQuery, createOrderSchema, quoteSchema } from './orders.schemas.js';

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type OrderWithItems = Order & { items: OrderItem[] };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  let code = 'PS-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Token de acesso público do pedido: HMAC do id (não é armazenado; pode ser recalculado). */
export function orderAccessToken(orderId: string) {
  return createHmac('sha256', env.ORDER_TOKEN_SECRET!).update(`order:${orderId}`).digest('base64url');
}

function tokenMatches(orderId: string, token: string) {
  const expected = Buffer.from(orderAccessToken(orderId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Soma quantidades repetidas do mesmo produto. */
function mergeItems(items: { productId: string; quantity: number }[]) {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.productId, (map.get(i.productId) ?? 0) + i.quantity);
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

async function loadProducts(ids: string[], now: Date) {
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude(now) });
  return new Map(products.map((p) => [p.id, p]));
}

type LineIssue = 'NOT_FOUND' | 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'QUANTITY_LIMIT' | null;

function lineIssue(product: ProductWithRelations | undefined, quantity: number): LineIssue {
  if (!product) return 'NOT_FOUND';
  if (!product.isActive || !product.category.isActive) return 'UNAVAILABLE';
  if (product.stockQuantity <= 0) return 'OUT_OF_STOCK';
  if (quantity > MAX_QUANTITY_PER_ITEM) return 'QUANTITY_LIMIT';
  if (quantity > product.stockQuantity) return 'INSUFFICIENT_STOCK';
  return null;
}

/** Recalcula a sacola com preços e disponibilidade oficiais (usado pela sacola e pelo checkout). */
export async function quoteCart(input: z.infer<typeof quoteSchema>) {
  const now = new Date();
  const items = mergeItems(input.items);
  const products = await loadProducts(
    items.map((i) => i.productId),
    now,
  );
  let subtotal = 0;
  let total = 0;
  const lines = items.map(({ productId, quantity }) => {
    const product = products.get(productId);
    const issue = lineIssue(product, quantity);
    if (!product || issue === 'NOT_FOUND' || issue === 'UNAVAILABLE') {
      return { productId, quantity, issue, name: product?.name ?? null, available: false };
    }
    const price = priceOf(product, now);
    const maxQuantity = Math.max(0, Math.min(product.stockQuantity, MAX_QUANTITY_PER_ITEM));
    const available = issue === null;
    if (available) {
      subtotal += price.regularPriceCents * quantity;
      total += price.priceCents * quantity;
    }
    return {
      productId,
      quantity,
      issue,
      available,
      name: product.name,
      slug: product.slug,
      imageUrl: mediaUrl(product.images[0]?.storagePath),
      unitPriceCents: price.priceCents,
      regularUnitPriceCents: price.regularPriceCents,
      subtotalCents: price.priceCents * quantity,
      maxQuantity,
    };
  });
  return {
    lines,
    subtotalCents: subtotal,
    discountCents: subtotal - total,
    totalCents: total,
    canCheckout: lines.length > 0 && lines.every((l) => l.available),
  };
}

export function toPublicOrder(order: OrderWithItems) {
  return {
    code: order.code,
    status: order.status,
    statusLabel: ORDER_STATUS_LABEL[order.status],
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    customerName: order.customerName,
    fulfillment: order.fulfillment,
    address:
      order.fulfillment === 'DELIVERY'
        ? {
            street: order.addressStreet,
            number: order.addressNumber,
            district: order.addressDistrict,
            city: order.addressCity,
            complement: order.addressComplement,
          }
        : null,
    notes: order.notes,
    items: order.items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      originalUnitPriceCents: i.originalUnitPriceCents,
      subtotalCents: i.subtotalCents,
    })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    whatsappOpenedAt: order.whatsappOpenedAt,
  };
}

function sameItems(order: OrderWithItems, items: { productId: string; quantity: number }[]) {
  const a = order.items
    .map((i) => `${i.productId}:${i.quantity}`)
    .sort()
    .join(',');
  const b = items
    .map((i) => `${i.productId}:${i.quantity}`)
    .sort()
    .join(',');
  return a === b;
}

async function replayIdempotent(idempotencyKey: string, items: { productId: string; quantity: number }[]) {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
  if (!existing) return null;
  if (!sameItems(existing, items)) {
    throw conflict('Esta chave de idempotência já foi usada para outro pedido.', undefined, 'IDEMPOTENCY_KEY_REUSED');
  }
  return { order: toPublicOrder(existing), accessToken: orderAccessToken(existing.id), created: false };
}

/**
 * Cria o pedido usando somente dados oficiais do banco:
 * valida produtos, recalcula preços, reserva o estoque atomicamente e registra tudo numa transação.
 */
export async function createOrder(input: CreateOrderInput, idempotencyKey: string) {
  const items = mergeItems(input.items);
  const replay = await replayIdempotent(idempotencyKey, items);
  if (replay) return replay;

  const settings = await getSettings();
  if (input.fulfillment === 'DELIVERY' && !settings.deliveryEnabled) {
    throw unprocessable('A loja não está fazendo entregas no momento.', undefined, 'FULFILLMENT_UNAVAILABLE');
  }
  if (input.fulfillment === 'PICKUP' && !settings.pickupEnabled) {
    throw unprocessable('A retirada na loja não está disponível no momento.', undefined, 'FULFILLMENT_UNAVAILABLE');
  }

  const now = new Date();
  const products = await loadProducts(
    items.map((i) => i.productId),
    now,
  );
  const problems = items
    .map((i) => ({ productId: i.productId, issue: lineIssue(products.get(i.productId), i.quantity), product: products.get(i.productId) }))
    .filter((p) => p.issue !== null);
  if (problems.length > 0) {
    throw unprocessable(
      'Alguns itens da sacola não estão disponíveis. Revise a sacola.',
      problems.map((p) => ({
        productId: p.productId,
        name: p.product?.name ?? null,
        issue: p.issue,
        available: p.product ? Math.max(0, p.product.stockQuantity) : 0,
      })),
      'ITEMS_UNAVAILABLE',
    );
  }

  const lines = items.map(({ productId, quantity }) => {
    const product = products.get(productId)!;
    const price = priceOf(product, now);
    return {
      productId,
      productName: product.name,
      unitPriceCents: price.priceCents,
      originalUnitPriceCents: price.regularPriceCents,
      quantity,
      subtotalCents: price.priceCents * quantity,
    };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.originalUnitPriceCents * l.quantity, 0);
  const totalCents = lines.reduce((s, l) => s + l.subtotalCents, 0);
  const address = input.fulfillment === 'DELIVERY' ? input.address : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            code: generateCode(),
            idempotencyKey,
            customerName: input.customer.name,
            customerPhone: input.customer.phone,
            fulfillment: input.fulfillment,
            addressStreet: address?.street ?? null,
            addressNumber: address?.number ?? null,
            addressDistrict: address?.district ?? null,
            addressCity: address?.city ?? null,
            addressComplement: address?.complement ?? null,
            notes: input.notes,
            subtotalCents,
            discountCents: subtotalCents - totalCents,
            totalCents,
            items: { create: lines },
            statusHistory: { create: { fromStatus: null, toStatus: 'PENDING', note: 'Pedido registrado pelo site' } },
          },
          include: { items: true },
        });
        // Ordem fixa por produto evita deadlock entre pedidos simultâneos.
        for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
          await applyStockChange(tx, {
            productId: line.productId,
            delta: -line.quantity,
            type: 'ORDER_RESERVATION',
            reason: `Reserva do pedido ${created.code}`,
            orderId: created.id,
          });
        }
        return created;
      });
      logger.info({ orderCode: order.code, totalCents: order.totalCents, items: order.items.length }, 'order created');
      return { order: toPublicOrder(order), accessToken: orderAccessToken(order.id), created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = String(err.meta?.target ?? '');
        if (target.includes('idempotency')) {
          // Requisição concorrente com a mesma chave já criou o pedido.
          const again = await replayIdempotent(idempotencyKey, items);
          if (again) return again;
        }
        if (target.includes('code')) continue; // colisão do código aleatório: tenta outro
      }
      throw err;
    }
  }
  throw new AppError(500, 'ORDER_CODE_EXHAUSTED', 'Não foi possível gerar o código do pedido.');
}

async function findByCodeWithToken(code: string, token: string) {
  const order = await prisma.order.findUnique({ where: { code }, include: { items: true } });
  // Mesma resposta para "não existe" e "token errado": não revela a existência de pedidos.
  if (!order || !tokenMatches(order.id, token)) throw notFound('Pedido não encontrado.');
  return order;
}

export async function getPublicOrder(code: string, token: string) {
  return toPublicOrder(await findByCodeWithToken(code, token));
}

/** Registra que o cliente clicou para abrir o WhatsApp. Não significa que a mensagem foi enviada. */
export async function markWhatsappOpened(code: string, token: string) {
  const order = await findByCodeWithToken(code, token);
  if (!order.whatsappOpenedAt) {
    await prisma.order.updateMany({ where: { id: order.id, whatsappOpenedAt: null }, data: { whatsappOpenedAt: new Date() } });
  }
}

// ---------------- Ciclo de vida ----------------

/**
 * Cancela/expira o pedido e devolve o estoque reservado uma única vez.
 * O UPDATE condicional em stock_released_at garante que duas chamadas concorrentes
 * não devolvam o estoque em dobro.
 */
async function closeOrder(
  tx: Tx,
  order: { id: string; code: string; status: OrderStatus },
  toStatus: 'CANCELLED' | 'EXPIRED',
  profileId: string | null,
  reason: string | null,
) {
  const now = new Date();
  const allowedFrom: OrderStatus[] = toStatus === 'EXPIRED' ? ['PENDING'] : ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY'];
  const result = await tx.order.updateMany({
    where: { id: order.id, status: { in: allowedFrom }, stockReleasedAt: null },
    data: { status: toStatus, cancelledAt: now, cancelReason: reason, stockReleasedAt: now },
  });
  if (result.count === 0) {
    throw conflict('O pedido foi alterado por outra operação ou não pode mais ser cancelado.', undefined, 'ORDER_STATE_CHANGED');
  }
  const items = await tx.orderItem.findMany({ where: { orderId: order.id, productId: { not: null } } });
  for (const item of items.sort((a, b) => a.productId!.localeCompare(b.productId!))) {
    await applyStockChange(tx, {
      productId: item.productId!,
      delta: item.quantity,
      type: 'ORDER_RELEASE',
      reason: `${toStatus === 'EXPIRED' ? 'Expiração' : 'Cancelamento'} do pedido ${order.code}`,
      orderId: order.id,
      profileId,
    });
  }
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: order.status, toStatus, note: reason, profileId },
  });
}

export async function updateOrderStatus(orderId: string, toStatus: OrderStatus, note: string | null, profileId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Pedido não encontrado.');
    if (!STATUS_TRANSITIONS[order.status].includes(toStatus)) {
      throw unprocessable(
        `Não é possível mudar de "${ORDER_STATUS_LABEL[order.status]}" para "${ORDER_STATUS_LABEL[toStatus]}".`,
        { from: order.status, to: toStatus, allowed: STATUS_TRANSITIONS[order.status] },
        'INVALID_STATUS_TRANSITION',
      );
    }
    if (toStatus === 'CANCELLED') {
      await closeOrder(tx, order, 'CANCELLED', profileId, note);
    } else {
      const now = new Date();
      const result = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: toStatus,
          ...(order.acceptedAt ? {} : { acceptedAt: now }),
          ...(toStatus === 'COMPLETED' ? { completedAt: now } : {}),
        },
      });
      if (result.count === 0) throw conflict('O pedido foi alterado por outra operação. Recarregue a página.', undefined, 'ORDER_STATE_CHANGED');
      await tx.orderStatusHistory.create({ data: { orderId, fromStatus: order.status, toStatus, note, profileId } });
    }
    await audit(
      { profileId, action: 'order.status_change', entityType: 'order', entityId: orderId, metadata: { code: order.code, from: order.status, to: toStatus, note } },
      tx,
    );
  });
  return getAdminOrder(orderId);
}

export async function updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus, note: string | null, profileId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Pedido não encontrado.');
    const from = order.paymentStatus;
    const allowed =
      (paymentStatus === 'PAID' && from === 'UNPAID' && !['CANCELLED', 'EXPIRED'].includes(order.status)) ||
      (paymentStatus === 'UNPAID' && from === 'PAID') ||
      (paymentStatus === 'REFUNDED' && from === 'PAID');
    if (!allowed) {
      throw unprocessable(
        `Não é possível mudar o pagamento de "${PAYMENT_STATUS_LABEL[from]}" para "${PAYMENT_STATUS_LABEL[paymentStatus]}".`,
        undefined,
        'INVALID_PAYMENT_TRANSITION',
      );
    }
    const result = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: from },
      data: { paymentStatus, paidAt: paymentStatus === 'PAID' ? new Date() : paymentStatus === 'UNPAID' ? null : order.paidAt },
    });
    if (result.count === 0) throw conflict('O pagamento foi alterado por outra operação. Recarregue a página.');
    await audit(
      { profileId, action: 'order.payment_change', entityType: 'order', entityId: orderId, metadata: { code: order.code, from, to: paymentStatus, note } },
      tx,
    );
  });
  return getAdminOrder(orderId);
}

/** Expira pedidos pendentes antigos e devolve o estoque. Seguro para rodar em várias instâncias. */
export async function expireStaleOrders(now = new Date()) {
  const settings = await getSettings();
  const cutoff = new Date(now.getTime() - settings.pendingOrderTtlHours * 3_600_000);
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff }, stockReleasedAt: null },
    select: { id: true, code: true, status: true },
    take: 200,
  });
  let expired = 0;
  for (const order of stale) {
    try {
      await prisma.$transaction((tx) =>
        closeOrder(tx, order, 'EXPIRED', null, `Sem atendimento em ${settings.pendingOrderTtlHours} h — reserva liberada automaticamente`),
      );
      expired++;
    } catch (err) {
      if (!(err instanceof AppError && err.status === 409)) logger.error({ err, orderCode: order.code }, 'failed to expire order');
    }
  }
  if (expired > 0) logger.info({ expired }, 'stale orders expired');
  return expired;
}

// ---------------- Consultas do painel ----------------

export async function listAdminOrders(query: z.infer<typeof adminOrdersQuery>) {
  const q = query.q?.trim();
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q.toUpperCase() } },
            { customerName: { contains: q, mode: 'insensitive' } },
            ...(q.replace(/\D/g, '').length >= 4 ? [{ customerPhone: { contains: q.replace(/\D/g, '') } }] : []),
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return paged(
    rows.map((o) => ({
      id: o.id,
      code: o.code,
      createdAt: o.createdAt,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      fulfillment: o.fulfillment,
      itemCount: o._count.items,
      totalCents: o.totalCents,
      status: o.status,
      paymentStatus: o.paymentStatus,
      whatsappOpenedAt: o.whatsappOpenedAt,
    })),
    total,
    query.page,
    query.pageSize,
  );
}

export async function getAdminOrder(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, slug: true, stockQuantity: true } } } },
      statusHistory: { include: { profile: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw notFound('Pedido não encontrado.');
  const paymentEvents = await prisma.auditLog.findMany({
    where: { entityType: 'order', entityId: id, action: 'order.payment_change' },
    include: { profile: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return {
    id: order.id,
    ...toPublicOrder(order),
    customerPhone: order.customerPhone,
    paymentStatusLabel: PAYMENT_STATUS_LABEL[order.paymentStatus],
    acceptedAt: order.acceptedAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    paidAt: order.paidAt,
    stockReleasedAt: order.stockReleasedAt,
    updatedAt: order.updatedAt,
    allowedTransitions: STATUS_TRANSITIONS[order.status],
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productSlug: i.product?.slug ?? null,
      productName: i.productName,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      originalUnitPriceCents: i.originalUnitPriceCents,
      subtotalCents: i.subtotalCents,
    })),
    statusHistory: order.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt,
      user: h.profile,
    })),
    paymentHistory: paymentEvents.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      user: e.profile,
      ...(e.metadata as { from?: string; to?: string; note?: string | null }),
    })),
  };
}
