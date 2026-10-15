import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { expireStaleOrders } from '../src/modules/orders/orders.service.js';
import { api, createAdmin, createProduct, idemKey, makeApp, orderBody, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let admin: AdminCtx;

async function placeOrder(productId: string, quantity = 2) {
  const res = await api(app)
    .post('/api/v1/orders')
    .set('Idempotency-Key', idemKey())
    .send(orderBody([{ productId, quantity }]));
  expect(res.status).toBe(201);
  return prisma.order.findUniqueOrThrow({ where: { code: res.body.order.code } });
}
const setStatus = (id: string, status: string, note?: string) =>
  api(app).patch(`/api/v1/admin/orders/${id}/status`).set('Authorization', admin.auth).send({ status, note });
const setPayment = (id: string, paymentStatus: string) =>
  api(app).patch(`/api/v1/admin/orders/${id}/payment`).set('Authorization', admin.auth).send({ paymentStatus });
const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQuantity;

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
});

describe('status do pedido', () => {
  it('segue o fluxo de atendimento e registra histórico com usuário', async () => {
    const p = await createProduct({ stock: 5 });
    const order = await placeOrder(p.id);
    for (const status of ['ACCEPTED', 'PROCESSING', 'READY', 'COMPLETED']) {
      const res = await setStatus(order.id, status);
      expect(res.status, status).toBe(200);
    }
    const detail = await api(app).get(`/api/v1/admin/orders/${order.id}`).set('Authorization', admin.auth);
    expect(detail.body.status).toBe('COMPLETED');
    expect(detail.body.acceptedAt).toBeTruthy();
    expect(detail.body.completedAt).toBeTruthy();
    expect(detail.body.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'COMPLETED']);
    expect(detail.body.statusHistory[1].user.id).toBe(admin.profile.id);
    expect(detail.body.paymentStatus).toBe('UNPAID'); // concluir não marca como pago
    expect(await stockOf(p.id)).toBe(3); // estoque segue baixado
    expect(await prisma.auditLog.count({ where: { action: 'order.status_change' } })).toBe(4);
  });

  it('bloqueia transições inválidas', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    const res = await setStatus(order.id, 'COMPLETED');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    await setStatus(order.id, 'CANCELLED');
    expect((await setStatus(order.id, 'ACCEPTED')).status).toBe(422);
  });

  it('cancelamento devolve o estoque uma única vez', async () => {
    const p = await createProduct({ stock: 5 });
    const order = await placeOrder(p.id, 2);
    expect(await stockOf(p.id)).toBe(3);
    expect((await setStatus(order.id, 'CANCELLED', 'Cliente desistiu')).status).toBe(200);
    expect(await stockOf(p.id)).toBe(5);
    expect((await setStatus(order.id, 'CANCELLED')).status).toBe(422);
    expect(await stockOf(p.id)).toBe(5);
    const releases = await prisma.inventoryMovement.findMany({ where: { orderId: order.id, type: 'ORDER_RELEASE' } });
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ quantity: 2, balanceBefore: 3, balanceAfter: 5, profileId: admin.profile.id });
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ status: 'CANCELLED', cancelReason: 'Cliente desistiu' });
    expect(saved.stockReleasedAt).not.toBeNull();
  });

  it('cancelamentos simultâneos não devolvem estoque em dobro', async () => {
    const p = await createProduct({ stock: 5 });
    const order = await placeOrder(p.id, 2);
    const results = await Promise.all(Array.from({ length: 6 }, () => setStatus(order.id, 'CANCELLED')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await stockOf(p.id)).toBe(5);
    expect(await prisma.inventoryMovement.count({ where: { orderId: order.id, type: 'ORDER_RELEASE' } })).toBe(1);
  });

  it('cancelar pedido de produto excluído/alterado preserva o histórico do item', async () => {
    const p = await createProduct({ name: 'Nome original', priceCents: 1_000, stock: 5 });
    const order = await placeOrder(p.id, 1);
    await prisma.product.update({ where: { id: p.id }, data: { name: 'Nome novo', priceCents: 9_999 } });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item).toMatchObject({ productName: 'Nome original', unitPriceCents: 1_000 });
  });
});

