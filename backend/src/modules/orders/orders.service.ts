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
import { getSettings, readContent } from '../settings/settings.service.js';
import { allowedTransitions, OPEN_ORDER_STATUSES, ORDER_STATUS_LABEL, orderStatusLabel, PAYMENT_STATUS_LABEL } from './orders.labels.js';
import { buildCustomerMessage, type MESSAGE_STATUSES, whatsappLink } from './orders.messages.js';
import type { adminOrdersQuery, createOrderSchema, quoteSchema, updateStatusSchema } from './orders.schemas.js';

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

interface CartLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

const lineKey = (i: { productId: string | null; variantId: string | null }) => `${i.productId}:${i.variantId ?? ''}`;

/** Soma quantidades repetidas do mesmo produto (e da mesma variação). */
function mergeItems(items: CartLine[]): CartLine[] {
  const map = new Map<string, CartLine>();
  for (const i of items) {
    const key = lineKey(i);
    const current = map.get(key);
    map.set(key, { productId: i.productId, variantId: i.variantId, quantity: (current?.quantity ?? 0) + i.quantity });
  }
  return [...map.values()];
}

async function loadProducts(ids: string[], now: Date) {
  const products = await prisma.product.findMany({ where: { id: { in: [...new Set(ids)] } }, include: productInclude(now) });
  return new Map(products.map((p) => [p.id, p]));
}

type LineIssue = 'NOT_FOUND' | 'UNAVAILABLE' | 'VARIANT_REQUIRED' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'QUANTITY_LIMIT' | null;

/** Variação pedida (quando o produto tem variações) e o estoque que vale para a linha. */
function lineStock(product: ProductWithRelations, variantId: string | null) {
  if (product.variants.length === 0) return variantId ? null : { variant: null, stock: product.stockQuantity };
  const variant = variantId ? product.variants.find((v) => v.id === variantId && v.isActive) : undefined;
  return variant ? { variant, stock: variant.stockQuantity } : null;
}

function lineIssue(product: ProductWithRelations | undefined, variantId: string | null, quantity: number): LineIssue {
  if (!product) return 'NOT_FOUND';
  const parent = product.category.parent;
  if (!product.isActive || !product.category.isActive || (parent && !parent.isActive)) return 'UNAVAILABLE';
  if (product.variants.length > 0 && !variantId) return 'VARIANT_REQUIRED';
  const line = lineStock(product, variantId);
  if (!line) return 'UNAVAILABLE';
  if (line.stock <= 0) return 'OUT_OF_STOCK';
  if (quantity > MAX_QUANTITY_PER_ITEM) return 'QUANTITY_LIMIT';
  if (quantity > line.stock) return 'INSUFFICIENT_STOCK';
  return null;
}

