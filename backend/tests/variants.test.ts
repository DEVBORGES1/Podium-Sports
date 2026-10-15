import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { MemoryStorage, storage } from '../src/lib/storage.js';
import { api, createAdmin, createCategory, createProduct, idemKey, makeApp, orderBody, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let admin: AdminCtx;

const setVariants = (productId: string, body: object) =>
  api(app).put(`/api/v1/admin/products/${productId}/variants`).set('Authorization', admin.auth).send(body);
const createOrder = (items: { productId: string; variantId?: string | null; quantity: number }[]) =>
  api(app).post('/api/v1/orders').set('Idempotency-Key', idemKey()).send(orderBody(items));
const quote = (items: object[]) => api(app).post('/api/v1/orders/quote').send({ items });
const move = (body: object) => api(app).post('/api/v1/admin/inventory/movements').set('Authorization', admin.auth).send(body);

async function stockOf(productId: string) {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: { orderBy: { sortOrder: 'asc' } } } });
  return { total: p.stockQuantity, byLabel: Object.fromEntries(p.variants.map((v) => [v.label, v.stockQuantity])) };
}

/** Cria o produto já com tamanhos 38 (2), 40 (3) e 42 (0). */
async function shoe() {
  const p = await createProduct({ name: 'Umbro Pro 5', stock: 0 });
  const res = await setVariants(p.id, {
    variantType: 'Tamanho',
    variants: [
      { label: '38', stockDelta: 2 },
      { label: '40', stockDelta: 3 },
      { label: '42', stockDelta: 0 },
    ],
  });
  expect(res.status).toBe(200);
  const ids = Object.fromEntries((res.body.variants as { id: string; label: string }[]).map((v) => [v.label, v.id]));
  return { product: p, ids };
}

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
});

