import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { getSettings } from '../settings/settings.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.');
export const periodQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

/** Pedidos que contam como venda em andamento ou concluída (excluem cancelados/expirados). */
const VALID = Prisma.sql`status NOT IN ('CANCELLED', 'EXPIRED')`;
const ACCEPTED_OR_LATER = Prisma.sql`o.status IN ('ACCEPTED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED')`;

function todayIn(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Resolve o período (datas locais da loja, inclusivas) em instantes [start, end). */
async function resolvePeriod(query: z.infer<typeof periodQuery>) {
  const { timezone } = await getSettings();
  const to = query.to ?? todayIn(timezone);
  const from = query.from ?? addDays(to, -29);
  if (from > to) throw unprocessable('A data inicial deve ser anterior à final.');
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > 366) throw unprocessable('Escolha um período de até 366 dias.');
  const start = Prisma.sql`(${from}::date::timestamp AT TIME ZONE ${timezone})`;
  const end = Prisma.sql`((${to}::date + 1)::timestamp AT TIME ZONE ${timezone})`;
  return { from, to, timezone, start, end, today: todayIn(timezone) };
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export async function summary(query: z.infer<typeof periodQuery>) {
  const p = await resolvePeriod(query);
  const todayStart = Prisma.sql`(${p.today}::date::timestamp AT TIME ZONE ${p.timezone})`;

  const [orders, paid, current, products, today, completedInPeriod] = await Promise.all([
    prisma.$queryRaw<
      { total: bigint; valid: bigint; completed: bigint; cancelled: bigint; expired: bigint; whatsapp: bigint; registered: bigint }[]
    >`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE ${VALID}) AS valid,
             count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
             count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
             count(*) FILTER (WHERE status = 'EXPIRED') AS expired,
             count(*) FILTER (WHERE whatsapp_opened_at IS NOT NULL) AS whatsapp,
             COALESCE(sum(total_cents) FILTER (WHERE ${VALID}), 0)::bigint AS registered
        FROM orders WHERE created_at >= ${p.start} AND created_at < ${p.end}`,
    prisma.$queryRaw<{ count: bigint; revenue: bigint }[]>`
      SELECT count(*) AS count, COALESCE(sum(total_cents), 0)::bigint AS revenue
        FROM orders WHERE payment_status = 'PAID' AND paid_at >= ${p.start} AND paid_at < ${p.end}`,
    prisma.$queryRaw<{ pending: bigint; in_progress: bigint; ready: bigint; out_for_delivery: bigint }[]>`
      SELECT count(*) FILTER (WHERE status = 'PENDING') AS pending,
             count(*) FILTER (WHERE status IN ('ACCEPTED', 'PROCESSING')) AS in_progress,
             count(*) FILTER (WHERE status = 'READY') AS ready,
             count(*) FILTER (WHERE status = 'OUT_FOR_DELIVERY') AS out_for_delivery
        FROM orders WHERE status IN ('PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY')`,
    prisma.$queryRaw<{ total: bigint; active: bigint; low: bigint; out: bigint }[]>`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE is_active) AS active,
             count(*) FILTER (WHERE is_active AND stock_quantity > 0 AND stock_quantity <= min_stock) AS low,
             count(*) FILTER (WHERE is_active AND stock_quantity = 0) AS out
        FROM products`,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM orders WHERE created_at >= ${todayStart}`,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM orders WHERE status = 'COMPLETED' AND completed_at >= ${p.start} AND completed_at < ${p.end}`,
  ]);

  const o = orders[0]!;
  const pay = paid[0]!;
  const lowStockProducts = await prisma.$queryRaw<{ id: string; name: string; stock_quantity: number; min_stock: number }[]>`
    SELECT id, name, stock_quantity, min_stock FROM products
     WHERE is_active AND stock_quantity <= min_stock
     ORDER BY stock_quantity ASC, name ASC LIMIT 8`;
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { id: true, code: true, customerName: true, totalCents: true, status: true, paymentStatus: true, fulfillment: true, createdAt: true },
  });

  return {
    period: { from: p.from, to: p.to, timezone: p.timezone },
    orders: {
      total: n(o.total),
      valid: n(o.valid),
      today: n(today[0]?.count),
      pending: n(current[0]?.pending),
      /** Aceitos ou em separação. */
      inProgress: n(current[0]?.in_progress),
      ready: n(current[0]?.ready),
      outForDelivery: n(current[0]?.out_for_delivery),
      /** Concluídos com data de conclusão dentro do período. */
      completedInPeriod: n(completedInPeriod[0]?.count),
      completed: n(o.completed),
      cancelled: n(o.cancelled),
      expired: n(o.expired),
      whatsappOpened: n(o.whatsapp),
    },
    revenue: {
      /** Somente pedidos marcados como pagos pela loja (data do pagamento no período). */
      confirmedCents: n(pay.revenue),
      paidOrders: n(pay.count),
      averageTicketCents: n(pay.count) > 0 ? Math.round(n(pay.revenue) / n(pay.count)) : 0,
      /** Valor total de pedidos registrados não cancelados — NÃO é receita confirmada. */
      registeredValueCents: n(o.registered),
    },
    products: {
      total: n(products[0]?.total),
      active: n(products[0]?.active),
      lowStock: n(products[0]?.low),
      outOfStock: n(products[0]?.out),
    },
    lowStockProducts: lowStockProducts.map((r) => ({ id: r.id, name: r.name, stockQuantity: r.stock_quantity, minStock: r.min_stock })),
    recentOrders,
  };
}

