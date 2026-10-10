import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { api, createCategory, createProduct, makeApp, resetDb } from './helpers.js';

const app = makeApp();

beforeEach(resetDb);

describe('GET /products', () => {
  it('lista apenas produtos ativos de categorias ativas, sem dados internos', async () => {
    const cat = await createCategory({ name: 'Tênis', slug: 'tenis' });
    await createProduct({ name: 'Nike Quest 6', categoryId: cat.id });
    await createProduct({ name: 'Inativo', categoryId: cat.id, isActive: false });
    const hidden = await createCategory({ name: 'Oculta', isActive: false });
    await createProduct({ name: 'Em categoria oculta', categoryId: hidden.id });

    const res = await api(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const [item] = res.body.items;
    expect(item.name).toBe('Nike Quest 6');
    expect(item).not.toHaveProperty('stockQuantity');
    expect(item).not.toHaveProperty('salePriceCents');
    expect(item).not.toHaveProperty('searchText');
  });

  it('busca sem acentos por nome, marca e categoria', async () => {
    const cat = await createCategory({ name: 'Suplementos', slug: 'suplementos' });
    await createProduct({ name: 'Pré-treino Hórus', categoryId: cat.id });
    await createProduct({ name: 'Creatina 300g', brand: 'Nutrata', categoryId: cat.id });
    expect((await api(app).get('/api/v1/products?q=pre treino horus')).body.total).toBe(1);
    expect((await api(app).get('/api/v1/products?q=NUTRATA')).body.items[0].name).toBe('Creatina 300g');
    expect((await api(app).get('/api/v1/products?q=suplementos')).body.total).toBe(2);
    expect((await api(app).get('/api/v1/products?q=inexistente')).body).toMatchObject({ total: 0, items: [] });
  });

  it('filtra por categoria, ofertas e faixa de preço; ordena e pagina', async () => {
    const a = await createCategory({ slug: 'chuteiras' });
    const b = await createCategory({ slug: 'roupas' });
    await createProduct({ name: 'A', priceCents: 30_000, categoryId: a.id });
    await createProduct({ name: 'B', priceCents: 59_900, salePriceCents: 39_990, categoryId: a.id });
    await createProduct({ name: 'C', priceCents: 5_000, categoryId: b.id });

    const byCat = await api(app).get('/api/v1/products?category=chuteiras&sort=price_asc');
    expect(byCat.body.items.map((p: { name: string }) => p.name)).toEqual(['A', 'B']);

    const sale = await api(app).get('/api/v1/products?onSale=true');
    expect(sale.body.items).toHaveLength(1);
    expect(sale.body.items[0]).toMatchObject({ name: 'B', priceCents: 39_990, regularPriceCents: 59_900, discountPercent: 33 });

    const range = await api(app).get('/api/v1/products?minPrice=10000&maxPrice=40000&sort=price_desc');
    expect(range.body.items.map((p: { name: string }) => p.name)).toEqual(['B', 'A']);

    const page2 = await api(app).get('/api/v1/products?sort=name_asc&pageSize=2&page=2');
    expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(page2.body.items.map((p: { name: string }) => p.name)).toEqual(['C']);
  });

  it('informa disponibilidade e quantidade máxima', async () => {
    await createProduct({ name: 'Esgotado', stock: 0 });
    await createProduct({ name: 'Últimas', stock: 2, minStock: 3 });
    await createProduct({ name: 'Muitos', stock: 500 });
    const res = await api(app).get('/api/v1/products?sort=name_asc');
    const map = Object.fromEntries(res.body.items.map((p: { name: string }) => [p.name, p]));
    expect(map['Esgotado']).toMatchObject({ availability: 'OUT_OF_STOCK', maxQuantity: 0 });
    expect(map['Últimas']).toMatchObject({ availability: 'LOW_STOCK', maxQuantity: 2 });
    expect(map['Muitos']).toMatchObject({ availability: 'IN_STOCK', maxQuantity: 20 });
  });

  it('valida a query string', async () => {
    const res = await api(app).get('/api/v1/products?sort=hack&pageSize=1000');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /products/:idOrSlug', () => {
  it('busca por slug e por id e devolve relacionados', async () => {
    const cat = await createCategory();
    const p = await createProduct({ name: 'Principal', categoryId: cat.id });
    await createProduct({ name: 'Relacionado', categoryId: cat.id });
    const bySlug = await api(app).get(`/api/v1/products/${p.slug}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.related.map((r: { name: string }) => r.name)).toEqual(['Relacionado']);
    expect((await api(app).get(`/api/v1/products/${p.id}`)).body.name).toBe('Principal');
  });

  it('produto inativo não é encontrado', async () => {
    const p = await createProduct({ isActive: false });
    expect((await api(app).get(`/api/v1/products/${p.slug}`)).status).toBe(404);
  });

  it('mapeia IDs da versão HTML antiga', async () => {
    const p = await createProduct();
    await prisma.product.update({ where: { id: p.id }, data: { legacyId: 10 } });
    const res = await api(app).get('/api/v1/products/legacy-map?ids=10,99');
    expect(res.body.items).toEqual([{ legacyId: 10, id: p.id }]);
  });
});

describe('categorias, banners e configurações públicas', () => {
  it('categorias ativas com contagem de produtos ativos', async () => {
    const cat = await createCategory({ name: 'Goleiro' });
    await createProduct({ categoryId: cat.id });
    await createProduct({ categoryId: cat.id, isActive: false });
    await createCategory({ name: 'Inativa', isActive: false });
    const res = await api(app).get('/api/v1/categories');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ name: 'Goleiro', productCount: 1 });
  });

  it('banners respeitam ativo e período de publicação', async () => {
    const day = 86_400_000;
    await prisma.banner.createMany({
      data: [
        { title: 'Vigente' },
        { title: 'Inativo', isActive: false },
        { title: 'Futuro', startsAt: new Date(Date.now() + day) },
        { title: 'Expirado', startsAt: new Date(Date.now() - 2 * day), endsAt: new Date(Date.now() - day) },
      ],
    });
    const res = await api(app).get('/api/v1/banners');
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(['Vigente']);
  });

  it('configurações públicas não expõem dados internos', async () => {
    const res = await api(app).get('/api/v1/store/settings');
    expect(res.status).toBe(200);
    expect(res.body.whatsappNumber).toBe('554998090818');
    expect(res.body.content.benefits).toHaveLength(4);
    expect(res.body).not.toHaveProperty('pendingOrderTtlHours');
    expect(res.body).not.toHaveProperty('logoPath');
  });
});
