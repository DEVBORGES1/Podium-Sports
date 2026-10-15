import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { firstName, whatsappNumber } from '../src/modules/orders/orders.messages.js';
import { api, createAdmin, createProduct, idemKey, makeApp, orderBody, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let admin: AdminCtx;

const DELIVERY = {
  fulfillment: 'DELIVERY',
  address: { street: 'Rua das Flores', number: '100', district: 'Centro', city: 'Videira' },
  customer: { name: 'João Vitor Cliente', phone: '(49) 99999-1234' },
};

async function placeOrder(productId: string, extra: Record<string, unknown> = {}) {
  const res = await api(app)
    .post('/api/v1/orders')
    .set('Idempotency-Key', idemKey())
    .send(orderBody([{ productId, quantity: 1 }], extra));
  expect(res.status).toBe(201);
  return prisma.order.findUniqueOrThrow({ where: { code: res.body.order.code } });
}
const setStatus = (id: string, body: Record<string, unknown>, auth = admin.auth) =>
  api(app).patch(`/api/v1/admin/orders/${id}/status`).set('Authorization', auth).send(body);
const detail = (id: string) => api(app).get(`/api/v1/admin/orders/${id}`).set('Authorization', admin.auth);

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
});

describe('etapas por modalidade', () => {
  it('entrega passa por "Saiu para entrega" e o estoque continua reservado', async () => {
    const p = await createProduct({ stock: 5 });
    const order = await placeOrder(p.id, DELIVERY);
    for (const status of ['ACCEPTED', 'PROCESSING', 'READY']) expect((await setStatus(order.id, { status })).status, status).toBe(200);
    const ready = await detail(order.id);
    expect(ready.body.allowedTransitions).toEqual(['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']);
    expect(ready.body.statusLabel).toBe('Pronto para envio');

    expect((await setStatus(order.id, { status: 'OUT_FOR_DELIVERY' })).status).toBe(200);
    const inventory = await api(app)
      .get(`/api/v1/admin/inventory?q=${encodeURIComponent(p.name)}`)
      .set('Authorization', admin.auth);
    expect(inventory.body.items[0].reservedInOpenOrders).toBe(1);

    // Cancelar depois de sair para entrega (entrega frustrada) devolve o estoque.
    expect((await setStatus(order.id, { status: 'CANCELLED', note: 'Cliente ausente' })).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(5);
  });

  it('retirada não aceita "Saiu para entrega"', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, { status: 'ACCEPTED' });
    await setStatus(order.id, { status: 'READY' });
    const ready = await detail(order.id);
    expect(ready.body.allowedTransitions).toEqual(['COMPLETED', 'CANCELLED']);
    expect(ready.body.statusLabel).toBe('Pronto para retirada');
    const res = await setStatus(order.id, { status: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('pedido concluído não volta para nenhuma etapa', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, { status: 'ACCEPTED' });
    await setStatus(order.id, { status: 'COMPLETED' });
    for (const status of ['ACCEPTED', 'PROCESSING', 'READY', 'CANCELLED']) {
      expect((await setStatus(order.id, { status })).status, status).toBe(422);
    }
  });
});

describe('concorrência entre administradores', () => {
  it('recusa a ação baseada em uma tela desatualizada (expectedStatus)', async () => {
    const other = await createAdmin();
    const p = await createProduct({ stock: 3 });
    const order = await placeOrder(p.id);
    // A aceita o pedido; B ainda vê "PENDING" e tenta cancelar.
    expect((await setStatus(order.id, { status: 'ACCEPTED', expectedStatus: 'PENDING' })).status).toBe(200);
    const stale = await setStatus(order.id, { status: 'CANCELLED', note: 'Sem estoque', expectedStatus: 'PENDING' }, other.auth);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('ORDER_STATE_CHANGED');
    expect(stale.body.error.details.current).toBe('ACCEPTED');
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.status).toBe('ACCEPTED');
    expect(saved.stockReleasedAt).toBeNull();
  });

  it('duas aceitações simultâneas: só uma é registrada', async () => {
    const other = await createAdmin();
    const p = await createProduct();
    const order = await placeOrder(p.id);
    const results = await Promise.all([
      setStatus(order.id, { status: 'ACCEPTED', expectedStatus: 'PENDING' }),
      setStatus(order.id, { status: 'ACCEPTED', expectedStatus: 'PENDING' }, other.auth),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409].sort());
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'ACCEPTED' } })).toBe(1);
  });
});

