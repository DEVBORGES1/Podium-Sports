import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { categories, product, settings, whey } from './fixtures';

export const API = 'http://api.test/api/v1';

export const defaultHandlers = [
  http.get(`${API}/store/settings`, () => HttpResponse.json(settings)),
  http.get(`${API}/categories`, () => HttpResponse.json({ items: categories })),
  http.get(`${API}/banners`, () => HttpResponse.json({ items: [] })),
  http.get(`${API}/products`, () => HttpResponse.json({ items: [product(), whey], page: 1, pageSize: 20, total: 2, totalPages: 1 })),
  http.get(`${API}/products/:slug`, ({ params }) => {
    const found = [product(), whey].find((p) => p.slug === params.slug || p.id === params.slug);
    return found ? HttpResponse.json({ ...found, related: [] }) : HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Produto não encontrado.' } }, { status: 404 });
  }),
  http.post(`${API}/orders/quote`, async ({ request }) => {
    const body = (await request.json()) as { items: { productId: string; quantity: number }[] };
    const all = [product(), whey];
    const lines = body.items.map((i) => {
      const p = all.find((x) => x.id === i.productId)!;
      return { productId: i.productId, quantity: i.quantity, issue: null, available: true, name: p.name, slug: p.slug, imageUrl: null, unitPriceCents: p.priceCents, regularUnitPriceCents: p.regularPriceCents, subtotalCents: p.priceCents * i.quantity, maxQuantity: p.maxQuantity };
    });
    const total = lines.reduce((s, l) => s + l.subtotalCents, 0);
    const subtotal = lines.reduce((s, l) => s + l.regularUnitPriceCents * l.quantity, 0);
    return HttpResponse.json({ lines, subtotalCents: subtotal, discountCents: subtotal - total, totalCents: total, canCheckout: true });
  }),
];

export const server = setupServer(...defaultHandlers);
