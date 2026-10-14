import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { MemoryStorage, storage } from '../src/lib/storage.js';
import { api, createAdmin, createCategory, createProduct, idemKey, makeApp, orderBody, PNG_1PX, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let admin: AdminCtx;
let mem: MemoryStorage;

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
  mem = new MemoryStorage();
  storage.set(mem);
});

describe('produtos', () => {
  it('cria produto com estoque inicial rastreado e slug único', async () => {
    const cat = await createCategory({ name: 'Chuteiras' });
    const body = { name: 'Joma Top-Flex', priceCents: 74_990, categoryId: cat.id, initialStock: 5, minStock: 2, brand: 'Joma' };
    const a = await api(app).post('/api/v1/admin/products').set('Authorization', admin.auth).send(body);
    const b = await api(app).post('/api/v1/admin/products').set('Authorization', admin.auth).send(body);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ slug: 'joma-top-flex', stockQuantity: 5, priceCents: 74_990, isActive: true });
    expect(b.body.slug).toBe('joma-top-flex-2');
    const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: a.body.id } });
    expect(movement).toMatchObject({ type: 'INITIAL', quantity: 5, profileId: admin.profile.id });
    expect(await prisma.auditLog.count({ where: { action: 'product.create' } })).toBe(2);
  });

  it('valida preço, preço promocional e categoria', async () => {
    const cat = await createCategory();
    const send = (body: object) => api(app).post('/api/v1/admin/products').set('Authorization', admin.auth).send(body);
    expect((await send({ name: 'Produto', priceCents: 0, categoryId: cat.id })).status).toBe(400);
    expect((await send({ name: 'Produto', priceCents: 10.5, categoryId: cat.id })).status).toBe(400);
    expect((await send({ name: 'Produto', priceCents: 1000, salePriceCents: 1000, categoryId: cat.id })).status).toBe(400);
    const missing = await send({ name: 'Produto', priceCents: 1000, categoryId: '00000000-0000-4000-8000-000000000000' });
    expect(missing.status, JSON.stringify(missing.body)).toBe(422);
  });

  it('alteração de preço é auditada com valores anteriores e novos', async () => {
    const p = await createProduct({ priceCents: 10_000 });
    const res = await api(app).patch(`/api/v1/admin/products/${p.id}`).set('Authorization', admin.auth).send({ priceCents: 12_000 });
    expect(res.status).toBe(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'product.price_change' } });
    expect(log.metadata).toMatchObject({ changes: { priceCents: { from: 10_000, to: 12_000 } } });
    const invalid = await api(app).patch(`/api/v1/admin/products/${p.id}`).set('Authorization', admin.auth).send({ salePriceCents: 13_000 });
    expect(invalid.status).toBe(422);
  });

  it('não exclui produto com pedidos (preserva histórico) mas permite desativar', async () => {
    const p = await createProduct({ stock: 5 });
    await api(app).post('/api/v1/orders').set('Idempotency-Key', idemKey()).send(orderBody([{ productId: p.id, quantity: 1 }]));
    const del = await api(app).delete(`/api/v1/admin/products/${p.id}`).set('Authorization', admin.auth);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('PRODUCT_HAS_ORDERS');
    const off = await api(app).patch(`/api/v1/admin/products/${p.id}`).set('Authorization', admin.auth).send({ isActive: false });
    expect(off.body.isActive).toBe(false);
    expect((await api(app).get(`/api/v1/products/${p.slug}`)).status).toBe(404);
  });

  it('exclui produto sem pedidos e remove imagens do Storage', async () => {
    const p = await createProduct();
    await api(app).post(`/api/v1/admin/products/${p.id}/images`).set('Authorization', admin.auth).attach('images', PNG_1PX, 'a.png');
    expect(mem.files.size).toBe(3); // original + miniatura + média
    expect((await api(app).delete(`/api/v1/admin/products/${p.id}`).set('Authorization', admin.auth)).status).toBe(204);
    expect(mem.files.size).toBe(0);
    expect(await prisma.product.count()).toBe(0);
  });

  it('lista e filtra no painel', async () => {
    await createProduct({ name: 'Ativo' });
    await createProduct({ name: 'Inativo', isActive: false });
    await createProduct({ name: 'Baixo', stock: 1, minStock: 2 });
    const res = await api(app).get('/api/v1/admin/products?status=inactive').set('Authorization', admin.auth);
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(['Inativo']);
    const low = await api(app).get('/api/v1/admin/products?stock=low').set('Authorization', admin.auth);
    expect(low.body.items.map((p: { name: string }) => p.name)).toEqual(['Baixo']);
  });
});

