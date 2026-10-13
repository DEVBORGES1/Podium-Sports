import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { api, createAdmin, createProduct, makeApp, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let admin: AdminCtx;
const move = (body: object) => api(app).post('/api/v1/admin/inventory/movements').set('Authorization', admin.auth).send(body);
const batch = (body: object) => api(app).post('/api/v1/admin/inventory/movements/batch').set('Authorization', admin.auth).send(body);
const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQuantity;

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
});

describe('movimentações de estoque', () => {
  it('entrada soma ao saldo e registra usuário, saldos e auditoria', async () => {
    const p = await createProduct({ stock: 4 });
    const res = await move({ type: 'IN', productId: p.id, quantity: 6, reason: 'NF 123' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'IN', quantity: 6, balanceBefore: 4, balanceAfter: 10, reason: 'NF 123', profileId: admin.profile.id });
    expect(await stockOf(p.id)).toBe(10);
    expect(await prisma.auditLog.count({ where: { action: 'inventory.in', entityId: p.id } })).toBe(1);
  });

  it('saída exige justificativa e não deixa saldo negativo', async () => {
    const p = await createProduct({ stock: 3 });
    expect((await move({ type: 'OUT', productId: p.id, quantity: 1 })).status).toBe(400);
    const tooMuch = await move({ type: 'OUT', productId: p.id, quantity: 4, reason: 'Avaria' });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 3, requested: 4 } });
    const ok = await move({ type: 'OUT', productId: p.id, quantity: 3, reason: 'Avaria' });
    expect(ok.body).toMatchObject({ quantity: -3, balanceAfter: 0 });
  });

  it('ajuste define o saldo absoluto com justificativa', async () => {
    const p = await createProduct({ stock: 7 });
    expect((await move({ type: 'ADJUSTMENT', productId: p.id, newBalance: 4 })).status).toBe(400);
    const res = await move({ type: 'ADJUSTMENT', productId: p.id, newBalance: 4, reason: 'Contagem mensal' });
    expect(res.body).toMatchObject({ type: 'ADJUSTMENT', quantity: -3, balanceBefore: 7, balanceAfter: 4 });
    expect((await move({ type: 'ADJUSTMENT', productId: p.id, newBalance: 4, reason: 'Contagem' })).status).toBe(422);
    expect((await move({ type: 'ADJUSTMENT', productId: p.id, newBalance: -1, reason: 'Contagem' })).status).toBe(400);
  });

  it('rejeita quantidades inválidas e tipos reservados ao sistema', async () => {
    const p = await createProduct();
    for (const body of [
      { type: 'IN', productId: p.id, quantity: 0 },
      { type: 'IN', productId: p.id, quantity: -5 },
      { type: 'IN', productId: p.id, quantity: 1.5 },
      { type: 'ORDER_RELEASE', productId: p.id, quantity: 5 },
      { type: 'INITIAL', productId: p.id, quantity: 5 },
    ]) {
      expect((await move(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('saídas concorrentes respeitam o saldo', async () => {
    const p = await createProduct({ stock: 5 });
    const results = await Promise.all(Array.from({ length: 8 }, () => move({ type: 'OUT', productId: p.id, quantity: 1, reason: 'Teste' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await stockOf(p.id)).toBe(0);
    const movements = await prisma.inventoryMovement.findMany({ where: { productId: p.id }, orderBy: { balanceAfter: 'desc' } });
    expect(movements.map((m) => m.balanceAfter)).toEqual([4, 3, 2, 1, 0]);
  });

  it('o saldo não pode ser alterado pela edição do produto', async () => {
    const p = await createProduct({ stock: 5 });
    const res = await api(app).patch(`/api/v1/admin/products/${p.id}`).set('Authorization', admin.auth).send({ stockQuantity: 999 });
    expect(res.status).toBe(400);
    expect(await stockOf(p.id)).toBe(5);
  });
});

describe('ajustes em lote (+ / − na tabela)', () => {
  it('aplica entradas e saídas de vários produtos de uma vez, com histórico e auditoria', async () => {
    const a = await createProduct({ stock: 5 });
    const b = await createProduct({ stock: 2 });
    const res = await batch({ reason: 'Contagem de sexta', items: [{ productId: a.id, delta: 3 }, { productId: b.id, delta: -2 }] });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(await stockOf(a.id)).toBe(8);
    expect(await stockOf(b.id)).toBe(0);
    const movs = await prisma.inventoryMovement.findMany({ where: { productId: { in: [a.id, b.id] }, type: { in: ['IN', 'OUT'] } } });
    expect(movs.map((m) => [m.type, m.quantity, m.reason, m.profileId]).sort()).toEqual([
      ['IN', 3, 'Contagem de sexta', admin.profile.id],
      ['OUT', -2, 'Contagem de sexta', admin.profile.id],
    ]);
    expect(await prisma.auditLog.count({ where: { action: { in: ['inventory.in', 'inventory.out'] }, entityId: { in: [a.id, b.id] } } })).toBe(2);
  });

  it('é tudo ou nada: uma saída sem saldo cancela o lote inteiro', async () => {
    const a = await createProduct({ stock: 5 });
    const b = await createProduct({ stock: 1 });
    const res = await batch({ reason: 'Avaria', items: [{ productId: a.id, delta: 4 }, { productId: b.id, delta: -2 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(a.id)).toBe(5);
    expect(await stockOf(b.id)).toBe(1);
  });

  it('valida justificativa das saídas, zeros, repetidos e lista vazia', async () => {
    const a = await createProduct({ stock: 5 });
    expect((await batch({ items: [{ productId: a.id, delta: -1 }] })).status).toBe(400);
    expect((await batch({ items: [{ productId: a.id, delta: 0 }] })).status).toBe(400);
    expect((await batch({ items: [] })).status).toBe(400);
    expect((await batch({ reason: 'x', items: [{ productId: a.id, delta: 1 }, { productId: a.id, delta: 1 }] })).status).toBe(400);
    // Só entradas: justificativa opcional.
    const ok = await batch({ items: [{ productId: a.id, delta: 2 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.items[0]).toMatchObject({ reason: 'Entrada de mercadoria', balanceAfter: 7 });
  });
});

describe('consultas de estoque', () => {
  it('lista saldos, reservados e filtra baixo/esgotado', async () => {
    const low = await createProduct({ name: 'Baixo', stock: 2, minStock: 3 });
    await createProduct({ name: 'Zerado', stock: 0 });
    await createProduct({ name: 'Ok', stock: 50, minStock: 3 });
    await prisma.order.create({
      data: {
        code: 'PS-AAAAAA',
        idempotencyKey: 'k'.repeat(20),
        customerName: 'X',
        customerPhone: '49999999999',
        fulfillment: 'PICKUP',
        subtotalCents: 100,
        totalCents: 100,
        items: { create: { productId: low.id, productName: 'Baixo', unitPriceCents: 50, originalUnitPriceCents: 50, quantity: 2, subtotalCents: 100 } },
      },
    });
    const all = await api(app).get('/api/v1/admin/inventory').set('Authorization', admin.auth);
    expect(all.body.items.map((i: { name: string }) => i.name)).toEqual(['Zerado', 'Baixo', 'Ok']);
    expect(all.body.items[1]).toMatchObject({ status: 'LOW_STOCK', reservedInOpenOrders: 2 });
    const onlyLow = await api(app).get('/api/v1/admin/inventory?stock=low').set('Authorization', admin.auth);
    expect(onlyLow.body.items.map((i: { name: string }) => i.name)).toEqual(['Baixo']);
    const search = await api(app).get('/api/v1/admin/inventory?q=zer').set('Authorization', admin.auth);
    expect(search.body.total).toBe(1);
  });

  it('histórico filtra por produto e tipo; mínimo é alterado com auditoria', async () => {
    const p = await createProduct({ stock: 1 });
    await move({ type: 'IN', productId: p.id, quantity: 2 });
    await move({ type: 'OUT', productId: p.id, quantity: 1, reason: 'Brinde' });
    const hist = await api(app).get(`/api/v1/admin/inventory/movements?productId=${p.id}&type=OUT`).set('Authorization', admin.auth);
    expect(hist.body.total).toBe(1);
    expect(hist.body.items[0]).toMatchObject({ reason: 'Brinde', user: { id: admin.profile.id } });
    const min = await api(app).patch(`/api/v1/admin/inventory/${p.id}`).set('Authorization', admin.auth).send({ minStock: 4 });
    expect(min.body.minStock).toBe(4);
    expect(await prisma.auditLog.count({ where: { action: 'inventory.min_stock' } })).toBe(1);
  });
});