describe('mensagens de atualização para o cliente', () => {
  it('sugere a mensagem do status atual com o número e o pedido corretos', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id, DELIVERY);
    const pending = await detail(order.id);
    expect(pending.body.customerMessage).toBeNull(); // pedido novo: o cliente acabou de enviar

    await setStatus(order.id, { status: 'ACCEPTED' });
    const accepted = await detail(order.id);
    const msg = accepted.body.customerMessage;
    expect(msg.status).toBe('ACCEPTED');
    expect(msg.text).toBe(`Olá, João! Seu pedido ${order.code} foi aceito e já estamos separando tudo. Obrigado pela preferência!`);
    const url = new URL(msg.whatsappUrl);
    expect(url.origin + url.pathname).toBe('https://wa.me/5549999991234');
    expect(url.searchParams.get('text')).toBe(msg.text); // codificação ida e volta
    expect(msg.alreadyOpened).toBe(false);
    // Mudar o status não "envia" nada nem cria registros de mensagem.
    expect(await prisma.orderMessage.count()).toBe(0);
  });

  it('usa a mensagem certa para retirada e para entrega', async () => {
    const p = await createProduct({ stock: 5 });
    const pickup = await placeOrder(p.id);
    const delivery = await placeOrder(p.id, DELIVERY);
    for (const o of [pickup, delivery]) {
      await setStatus(o.id, { status: 'ACCEPTED' });
      await setStatus(o.id, { status: 'READY' });
    }
    expect((await detail(pickup.id)).body.customerMessage.text).toContain('pronto para retirada');
    expect((await detail(delivery.id)).body.customerMessage.text).toContain('logo sairá para entrega');
    await setStatus(delivery.id, { status: 'OUT_FOR_DELIVERY' });
    expect((await detail(delivery.id)).body.customerMessage.text).toContain('saiu para entrega');
  });

  it('cancelamento não promete nada além do contato', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, { status: 'CANCELLED', note: 'Cliente desistiu' });
    const text = (await detail(order.id)).body.customerMessage.text as string;
    expect(text).toContain('Houve um cancelamento');
    expect(text).not.toMatch(/reembolso|estorno|devolvemos/i);
  });

  it('abrir o WhatsApp registra "aberto" (não "enviado") e cliques repetidos não duplicam', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, { status: 'ACCEPTED' });
    const open = () => api(app).post(`/api/v1/admin/orders/${order.id}/messages`).set('Authorization', admin.auth).send({ status: 'ACCEPTED' });
    const [a, b] = await Promise.all([open(), open()]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5549999991234\?text=/);
    expect(await prisma.orderMessage.count({ where: { orderId: order.id } })).toBe(1);
    const row = await prisma.orderMessage.findFirstOrThrow({ where: { orderId: order.id } });
    expect(row.openCount).toBe(2);
    expect(row.confirmedAt).toBeNull();

    const d = await detail(order.id);
    expect(d.body.customerMessage.alreadyOpened).toBe(true);
    expect(d.body.messages).toHaveLength(1);
    expect(d.body.messages[0]).toMatchObject({ state: 'WHATSAPP_OPENED', openCount: 2, lastOpenedBy: { id: admin.profile.id } });
    expect(await prisma.auditLog.count({ where: { action: 'order.message_opened' } })).toBe(2);
  });

  it('recusa abrir mensagem de um status que não é o atual', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, { status: 'ACCEPTED' });
    await setStatus(order.id, { status: 'PROCESSING' });
    const res = await api(app).post(`/api/v1/admin/orders/${order.id}/messages`).set('Authorization', admin.auth).send({ status: 'ACCEPTED' });
    expect(res.status).toBe(409);
    expect(await prisma.orderMessage.count()).toBe(0);
  });

  it('confirmação manual do envio é registrada uma única vez, com o responsável', async () => {
    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, { status: 'ACCEPTED' });
    const opened = await api(app).post(`/api/v1/admin/orders/${order.id}/messages`).set('Authorization', admin.auth).send({ status: 'ACCEPTED' });
    const id = opened.body.message.id as string;
    const confirm = () => api(app).post(`/api/v1/admin/orders/${order.id}/messages/${id}/confirm`).set('Authorization', admin.auth);
    const first = await confirm();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ state: 'CONFIRMED_BY_STAFF', confirmedBy: { id: admin.profile.id } });
    const firstAt = first.body.confirmedAt;
    const again = await confirm();
    expect(again.body.confirmedAt).toBe(firstAt);
    expect(await prisma.auditLog.count({ where: { action: 'order.message_confirmed' } })).toBe(1);
  });

  it('mensagens personalizadas nas configurações valem para o painel e não aparecem na loja', async () => {
    const settings = await api(app).get('/api/v1/admin/store/settings').set('Authorization', admin.auth);
    const content = {
      ...settings.body.content,
      customerMessages: { ...settings.body.content.customerMessages, accepted: 'Oi {nome}, a {loja} aceitou o pedido {pedido}!' },
    };
    expect((await api(app).patch('/api/v1/admin/store/settings').set('Authorization', admin.auth).send({ content })).status).toBe(200);

    const p = await createProduct();
    const order = await placeOrder(p.id);
    await setStatus(order.id, { status: 'ACCEPTED' });
    expect((await detail(order.id)).body.customerMessage.text).toBe(`Oi Maria, a Podium Sports aceitou o pedido ${order.code}!`);

    const publicSettings = await api(app).get('/api/v1/store/settings');
    expect(publicSettings.status).toBe(200);
    expect(publicSettings.body.content.customerMessages).toBeUndefined();
  });

  it('normaliza o número do cliente para o formato do wa.me', () => {
    expect(whatsappNumber('(49) 99999-1234')).toBe('5549999991234');
    expect(whatsappNumber('4933334444')).toBe('554933334444');
    expect(whatsappNumber('5549999991234')).toBe('5549999991234');
    expect(firstName('  Ana   Paula Souza ')).toBe('Ana');
  });
});