describe('variações (estoque por tamanho/sabor)', () => {
  it('ativar variações zera o estoque único e passa a somar as opções', async () => {
    const p = await createProduct({ stock: 7 });
    const res = await setVariants(p.id, {
      variantType: 'Sabor',
      variants: [
        { label: 'Chocolate', stockDelta: 4 },
        { label: 'Morango', stockDelta: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ variantType: 'Sabor', stockQuantity: 5 });
    expect(res.body.variants.map((v: { label: string; stockQuantity: number }) => [v.label, v.stockQuantity])).toEqual([
      ['Chocolate', 4],
      ['Morango', 1],
    ]);
    const movements = await prisma.inventoryMovement.findMany({ where: { productId: p.id }, orderBy: { createdAt: 'asc' } });
    expect(movements.map((m) => [m.type, m.quantity, m.variantId ? 'variação' : 'produto'])).toEqual(
      expect.arrayContaining([
        ['ADJUSTMENT', -7, 'produto'],
        ['INITIAL', 4, 'variação'],
        ['INITIAL', 1, 'variação'],
      ]),
    );
    expect(await prisma.auditLog.count({ where: { action: 'product.variants', entityId: p.id } })).toBe(1);
  });

  it('a loja mostra só as opções ativas, com disponibilidade de cada uma', async () => {
    const { product, ids } = await shoe();
    await setVariants(product.id, {
      variantType: 'Tamanho',
      variants: [
        { id: ids['38'], label: '38' },
        { id: ids['40'], label: '40', isActive: false },
        { id: ids['42'], label: '42' },
      ],
    });
    const res = await api(app).get(`/api/v1/products/${product.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.variantType).toBe('Tamanho');
    expect(res.body.variants).toEqual([
      { id: ids['38'], label: '38', available: true, maxQuantity: 2 },
      { id: ids['42'], label: '42', available: false, maxQuantity: 0 },
    ]);
    // O 40 (inativo) não conta para a disponibilidade da loja.
    expect(res.body).toMatchObject({ availability: 'IN_STOCK', maxQuantity: 2 });
  });

  it('pedido exige a opção, reserva da opção certa e grava o texto da variação', async () => {
    const { product, ids } = await shoe();
    const without = await quote([{ productId: product.id, quantity: 1 }]);
    expect(without.body.lines[0]).toMatchObject({ issue: 'VARIANT_REQUIRED', available: false });
    expect(without.body.canCheckout).toBe(false);
    expect((await createOrder([{ productId: product.id, quantity: 1 }])).body.error.code).toBe('ITEMS_UNAVAILABLE');

    const q = await quote([{ productId: product.id, variantId: ids['40'], quantity: 2 }]);
    expect(q.body.lines[0]).toMatchObject({ variantId: ids['40'], variantLabel: 'Tamanho: 40', available: true, maxQuantity: 3 });

    const res = await createOrder([
      { productId: product.id, variantId: ids['40'], quantity: 2 },
      { productId: product.id, variantId: ids['38'], quantity: 1 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.order.items.map((i: { variantLabel: string; quantity: number }) => [i.variantLabel, i.quantity]).sort()).toEqual([
      ['Tamanho: 38', 1],
      ['Tamanho: 40', 2],
    ]);
    expect(await stockOf(product.id)).toEqual({ total: 2, byLabel: { '38': 1, '40': 1, '42': 0 } });
  });

  it('não vende além do estoque da opção, mesmo havendo estoque em outra', async () => {
    const { product, ids } = await shoe();
    const res = await createOrder([{ productId: product.id, variantId: ids['42'], quantity: 1 }]);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toMatchObject({ variantId: ids['42'], issue: 'OUT_OF_STOCK', available: 0 });
    const other = await createProduct();
    const foreign = await createOrder([{ productId: other.id, variantId: ids['38'], quantity: 1 }]);
    expect(foreign.body.error.details[0]).toMatchObject({ issue: 'UNAVAILABLE' });
  });

  it('pedidos simultâneos de tamanhos diferentes do mesmo produto não travam nem estouram o estoque', async () => {
    const { product, ids } = await shoe();
    const results = await Promise.all([
      ...Array.from({ length: 4 }, () => createOrder([{ productId: product.id, variantId: ids['38'], quantity: 1 }])),
      ...Array.from({ length: 4 }, () => createOrder([{ productId: product.id, variantId: ids['40'], quantity: 1 }])),
    ]);
    const created = results.filter((r) => r.status === 201).length;
    expect(created).toBe(5); // 2 do 38 + 3 do 40
    expect(await stockOf(product.id)).toEqual({ total: 0, byLabel: { '38': 0, '40': 0, '42': 0 } });
  });

  it('cancelar devolve o estoque para a mesma opção', async () => {
    const { product, ids } = await shoe();
    const order = await createOrder([{ productId: product.id, variantId: ids['40'], quantity: 3 }]);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: order.body.order.code } });
    const res = await api(app)
      .patch(`/api/v1/admin/orders/${row.id}/status`)
      .set('Authorization', admin.auth)
      .send({ status: 'CANCELLED', note: 'Cliente desistiu' });
    expect(res.status).toBe(200);
    expect(await stockOf(product.id)).toEqual({ total: 5, byLabel: { '38': 2, '40': 3, '42': 0 } });
  });

  it('estoque manual de produto com variações é sempre por opção', async () => {
    const { product, ids } = await shoe();
    const noVariant = await move({ type: 'IN', productId: product.id, quantity: 1 });
    expect(noVariant.status).toBe(422);
    expect(noVariant.body.error.code).toBe('VARIANT_REQUIRED');
    const ok = await move({ type: 'ADJUSTMENT', productId: product.id, variantId: ids['42'], newBalance: 4, reason: 'Contagem' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ variantId: ids['42'], balanceBefore: 0, balanceAfter: 4 });
    const batch = await api(app)
      .post('/api/v1/admin/inventory/movements/batch')
      .set('Authorization', admin.auth)
      .send({
        reason: 'Avaria',
        items: [
          { productId: product.id, variantId: ids['38'], delta: -1 },
          { productId: product.id, variantId: ids['40'], delta: 2 },
        ],
      });
    expect(batch.status).toBe(201);
    expect(await stockOf(product.id)).toEqual({ total: 10, byLabel: { '38': 1, '40': 5, '42': 4 } });

    const plain = await createProduct();
    expect((await move({ type: 'IN', productId: plain.id, variantId: ids['38'], quantity: 1 })).status).toBe(404);

    const list = await api(app).get('/api/v1/admin/inventory').set('Authorization', admin.auth);
    const row = list.body.items.find((r: { productId: string }) => r.productId === product.id);
    expect(row).toMatchObject({ variantType: 'Tamanho', stockQuantity: 10 });
    expect(row.variants.map((v: { label: string; stockQuantity: number }) => [v.label, v.stockQuantity])).toEqual([
      ['38', 1],
      ['40', 5],
      ['42', 4],
    ]);
  });

  it('ajuste no cadastro usa a diferença e preserva reservas feitas nesse meio-tempo', async () => {
    const { product, ids } = await shoe();
    // A tela carregou 40 = 3; um cliente reservou 1 antes de salvar; a pessoa somou +2.
    await createOrder([{ productId: product.id, variantId: ids['40'], quantity: 1 }]);
    const res = await setVariants(product.id, {
      variantType: 'Tamanho',
      variants: [
        { id: ids['38'], label: '38' },
        { id: ids['40'], label: '40', stockDelta: 2 },
        { id: ids['42'], label: '42' },
      ],
    });
    expect(res.status).toBe(200);
    expect(await stockOf(product.id)).toEqual({ total: 6, byLabel: { '38': 2, '40': 4, '42': 0 } });
  });

  it('não exclui opção reservada em pedido aberto; desativar volta ao estoque único', async () => {
    const { product, ids } = await shoe();
    await createOrder([{ productId: product.id, variantId: ids['38'], quantity: 1 }]);
    const removing = await setVariants(product.id, {
      variantType: 'Tamanho',
      variants: [
        { id: ids['40'], label: '40' },
        { id: ids['42'], label: '42' },
      ],
    });
    expect(removing.status).toBe(409);
    expect(removing.body.error.code).toBe('VARIANT_RESERVED');

    // Exclui uma opção sem reserva: o estoque dela sai do total.
    const ok = await setVariants(product.id, {
      variantType: 'Tamanho',
      variants: [
        { id: ids['38'], label: '38' },
        { id: ids['42'], label: '42' },
      ],
    });
    expect(ok.status).toBe(200);
    expect(await stockOf(product.id)).toEqual({ total: 1, byLabel: { '38': 1, '42': 0 } });

    // Sem variações: o total vira o estoque único e o pedido aberto, se cancelado, devolve para ele.
    const off = await setVariants(product.id, { variantType: null, variants: [] });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ variantType: null, variants: [], stockQuantity: 1 });
    const order = await prisma.order.findFirstOrThrow({ where: { status: 'PENDING' } });
    await api(app).patch(`/api/v1/admin/orders/${order.id}/status`).set('Authorization', admin.auth).send({ status: 'CANCELLED' });
    expect(await stockOf(product.id)).toEqual({ total: 2, byLabel: {} });
  });

  it('não ativa variações com pedido aberto do produto e valida a lista', async () => {
    const p = await createProduct({ stock: 3 });
    await createOrder([{ productId: p.id, quantity: 1 }]);
    const res = await setVariants(p.id, { variantType: 'Tamanho', variants: [{ label: 'P', stockDelta: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OPEN_ORDERS');

    const other = await createProduct();
    expect((await setVariants(other.id, { variantType: 'Tamanho', variants: [{ label: 'P' }, { label: 'p' }] })).status).toBe(400);
    expect((await setVariants(other.id, { variantType: null, variants: [{ label: 'P' }] })).status).toBe(400);
    expect((await setVariants(other.id, { variantType: 'Tamanho', variants: [{ label: 'P', stockDelta: -1 }] })).status).toBe(400);
  });
});

describe('subcategorias e marcas', () => {
  const adminPost = (path: string, body: object) => api(app).post(`/api/v1/admin${path}`).set('Authorization', admin.auth).send(body);

  it('categoria principal inclui os produtos das subcategorias; só um nível', async () => {
    const parent = await createCategory({ name: 'Acessórios', slug: 'acessorios' });
    const child = await adminPost('/categories', { name: 'Natação', slug: 'natacao', parentId: parent.id });
    expect(child.status).toBe(201);
    expect(child.body.parentId).toBe(parent.id);
    expect((await adminPost('/categories', { name: 'Óculos', parentId: child.body.id })).status).toBe(422);

    // Pela API, para a busca receber o nome da categoria-mãe.
    const touca = await adminPost('/products', { name: 'Touca Lycra', priceCents: 2990, categoryId: child.body.id, initialStock: 1 });
    expect(touca.status).toBe(201);
    await createProduct({ name: 'Hand Grip', categoryId: parent.id });

    const all = await api(app).get('/api/v1/products?category=acessorios');
    expect(all.body.items.map((p: { name: string }) => p.name).sort()).toEqual(['Hand Grip', 'Touca Lycra']);
    const only = await api(app).get('/api/v1/products?category=natacao');
    expect(only.body.items.map((p: { name: string }) => p.name)).toEqual(['Touca Lycra']);
    expect(only.body.items[0].category).toMatchObject({ slug: 'natacao', parent: { slug: 'acessorios', name: 'Acessórios' } });

    const cats = await api(app).get('/api/v1/categories');
    const counts = Object.fromEntries(cats.body.items.map((c: { slug: string; productCount: number }) => [c.slug, c.productCount]));
    expect(counts).toMatchObject({ acessorios: 2, natacao: 1 });

    // A busca encontra pelo nome da categoria-mãe.
    const search = await api(app).get('/api/v1/products?q=acessorios');
    expect(search.body.total).toBe(2);

    // Mãe com subcategoria não pode ser excluída nem virar subcategoria.
    expect((await api(app).delete(`/api/v1/admin/categories/${parent.id}`).set('Authorization', admin.auth)).body.error.code).toBe('CATEGORY_HAS_CHILDREN');
    const other = await createCategory();
    const nest = await api(app).patch(`/api/v1/admin/categories/${parent.id}`).set('Authorization', admin.auth).send({ parentId: other.id });
    expect(nest.status).toBe(422);
  });

  it('desativar a categoria-mãe esconde as subcategorias e seus produtos', async () => {
    const parent = await createCategory({ slug: 'futebol' });
    const child = await prisma.category.create({ data: { name: 'Bolas', slug: 'bolas', parentId: parent.id } });
    await createProduct({ name: 'Bola Penalty', categoryId: child.id });
    await prisma.category.update({ where: { id: parent.id }, data: { isActive: false } });
    expect((await api(app).get('/api/v1/products')).body.total).toBe(0);
    expect((await api(app).get('/api/v1/categories')).body.items).toEqual([]);
  });

  it('lista marcas e filtra por uma ou mais', async () => {
    const cat = await createCategory({ slug: 'chuteiras' });
    await createProduct({ name: 'A', brand: 'Nike', categoryId: cat.id });
    await createProduct({ name: 'B', brand: 'Penalty', categoryId: cat.id });
    await createProduct({ name: 'C', brand: 'penalty' });
    await createProduct({ name: 'D' });

    const brands = await api(app).get('/api/v1/brands');
    expect(brands.body.items).toEqual([
      { name: 'Nike', count: 1 },
      { name: 'Penalty', count: 2 },
    ]);
    expect((await api(app).get('/api/v1/brands?category=chuteiras')).body.items).toEqual([
      { name: 'Nike', count: 1 },
      { name: 'Penalty', count: 1 },
    ]);
    const filtered = await api(app).get('/api/v1/products?brand=penalty');
    expect(filtered.body.items.map((p: { name: string }) => p.name).sort()).toEqual(['B', 'C']);
    const two = await api(app).get('/api/v1/products?brand=Nike,Penalty&category=chuteiras');
    expect(two.body.total).toBe(2);
  });
});

describe('fotos leves', () => {
  const photo = () =>
    sharp({ create: { width: 720, height: 1280, channels: 3, background: { r: 200, g: 40, b: 40 } } })
      .jpeg()
      .toBuffer();

  it('gera miniatura e versão média no envio e as remove junto com a foto', async () => {
    const mem = new MemoryStorage();
    storage.set(mem);
    const p = await createProduct();
    const res = await api(app)
      .post(`/api/v1/admin/products/${p.id}/images`)
      .set('Authorization', admin.auth)
      .attach('images', await photo(), 'a.jpg');
    expect(res.status).toBe(201);
    const img = res.body.images[0];
    expect(img.thumbUrl).toMatch(/-thumb\.webp$/);
    expect(img.mediumUrl).toMatch(/-medium\.webp$/);
    const paths = [...mem.files.keys()];
    expect(paths).toHaveLength(3);
    const thumb = await sharp(mem.files.get(paths.find((x) => x.endsWith('-thumb.webp'))!)!.data).metadata();
    expect([thumb.width, thumb.height, thumb.format]).toEqual([600, 1067, 'webp']);
    const medium = await sharp(mem.files.get(paths.find((x) => x.endsWith('-medium.webp'))!)!.data).metadata();
    expect([medium.width, medium.height]).toEqual([675, 1200]);

    const pub = await api(app).get(`/api/v1/products/${p.slug}`);
    expect(pub.body.thumbUrl).toBe(img.thumbUrl);

    await api(app).delete(`/api/v1/admin/products/${p.id}/images/${img.id}`).set('Authorization', admin.auth);
    expect(mem.files.size).toBe(0);
  });

  it('reprocessa fotos antigas em lotes', async () => {
    const mem = new MemoryStorage();
    storage.set(mem);
    const p = await createProduct();
    for (let i = 0; i < 3; i++) {
      const path = `products/00000000-0000-4000-8000-00000000000${i}.jpg`;
      await mem.upload(path, await photo(), 'image/jpeg');
      await prisma.productImage.create({
        data: { productId: p.id, storagePath: path, mimeType: 'image/jpeg', sizeBytes: 1, sortOrder: i, isPrimary: i === 0 },
      });
    }
    const first = await api(app).post('/api/v1/admin/products/images/optimize').set('Authorization', admin.auth).send({ limit: 2 });
    expect(first.body).toEqual({ processed: 2, failed: [], remaining: 1 });
    const second = await api(app).post('/api/v1/admin/products/images/optimize').set('Authorization', admin.auth).send({});
    expect(second.body).toMatchObject({ processed: 1, remaining: 0 });
    expect(await prisma.productImage.count({ where: { thumbPath: null } })).toBe(0);
    expect(mem.files.size).toBe(9);
  });
});
