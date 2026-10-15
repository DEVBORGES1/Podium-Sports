import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { api, createProduct, idemKey, makeApp, orderBody, resetDb } from './helpers.js';

const app = makeApp();
const post = (body: unknown, key = idemKey()) =>
  api(app)
    .post('/api/v1/orders')
    .set('Idempotency-Key', key)
    .send(body as object);

beforeEach(resetDb);

describe('POST /orders', () => {
  it('calcula os valores no servidor ignorando preços enviados pelo cliente', async () => {
    const p = await createProduct({ priceCents: 59_900, salePriceCents: 39_990, stock: 5 });
    const res = await post({
      ...orderBody([{ productId: p.id, quantity: 2, priceCents: 1 } as never]),
      totalCents: 1,
      discountCents: 999_999,
    });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      subtotalCents: 119_800,
      discountCents: 39_820,
      totalCents: 79_980,
      customerName: 'Maria Cliente',
    });
    expect(res.body.order.code).toMatch(/^PS-[A-Z0-9]{6}$/);
    expect(res.body.order.items[0]).toMatchObject({ unitPriceCents: 39_990, originalUnitPriceCents: 59_900, subtotalCents: 79_980 });
    expect(res.body.accessToken).toBeTruthy();
  });

  it('reserva o estoque e registra a movimentação vinculada ao pedido', async () => {
    const p = await createProduct({ stock: 5 });
    const res = await post(orderBody([{ productId: p.id, quantity: 3 }]));
    const order = await prisma.order.findUniqueOrThrow({ where: { code: res.body.order.code } });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(2);
    const mov = await prisma.inventoryMovement.findFirstOrThrow({ where: { orderId: order.id } });
    expect(mov).toMatchObject({ type: 'ORDER_RESERVATION', quantity: -3, balanceBefore: 5, balanceAfter: 2 });
    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'PENDING' });
  });

  it('é idempotente: repetir a requisição devolve o mesmo pedido sem nova reserva', async () => {
    const p = await createProduct({ stock: 5 });
    const key = idemKey();
    const body = orderBody([{ productId: p.id, quantity: 1 }]);
    const first = await post(body, key);
    const second = await post(body, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.order.code).toBe(first.body.order.code);
    expect(second.body.accessToken).toBe(first.body.accessToken);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(4);
  });

  it('repetições simultâneas com a mesma chave criam um único pedido', async () => {
    const p = await createProduct({ stock: 50 });
    const key = idemKey();
    const body = orderBody([{ productId: p.id, quantity: 1 }]);
    const results = await Promise.all(Array.from({ length: 5 }, () => post(body, key)));
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.order.code)).size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(49);
  });

  it('recusa reutilizar a chave com outro conteúdo', async () => {
    const p = await createProduct({ stock: 5 });
    const key = idemKey();
    await post(orderBody([{ productId: p.id, quantity: 1 }]), key);
    const res = await post(orderBody([{ productId: p.id, quantity: 2 }]), key);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('exige Idempotency-Key', async () => {
    const p = await createProduct();
    const res = await api(app)
      .post('/api/v1/orders')
      .send(orderBody([{ productId: p.id, quantity: 1 }]));
    expect(res.status).toBe(400);
  });

  it('não permite vender acima do estoque', async () => {
    const p = await createProduct({ stock: 2 });
    const res = await post(orderBody([{ productId: p.id, quantity: 3 }]));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ITEMS_UNAVAILABLE');
    expect(res.body.error.details[0]).toMatchObject({ productId: p.id, issue: 'INSUFFICIENT_STOCK', available: 2 });
    expect(await prisma.order.count()).toBe(0);
  });

  it('pedidos concorrentes nunca deixam o estoque negativo', async () => {
    const p = await createProduct({ stock: 3 });
    const results = await Promise.all(Array.from({ length: 10 }, () => post(orderBody([{ productId: p.id, quantity: 1 }]))));
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409 || r.status === 422);
    expect(ok).toHaveLength(3);
    expect(rejected).toHaveLength(7);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { productId: p.id, type: 'ORDER_RESERVATION' } })).toBe(3);
  });

  it('falha atômica: se um item não tem estoque, nada é reservado', async () => {
    const a = await createProduct({ stock: 5 });
    const b = await createProduct({ stock: 1 });
    // Esvazia "b" entre a validação e a transação simulando concorrência.
    await prisma.product.update({ where: { id: b.id }, data: { stockQuantity: 0 } });
    const res = await post(
      orderBody([
        { productId: a.id, quantity: 1 },
        { productId: b.id, quantity: 1 },
      ]),
    );
    expect(res.status).toBe(422);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).stockQuantity).toBe(5);
    expect(await prisma.order.count()).toBe(0);
  });

  it('recusa produtos inativos ou inexistentes', async () => {
    const p = await createProduct({ isActive: false });
    const res = await post(
      orderBody([
        { productId: p.id, quantity: 1 },
        { productId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
      ]),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { issue: string }) => d.issue).sort()).toEqual(['NOT_FOUND', 'UNAVAILABLE']);
  });

  it('valida dados do cliente, entrega e quantidades', async () => {
    const p = await createProduct();
    const cases = [
      orderBody([{ productId: p.id, quantity: 0 }]),
      orderBody([{ productId: p.id, quantity: 21 }]),
      orderBody([{ productId: p.id, quantity: 1.5 }]),
      orderBody([]),
      orderBody([{ productId: p.id, quantity: 1 }], { customer: { name: 'A', phone: '123' } }),
      orderBody([{ productId: p.id, quantity: 1 }], { fulfillment: 'DELIVERY' }),
    ];
    for (const body of cases) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('aceita entrega com endereço e soma itens repetidos', async () => {
    const p = await createProduct({ priceCents: 1_000, stock: 10 });
    const res = await post(
      orderBody(
        [
          { productId: p.id, quantity: 1 },
          { productId: p.id, quantity: 2 },
        ],
        {
          fulfillment: 'DELIVERY',
          address: { street: 'Rua A', number: '10', district: 'Centro', city: 'Videira' },
          notes: 'Tamanho 42',
        },
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.items[0].quantity).toBe(3);
    expect(res.body.order.address).toMatchObject({ street: 'Rua A', city: 'Videira' });
    expect(res.body.order.notes).toBe('Tamanho 42');
  });

  it('respeita formas de recebimento desativadas', async () => {
    await prisma.storeSettings.update({ where: { id: 1 }, data: { deliveryEnabled: false } });
    const p = await createProduct();
    const res = await post(
      orderBody([{ productId: p.id, quantity: 1 }], {
        fulfillment: 'DELIVERY',
        address: { street: 'Rua A', number: '1', district: 'Centro', city: 'Videira' },
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FULFILLMENT_UNAVAILABLE');
  });
});

describe('consulta pública do pedido', () => {
  it('exige o token do pedido e não revela pedidos de terceiros', async () => {
    const p = await createProduct();
    const { body } = await post(orderBody([{ productId: p.id, quantity: 1 }]));
    const ok = await api(app).get(`/api/v1/orders/${body.order.code}`).set('X-Order-Token', body.accessToken);
    expect(ok.status).toBe(200);
    expect(ok.body).not.toHaveProperty('customerPhone');
    const wrong = await api(app).get(`/api/v1/orders/${body.order.code}`).set('X-Order-Token', 'x'.repeat(43));
    expect(wrong.status).toBe(404);
    const missing = await api(app).get(`/api/v1/orders/${body.order.code}`);
    expect(missing.status).toBe(400);
  });

  it('registra a abertura do WhatsApp sem alterar status ou pagamento', async () => {
    const p = await createProduct();
    const { body } = await post(orderBody([{ productId: p.id, quantity: 1 }]));
    const res = await api(app).post(`/api/v1/orders/${body.order.code}/whatsapp-opened`).set('X-Order-Token', body.accessToken);
    expect(res.status).toBe(204);
    const order = await prisma.order.findUniqueOrThrow({ where: { code: body.order.code } });
    expect(order.whatsappOpenedAt).not.toBeNull();
    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('UNPAID');
  });
});

describe('POST /orders/quote', () => {
  it('recalcula a sacola e aponta itens com problema', async () => {
    const ok = await createProduct({ priceCents: 2_000, salePriceCents: 1_500, stock: 5 });
    const low = await createProduct({ stock: 1 });
    const off = await createProduct({ isActive: false });
    const res = await api(app)
      .post('/api/v1/orders/quote')
      .send({
        items: [
          { productId: ok.id, quantity: 2 },
          { productId: low.id, quantity: 3 },
          { productId: off.id, quantity: 1 },
        ],
      });
    expect(res.status).toBe(200);
    const [a, b, c] = res.body.lines;
    expect(a).toMatchObject({ available: true, issue: null, unitPriceCents: 1_500, subtotalCents: 3_000 });
    expect(b).toMatchObject({ available: false, issue: 'INSUFFICIENT_STOCK', maxQuantity: 1 });
    expect(c).toMatchObject({ available: false, issue: 'UNAVAILABLE' });
    expect(res.body).toMatchObject({ subtotalCents: 4_000, discountCents: 1_000, totalCents: 3_000, canCheckout: false });
  });
});