describe('novidades para o painel (consulta periódica)', () => {
  const live = (since?: string) =>
    api(app)
      .get('/api/v1/admin/orders/live')
      .query(since ? { since } : {})
      .set('Authorization', admin.auth);

  it('primeira consulta só devolve a janela de sobreposição; as seguintes trazem os pedidos novos', async () => {
    const p = await createProduct({ stock: 10 });
    const old = await placeOrder(p.id);
    await prisma.order.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 3 * 3_600_000) } });

    const first = await live();
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body.counts.PENDING).toBe(1);
    expect(first.body.recentOrders.map((o: { id: string }) => o.id)).not.toContain(old.id); // pedido antigo não é "novo"

    const fresh = await placeOrder(p.id);
    const second = await live(first.body.serverTime);
    expect(second.body.counts.PENDING).toBe(2);
    expect(second.body.recentOrders.map((o: { id: string }) => o.id)).toEqual([fresh.id]);
    expect(second.body.recentOrders[0]).toMatchObject({ code: fresh.code, status: 'PENDING' });
    expect(Object.keys(second.body.recentOrders[0]).sort()).toEqual(['code', 'createdAt', 'customerName', 'fulfillment', 'id', 'status', 'totalCents']);
    expect(new Date(second.body.lastChangeAt).getTime()).toBeGreaterThanOrEqual(new Date(fresh.updatedAt).getTime());
  });

  it('valida o parâmetro since', async () => {
    expect((await live('ontem')).status).toBe(400);
  });

  it('lista filtra por vários status e traz as ações válidas de cada pedido', async () => {
    const p = await createProduct({ stock: 10 });
    const a = await placeOrder(p.id);
    const b = await placeOrder(p.id, DELIVERY);
    await placeOrder(p.id);
    await setStatus(a.id, { status: 'ACCEPTED' });
    await setStatus(b.id, { status: 'ACCEPTED' });
    await setStatus(b.id, { status: 'PROCESSING' });
    const res = await api(app).get('/api/v1/admin/orders?status=ACCEPTED,PROCESSING').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const byId = Object.fromEntries(res.body.items.map((o: { id: string }) => [o.id, o]));
    expect(byId[a.id].allowedTransitions).toEqual(['PROCESSING', 'READY', 'COMPLETED', 'CANCELLED']);
    expect(byId[b.id].itemsPreview).toEqual([{ productName: p.name, variantLabel: null, quantity: 1 }]);
    expect((await api(app).get('/api/v1/admin/orders?status=ACCEPTED,XYZ').set('Authorization', admin.auth)).status).toBe(400);
  });
});