export async function sales(query: z.infer<typeof periodQuery>) {
  const p = await resolvePeriod(query);
  const rows = await prisma.$queryRaw<{ day: string; orders: bigint; registered: bigint; paid: bigint }[]>`
    WITH days AS (
      SELECT generate_series(${p.from}::date, ${p.to}::date, interval '1 day')::date AS day
    ),
    created AS (
      SELECT (created_at AT TIME ZONE ${p.timezone})::date AS day, count(*) AS orders, sum(total_cents) AS registered
        FROM orders WHERE created_at >= ${p.start} AND created_at < ${p.end} AND ${VALID}
       GROUP BY 1
    ),
    paid AS (
      SELECT (paid_at AT TIME ZONE ${p.timezone})::date AS day, sum(total_cents) AS paid
        FROM orders WHERE payment_status = 'PAID' AND paid_at >= ${p.start} AND paid_at < ${p.end}
       GROUP BY 1
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           COALESCE(c.orders, 0)::bigint AS orders,
           COALESCE(c.registered, 0)::bigint AS registered,
           COALESCE(pd.paid, 0)::bigint AS paid
      FROM days d LEFT JOIN created c ON c.day = d.day LEFT JOIN paid pd ON pd.day = d.day
     ORDER BY d.day`;
  return {
    period: { from: p.from, to: p.to, timezone: p.timezone },
    items: rows.map((r) => ({ date: r.day, orders: n(r.orders), registeredCents: n(r.registered), paidCents: n(r.paid) })),
  };
}

export async function topProducts(query: z.infer<typeof periodQuery>) {
  const p = await resolvePeriod(query);
  const rows = await prisma.$queryRaw<{ product_id: string | null; name: string; quantity: bigint; revenue: bigint; orders: bigint }[]>`
    SELECT oi.product_id, max(oi.product_name) AS name, sum(oi.quantity)::bigint AS quantity,
           sum(oi.subtotal_cents)::bigint AS revenue, count(DISTINCT oi.order_id)::bigint AS orders
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${ACCEPTED_OR_LATER} AND o.created_at >= ${p.start} AND o.created_at < ${p.end}
     GROUP BY oi.product_id, CASE WHEN oi.product_id IS NULL THEN oi.product_name END
     ORDER BY quantity DESC, revenue DESC
     LIMIT 10`;
  return {
    period: { from: p.from, to: p.to, timezone: p.timezone },
    criteria: 'Itens de pedidos aceitos, em andamento ou concluídos no período.',
    items: rows.map((r) => ({ productId: r.product_id, name: r.name, quantity: n(r.quantity), valueCents: n(r.revenue), orders: n(r.orders) })),
  };
}