describe('pódio', () => {
  const names = (body: { items: { name: string }[] }) => body.items.map((p) => p.name);

  it('define produtos e ordem de uma vez e reflete na vitrine da loja', async () => {
    const antigo = await createProduct({ name: 'Antigo', isFeatured: true });
    await prisma.product.update({ where: { id: antigo.id }, data: { sortOrder: 37 } });
    const a = await createProduct({ name: 'A' });
    const b = await createProduct({ name: 'B' });
    const res = await api(app).put('/api/v1/admin/products/podium').set('Authorization', admin.auth).send({ productIds: [b.id, a.id] });
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['B', 'A']);
    // Quem sai do pódio deixa de ser destaque, mas mantém a ordem que tinha no catálogo.
    expect(await prisma.product.findUniqueOrThrow({ where: { id: antigo.id } })).toMatchObject({ isFeatured: false, sortOrder: 37 });
    const saved = await prisma.product.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { sortOrder: 'asc' } });
    expect(saved.map((p) => [p.name, p.isFeatured, p.sortOrder])).toEqual([['B', true, 0], ['A', true, 1]]);
    expect(saved[0]!.updatedAt.getTime()).toBeGreaterThan(b.updatedAt.getTime());
    const store = await api(app).get('/api/v1/products?featured=true');
    expect(names(store.body)).toEqual(['B', 'A']);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'product.podium' } });
    expect(log.metadata).toMatchObject({ from: ['Antigo'], to: ['B', 'A'] });
    const get = await api(app).get('/api/v1/admin/products/podium').set('Authorization', admin.auth);
    expect(names(get.body)).toEqual(['B', 'A']);
  });

  it('recusa mais de 5 lugares, repetidos e produtos inexistentes', async () => {
    const ps = await Promise.all([1, 2, 3, 4, 5, 6].map(() => createProduct()));
    const send = (productIds: string[]) => api(app).put('/api/v1/admin/products/podium').set('Authorization', admin.auth).send({ productIds });
    expect((await send(ps.map((p) => p.id))).status).toBe(400);
    expect((await send([ps[0]!.id, ps[0]!.id])).status).toBe(400);
    expect((await send(['00000000-0000-4000-8000-000000000000'])).status).toBe(404);
    expect(await prisma.product.count({ where: { isFeatured: true } })).toBe(0);
    await send([ps[0]!.id, ps[1]!.id]);
    expect((await send([])).status).toBe(200);
    expect(await prisma.product.count({ where: { isFeatured: true } })).toBe(0);
  });
});

