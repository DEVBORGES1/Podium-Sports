import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { api, createAdmin, createProduct, idemKey, makeApp, orderBody, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let admin: AdminCtx;
const day = 86_400_000;
const period = (startOffsetDays = -1, endOffsetDays = 7) => ({
  startsAt: new Date(Date.now() + startOffsetDays * day).toISOString(),
  endsAt: new Date(Date.now() + endOffsetDays * day).toISOString(),
});

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
});

describe('promoções', () => {
  it('promoção vigente altera o preço da loja e do pedido', async () => {
    const p = await createProduct({ priceCents: 20_000, stock: 5 });
    const res = await api(app)
      .post('/api/v1/admin/promotions')
      .set('Authorization', admin.auth)
      .send({ name: 'Semana da chuteira', discountType: 'PERCENTAGE', value: 25, productIds: [p.id], ...period() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ state: 'ACTIVE', products: [{ id: p.id, promotionalPriceCents: 15_000 }] });

    const pub = await api(app).get(`/api/v1/products/${p.slug}`);
    expect(pub.body).toMatchObject({ priceCents: 15_000, regularPriceCents: 20_000, onSale: true, promotion: { name: 'Semana da chuteira' } });
    expect((await api(app).get('/api/v1/promotions')).body.items[0].productIds).toEqual([p.id]);

    const order = await api(app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', idemKey())
      .send(orderBody([{ productId: p.id, quantity: 2 }]));
    expect(order.body.order).toMatchObject({ subtotalCents: 40_000, discountCents: 10_000, totalCents: 30_000 });
  });

  it('promoções futuras, expiradas ou inativas não alteram preço', async () => {
    const p = await createProduct({ priceCents: 10_000 });
    for (const extra of [period(2, 5), { isActive: false, ...period() }]) {
      await api(app)
        .post('/api/v1/admin/promotions')
        .set('Authorization', admin.auth)
        .send({ name: 'Promo', discountType: 'FIXED_PRICE', value: 5_000, productIds: [p.id], ...extra });
    }
    await prisma.promotion.create({
      data: {
        name: 'Expirada',
        discountType: 'PERCENTAGE',
        value: 50,
        startsAt: new Date(Date.now() - 10 * day),
        endsAt: new Date(Date.now() - day),
        products: { create: { productId: p.id } },
      },
    });
    expect((await api(app).get(`/api/v1/products/${p.slug}`)).body.priceCents).toBe(10_000);
    const list = await api(app).get('/api/v1/admin/promotions').set('Authorization', admin.auth);
    expect(list.body.items.map((x: { state: string }) => x.state).sort()).toEqual(['EXPIRED', 'INACTIVE', 'SCHEDULED']);
  });

  it('rejeita descontos inválidos ou incompatíveis com o preço', async () => {
    const cheap = await createProduct({ priceCents: 1_000, name: 'Barato' });
    const send = (body: object) =>
      api(app)
        .post('/api/v1/admin/promotions')
        .set('Authorization', admin.auth)
        .send({ name: 'Promo', productIds: [cheap.id], ...period(), ...body });
    expect((await send({ discountType: 'PERCENTAGE', value: 95 })).status).toBe(400);
    const incompatible = await send({ discountType: 'FIXED_AMOUNT', value: 1_500 });
    expect(incompatible.status).toBe(422);
    expect(incompatible.body.error.code).toBe('PROMOTION_INCOMPATIBLE');
    expect((await send({ discountType: 'FIXED_PRICE', value: 2_000 })).status).toBe(422);
    expect((await send({ discountType: 'PERCENTAGE', value: 10, ...period(5, 1) })).status).toBe(400);
  });

  it('edição revalida produtos e período', async () => {
    const p = await createProduct({ priceCents: 10_000 });
    const created = await api(app)
      .post('/api/v1/admin/promotions')
      .set('Authorization', admin.auth)
      .send({ name: 'Promo', discountType: 'FIXED_AMOUNT', value: 1_000, productIds: [p.id], ...period() });
    const id = created.body.id;
    expect((await api(app).patch(`/api/v1/admin/promotions/${id}`).set('Authorization', admin.auth).send({ value: 20_000 })).status).toBe(422);
    const ok = await api(app).patch(`/api/v1/admin/promotions/${id}`).set('Authorization', admin.auth).send({ value: 2_000 });
    expect(ok.body.products[0].promotionalPriceCents).toBe(8_000);
    expect((await api(app).delete(`/api/v1/admin/promotions/${id}`).set('Authorization', admin.auth)).status).toBe(204);
  });
});

describe('banners', () => {
  it('cria, edita, lista com estado e exclui', async () => {
    const created = await api(app)
      .post('/api/v1/admin/banners')
      .set('Authorization', admin.auth)
      .send({ title: 'Supere', highlight: 'seus limites', buttonLabel: 'Ver produtos', buttonUrl: '/produtos', ...period(1, 5) });
    expect(created.status).toBe(201);
    expect(created.body.state).toBe('SCHEDULED');
    expect((await api(app).get('/api/v1/banners')).body.items).toHaveLength(0);
    const live = await api(app).patch(`/api/v1/admin/banners/${created.body.id}`).set('Authorization', admin.auth).send({ startsAt: null });
    expect(live.body.state).toBe('LIVE');
    expect((await api(app).get('/api/v1/banners')).body.items).toHaveLength(1);
    expect((await api(app).delete(`/api/v1/admin/banners/${created.body.id}`).set('Authorization', admin.auth)).status).toBe(204);
  });

  it('bloqueia links perigosos e imagens fora do Storage', async () => {
    const send = (body: object) =>
      api(app)
        .post('/api/v1/admin/banners')
        .set('Authorization', admin.auth)
        .send({ title: 'T', ...body });
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'http://inseguro.com']) {
      expect((await send({ buttonLabel: 'Ir', buttonUrl: url })).status, url).toBe(400);
    }
    expect((await send({ buttonLabel: 'Ir', buttonUrl: 'https://instagram.com/podium' })).status).toBe(201);
    expect((await send({ imagePath: 'https://evil.com/x.png' })).status).toBe(400);
    expect((await send({ buttonLabel: 'Sem destino' })).status).toBe(400);
  });
});