/** Texto da variação gravado no pedido (ex.: "Tamanho: 40"). */
const variantText = (product: ProductWithRelations, label: string) => `${product.variantType ?? 'Opção'}: ${label}`;

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
  const lines = items.map(({ productId, variantId, quantity }) => {
    const product = products.get(productId);
    const issue = lineIssue(product, variantId, quantity);
    if (!product || issue === 'NOT_FOUND' || issue === 'UNAVAILABLE') {
      return { productId, variantId, quantity, issue, name: product?.name ?? null, available: false };
    }
    const price = priceOf(product, now);
    const stock = lineStock(product, variantId);
    const maxQuantity = Math.max(0, Math.min(stock?.stock ?? 0, MAX_QUANTITY_PER_ITEM));
    const available = issue === null;
    if (available) {
      subtotal += price.regularPriceCents * quantity;
      total += price.priceCents * quantity;
    }
    const image = product.images[0];
    return {
      productId,
      variantId,
      variantLabel: stock?.variant ? variantText(product, stock.variant.label) : null,
      quantity,
      issue,
      available,
      name: product.name,
      slug: product.slug,
      imageUrl: mediaUrl(image?.thumbPath ?? image?.storagePath),
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
    statusLabel: orderStatusLabel(order.status, order.fulfillment),
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
      variantLabel: i.variantLabel,
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

function sameItems(order: OrderWithItems, items: CartLine[]) {
  const a = order.items
    .map((i) => `${lineKey(i)}:${i.quantity}`)
    .sort()
    .join(',');
  const b = items
    .map((i) => `${lineKey(i)}:${i.quantity}`)
    .sort()
    .join(',');
  return a === b;
}

async function replayIdempotent(idempotencyKey: string, items: CartLine[]) {
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
    .map((i) => ({ ...i, issue: lineIssue(products.get(i.productId), i.variantId, i.quantity), product: products.get(i.productId) }))
    .filter((p) => p.issue !== null);
  if (problems.length > 0) {
    throw unprocessable(
      'Alguns itens da sacola não estão disponíveis. Revise a sacola.',
      problems.map((p) => ({
        productId: p.productId,
        variantId: p.variantId,
        name: p.product?.name ?? null,
        issue: p.issue,
        available: p.product ? Math.max(0, lineStock(p.product, p.variantId)?.stock ?? 0) : 0,
      })),
      'ITEMS_UNAVAILABLE',
    );
  }

  const lines = items.map(({ productId, variantId, quantity }) => {
    const product = products.get(productId)!;
    const price = priceOf(product, now);
    const variant = lineStock(product, variantId)?.variant ?? null;
    return {
      productId,
      variantId: variant?.id ?? null,
      variantLabel: variant ? variantText(product, variant.label) : null,
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
        // Ordem fixa por produto (e variação) evita deadlock entre pedidos simultâneos.
        for (const line of [...lines].sort((a, b) => lineKey(a).localeCompare(lineKey(b)))) {
          await applyStockChange(tx, {
            productId: line.productId,
            variantId: line.variantId,
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
  const allowedFrom: OrderStatus[] = toStatus === 'EXPIRED' ? ['PENDING'] : [...OPEN_ORDER_STATUSES];
  const result = await tx.order.updateMany({
    where: { id: order.id, status: { in: allowedFrom }, stockReleasedAt: null },
    data: { status: toStatus, cancelledAt: now, cancelReason: reason, stockReleasedAt: now },
  });
  if (result.count === 0) {
    throw conflict('O pedido foi alterado por outra operação ou não pode mais ser cancelado.', undefined, 'ORDER_STATE_CHANGED');
  }
  const items = await tx.orderItem.findMany({ where: { orderId: order.id, productId: { not: null } } });
  for (const item of items.sort((a, b) => lineKey(a).localeCompare(lineKey(b)))) {
    // Variação excluída depois do pedido (o produto deixou de ter variações): volta para o estoque único.
    await applyStockChange(tx, {
      productId: item.productId!,
      variantId: item.variantId,
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

export async function updateOrderStatus(orderId: string, input: z.infer<typeof updateStatusSchema>, profileId: string) {
  const { status: toStatus, note, expectedStatus } = input;
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Pedido não encontrado.');
    if (expectedStatus && order.status !== expectedStatus) {
      // Outra pessoa (ou outra aba) alterou o pedido depois que a tela foi carregada.
      throw conflict(
        `O pedido ${order.code} já está como "${orderStatusLabel(order.status, order.fulfillment)}". A tela foi atualizada — confira antes de continuar.`,
        { current: order.status },
        'ORDER_STATE_CHANGED',
      );
    }
    const allowed = allowedTransitions(order.status, order.fulfillment);
    if (!allowed.includes(toStatus)) {
      throw unprocessable(
        `Não é possível mudar de "${orderStatusLabel(order.status, order.fulfillment)}" para "${orderStatusLabel(toStatus, order.fulfillment)}".`,
        { from: order.status, to: toStatus, allowed },
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
      {
        profileId,
        action: 'order.status_change',
        entityType: 'order',
        entityId: orderId,
        metadata: { code: order.code, from: order.status, to: toStatus, note },
      },
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
    ...(query.status ? { status: { in: query.status } } : {}),
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
      include: {
        _count: { select: { items: true } },
        items: { select: { productName: true, variantLabel: true, quantity: true }, orderBy: { subtotalCents: 'desc' }, take: 3 },
      },
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
      itemsPreview: o.items,
      totalCents: o.totalCents,
      status: o.status,
      statusLabel: orderStatusLabel(o.status, o.fulfillment),
      paymentStatus: o.paymentStatus,
      whatsappOpenedAt: o.whatsappOpenedAt,
      updatedAt: o.updatedAt,
      allowedTransitions: allowedTransitions(o.status, o.fulfillment),
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
      messages: { include: MESSAGE_INCLUDE, orderBy: { openedAt: 'asc' } },
    },
  });
  if (!order) throw notFound('Pedido não encontrado.');
  const settings = await getSettings();
  const suggestion = buildCustomerMessage(order, readContent(settings.content).customerMessages, settings.storeName);
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
    allowedTransitions: allowedTransitions(order.status, order.fulfillment),
    /** Mensagem sugerida para o status atual. Abrir o link NÃO envia nada: a loja revisa e envia no WhatsApp. */
    customerMessage: suggestion
      ? {
          ...suggestion,
          whatsappUrl: whatsappLink(order.customerPhone, suggestion.text),
          alreadyOpened: order.messages.some((m) => m.status === suggestion.status),
        }
      : null,
    messages: order.messages.map(toMessageEntry),
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productSlug: i.product?.slug ?? null,
      productName: i.productName,
      variantId: i.variantId,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      originalUnitPriceCents: i.originalUnitPriceCents,
      subtotalCents: i.subtotalCents,
    })),
    statusHistory: order.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      toStatusLabel: orderStatusLabel(h.toStatus, order.fulfillment),
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

// ---------------- Comunicação com o cliente ----------------

const MESSAGE_INCLUDE = {
  lastOpenedBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
} satisfies Prisma.OrderMessageInclude;

type MessageRow = Prisma.OrderMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/**
 * Situação comprovável de cada mensagem: com link wa.me o sistema só sabe que o WhatsApp foi aberto.
 * "CONFIRMED_BY_STAFF" é a declaração de quem enviou — não é confirmação de entrega pelo WhatsApp.
 */
function toMessageEntry(m: MessageRow) {
  return {
    id: m.id,
    status: m.status,
    channel: m.channel,
    body: m.body,
    state: m.confirmedAt ? ('CONFIRMED_BY_STAFF' as const) : ('WHATSAPP_OPENED' as const),
    openCount: m.openCount,
    openedAt: m.openedAt,
    lastOpenedAt: m.lastOpenedAt,
    lastOpenedBy: m.lastOpenedBy,
    confirmedAt: m.confirmedAt,
    confirmedBy: m.confirmedBy,
  };
}

/**
 * Registra que a loja abriu o WhatsApp com a mensagem do status atual.
 * Uma linha por pedido e status (índice único): cliques repetidos apenas incrementam o contador.
 */
export async function openCustomerMessage(orderId: string, status: (typeof MESSAGE_STATUSES)[number], profileId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Pedido não encontrado.');
  if (order.status !== status) {
    throw conflict(
      `O pedido está como "${orderStatusLabel(order.status, order.fulfillment)}". Atualize a tela para ver a mensagem correta.`,
      { current: order.status },
      'ORDER_STATE_CHANGED',
    );
  }
  const settings = await getSettings();
  const message = buildCustomerMessage(order, readContent(settings.content).customerMessages, settings.storeName);
  if (!message) throw unprocessable('Não há mensagem de atualização para este status.', undefined, 'NO_MESSAGE_FOR_STATUS');

  const now = new Date();
  const saved = await prisma.$transaction(async (tx) => {
    // INSERT … ON CONFLICT é atômico: cliques simultâneos não colidem no índice único (pedido, status).
    const [upserted] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO order_messages (id, order_id, status, body, last_opened_by_id, opened_at, last_opened_at)
      VALUES (gen_random_uuid(), ${orderId}::uuid, ${status}::"OrderStatus", ${message.text}, ${profileId}::uuid, ${now}, ${now})
      ON CONFLICT (order_id, status) DO UPDATE
        SET open_count = order_messages.open_count + 1,
            body = EXCLUDED.body,
            last_opened_at = EXCLUDED.last_opened_at,
            last_opened_by_id = EXCLUDED.last_opened_by_id
      RETURNING id`;
    const row = await tx.orderMessage.findUniqueOrThrow({ where: { id: upserted!.id }, include: MESSAGE_INCLUDE });
    await audit(
      {
        profileId,
        action: 'order.message_opened',
        entityType: 'order',
        entityId: orderId,
        metadata: { code: order.code, status, channel: row.channel, openCount: row.openCount },
      },
      tx,
    );
    return row;
  });
  return { message: toMessageEntry(saved), whatsappUrl: whatsappLink(order.customerPhone, message.text) };
}

/** Quem enviou declara que a mensagem foi enviada pelo WhatsApp (registro manual, feito uma única vez). */
export async function confirmCustomerMessage(orderId: string, messageId: string, profileId: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.orderMessage.findFirst({ where: { id: messageId, orderId } });
    if (!row) throw notFound('Mensagem não encontrada.');
    if (!row.confirmedAt) {
      const result = await tx.orderMessage.updateMany({
        where: { id: messageId, confirmedAt: null },
        data: { confirmedAt: new Date(), confirmedById: profileId },
      });
      if (result.count > 0) {
        await audit({ profileId, action: 'order.message_confirmed', entityType: 'order', entityId: orderId, metadata: { status: row.status } }, tx);
      }
    }
    return toMessageEntry(await tx.orderMessage.findUniqueOrThrow({ where: { id: messageId }, include: MESSAGE_INCLUDE }));
  });
}

// ---------------- Novidades para o painel (consulta periódica) ----------------

/**
 * Janela de sobreposição: um pedido pode ficar visível alguns instantes depois do seu created_at
 * (a transação ainda não tinha sido confirmada). O painel descarta os repetidos pelo id.
 */
export const LIVE_OVERLAP_MS = 2 * 60_000;
const LIVE_MAX_LOOKBACK_MS = 24 * 3_600_000;
const ALL_STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

/**
 * Resumo leve consultado a cada poucos segundos pelo painel: contagem por status, momento da última
 * alteração e os pedidos criados desde a última consulta (com sobreposição). Sem "since", devolve os
 * pedidos da janela de sobreposição para o painel marcá-los como já conhecidos (não tocam alerta).
 */
export async function ordersLive(since: Date | undefined) {
  const now = new Date();
  const reference = since && since.getTime() <= now.getTime() ? since : now;
  const from = new Date(Math.max(reference.getTime() - LIVE_OVERLAP_MS, now.getTime() - LIVE_MAX_LOOKBACK_MS));
  const [groups, latest, recent] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.order.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, code: true, customerName: true, fulfillment: true, totalCents: true, status: true, createdAt: true },
    }),
  ]);
  const counts = Object.fromEntries(ALL_STATUSES.map((st) => [st, 0])) as Record<OrderStatus, number>;
  for (const g of groups) counts[g.status] = g._count._all;
  return { serverTime: now, counts, lastChangeAt: latest?.updatedAt ?? null, recentOrders: recent };
}