describe('imagens', () => {
  it('envia várias imagens, define principal, reordena e remove', async () => {
    const p = await createProduct();
    const up = await api(app)
      .post(`/api/v1/admin/products/${p.id}/images`)
      .set('Authorization', admin.auth)
      .attach('images', PNG_1PX, 'um.png')
      .attach('images', PNG_1PX, 'dois.png');
    expect(up.status).toBe(201);
    expect(up.body.images).toHaveLength(2);
    expect(up.body.images[0].isPrimary).toBe(true);
    const [first, second] = up.body.images;
    for (const path of mem.files.keys()) expect(path).toMatch(/^products\/[0-9a-f-]{36}(\.png|-thumb\.webp|-medium\.webp)$/);

    const primary = await api(app).patch(`/api/v1/admin/products/${p.id}/images/${second.id}`).set('Authorization', admin.auth).send({ isPrimary: true, altText: 'Lateral' });
    expect(primary.body.images[0]).toMatchObject({ id: second.id, isPrimary: true, altText: 'Lateral' });
    expect(await prisma.productImage.count({ where: { productId: p.id, isPrimary: true } })).toBe(1);

    const reorder = await api(app).put(`/api/v1/admin/products/${p.id}/images/order`).set('Authorization', admin.auth).send({ imageIds: [first.id] });
    expect(reorder.status).toBe(422);

    const del = await api(app).delete(`/api/v1/admin/products/${p.id}/images/${second.id}`).set('Authorization', admin.auth);
    expect(del.body.images).toHaveLength(1);
    expect(del.body.images[0]).toMatchObject({ id: first.id, isPrimary: true });
    expect(mem.files.size).toBe(3); // a foto restante: original + miniatura + média

    const pub = await api(app).get(`/api/v1/products/${p.slug}`);
    expect(pub.body.imageUrl).toMatch(/^https:\/\/storage\.test\/products\//);
  });

  it('rejeita arquivos que não são imagens, mesmo com extensão de imagem', async () => {
    const p = await createProduct();
    const fake = await api(app)
      .post(`/api/v1/admin/products/${p.id}/images`)
      .set('Authorization', admin.auth)
      .attach('images', Buffer.from('<svg onload="alert(1)"></svg>'.repeat(3)), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(415);
    const html = await api(app)
      .post('/api/v1/admin/uploads?folder=banners')
      .set('Authorization', admin.auth)
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(html.status).toBe(415);
    expect(mem.files.size).toBe(0);
  });

  it('rejeita arquivos acima de 5 MB', async () => {
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const res = await api(app).post('/api/v1/admin/uploads?folder=banners').set('Authorization', admin.auth).attach('file', big, 'big.png');
    expect(res.status).toBe(413);
  });

  it('upload avulso devolve caminho gerado pelo servidor', async () => {
    const res = await api(app).post('/api/v1/admin/uploads?folder=categories').set('Authorization', admin.auth).attach('file', PNG_1PX, '../../etc/passwd.png');
    expect(res.status).toBe(201);
    expect(res.body.path).toMatch(/^categories\/[0-9a-f-]{36}\.png$/);
    expect((await api(app).post('/api/v1/admin/uploads?folder=../secrets').set('Authorization', admin.auth).attach('file', PNG_1PX, 'a.png')).status).toBe(400);
  });
});

describe('categorias', () => {
  it('CRUD com bloqueio de exclusão quando há produtos', async () => {
    const created = await api(app)
      .post('/api/v1/admin/categories')
      .set('Authorization', admin.auth)
      .send({ name: 'Natação', icon: 'run', colorFrom: '#112233', colorTo: '#000000', showOnHome: true });
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe('natacao');
    const id = created.body.id;

    const bad = await api(app).patch(`/api/v1/admin/categories/${id}`).set('Authorization', admin.auth).send({ colorFrom: 'red' });
    expect(bad.status).toBe(400);

    const p = await createProduct({ categoryId: id, name: 'Óculos' });
    await api(app).patch(`/api/v1/admin/categories/${id}`).set('Authorization', admin.auth).send({ name: 'Piscina' });
    const updated = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(updated.searchText).toContain('piscina');

    const blocked = await api(app).delete(`/api/v1/admin/categories/${id}`).set('Authorization', admin.auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CATEGORY_IN_USE');

    await prisma.product.delete({ where: { id: p.id } });
    expect((await api(app).delete(`/api/v1/admin/categories/${id}`).set('Authorization', admin.auth)).status).toBe(204);
  });

  it('slug duplicado gera 409', async () => {
    await createCategory({ slug: 'tenis' });
    const res = await api(app).post('/api/v1/admin/categories').set('Authorization', admin.auth).send({ name: 'Tênis' });
    expect(res.status).toBe(409);
  });
});