describe('expiração de pedidos abandonados', () => {
  it('expira pendentes antigos, libera o estoque e é idempotente', async () => {
    const p = await createProduct({ stock: 5 });
    const old = await placeOrder(p.id, 2);
    const recent = await placeOrder(p.id, 1);
    await prisma.order.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 49 * 3_600_000) } });
    expect(await stockOf(p.id)).toBe(2);

    const [a, b] = await Promise.all([expireStaleOrders(), expireStaleOrders()]);
    expect(a + b).toBe(1);
    expect(await expireStaleOrders()).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('EXPIRED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe('PENDING');
    expect(await stockOf(p.id)).toBe(4);
  });

  it('não expira pedidos já aceitos', async () => {
    const p = await createProduct({ stock: 5 });
    const order = await placeOrder(p.id, 1);
    await setStatus(order.id, 'ACCEPTED');
    await prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 100 * 3_600_000) } });
    expect(await expireStaleOrders()).toBe(0);
  });
});

describe('pagamento', () => {
  it('é registrado manualmente e separado do status', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    const paid = await setPayment(order.id, 'PAID');
    expect(paid.status).toBe(200);
    expect(paid.body.paymentStatus).toBe('PAID');
    expect(paid.body.paidAt).toBeTruthy();
    expect(paid.body.status).toBe('PENDING');
    expect(paid.body.paymentHistory).toHaveLength(1);
    expect((await setPayment(order.id, 'PAID')).status).toBe(422);
    expect((await setPayment(order.id, 'REFUNDED')).body.paymentStatus).toBe('REFUNDED');
  });

  it('não permite marcar como pago um pedido cancelado', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, 'CANCELLED');
    expect((await setPayment(order.id, 'PAID')).status).toBe(422);
  });
});

describe('listagem e dashboard', () => {
  it('filtra pedidos por status, código e cliente', async () => {
    const p = await createProduct({ stock: 50 });
    const a = await placeOrder(p.id);
    await placeOrder(p.id);
    await setStatus(a.id, 'ACCEPTED');
    const byStatus = await api(app).get('/api/v1/admin/orders?status=ACCEPTED').set('Authorization', admin.auth);
    expect(byStatus.body.total).toBe(1);
    const byCode = await api(app).get(`/api/v1/admin/orders?q=${a.code.toLowerCase()}`).set('Authorization', admin.auth);
    expect(byCode.body.items[0].code).toBe(a.code);
    const byName = await api(app).get('/api/v1/admin/orders?q=maria').set('Authorization', admin.auth);
    expect(byName.body.total).toBe(2);
  });

  it('dashboard: faturamento conta apenas pedidos pagos', async () => {
    const p = await createProduct({ priceCents: 10_000, stock: 50 });
    const paid = await placeOrder(p.id, 1); // R$ 100
    await placeOrder(p.id, 3); // R$ 300 registrado, não pago
    const cancelled = await placeOrder(p.id, 2);
    await setStatus(cancelled.id, 'CANCELLED');
    await setStatus(paid.id, 'ACCEPTED');
    await setPayment(paid.id, 'PAID');

    const res = await api(app).get('/api/v1/admin/dashboard/summary').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toEqual({ confirmedCents: 10_000, paidOrders: 1, averageTicketCents: 10_000, registeredValueCents: 40_000 });
    expect(res.body.orders).toMatchObject({ total: 3, valid: 2, today: 3, pending: 1, inProgress: 1, cancelled: 1 });

    const sales = await api(app).get('/api/v1/admin/dashboard/sales').set('Authorization', admin.auth);
    expect(sales.body.items).toHaveLength(30);
    const totals = sales.body.items.reduce(
      (acc: { orders: number; paid: number }, d: { orders: number; paidCents: number }) => ({ orders: acc.orders + d.orders, paid: acc.paid + d.paidCents }),
      { orders: 0, paid: 0 },
    );
    expect(totals).toEqual({ orders: 2, paid: 10_000 });

    const top = await api(app).get('/api/v1/admin/dashboard/top-products').set('Authorization', admin.auth);
    expect(top.body.items).toEqual([{ productId: p.id, name: p.name, quantity: 1, valueCents: 10_000, orders: 1 }]);
  });

  it('dashboard vazio não inventa números', async () => {
    const res = await api(app).get('/api/v1/admin/dashboard/summary').set('Authorization', admin.auth);
    expect(res.body.revenue).toEqual({ confirmedCents: 0, paidOrders: 0, averageTicketCents: 0, registeredValueCents: 0 });
    expect(res.body.recentOrders).toEqual([]);
  });

  it('dashboard valida o período', async () => {
    const res = await api(app).get('/api/v1/admin/dashboard/summary?from=2026-05-10&to=2026-05-01').set('Authorization', admin.auth);
    expect(res.status).toBe(422);
  });
});
