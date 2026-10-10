import type { Banner, Category, CreateOrderInput, Page, Product, ProductDetail, PublicOrder, Quote, StoreSettings } from '../types/api';
import { request } from './api';

export interface ProductQuery {
  q?: string;
  category?: string;
  onSale?: boolean;
  featured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'newest';
  page?: number;
  pageSize?: number;
}

/** Endpoints públicos da loja. */
export const storeApi = {
  settings: () => request<StoreSettings>('/store/settings'),
  categories: () => request<{ items: Category[] }>('/categories').then((r) => r.items),
  banners: () => request<{ items: Banner[] }>('/banners').then((r) => r.items),
  products: (query: ProductQuery) => request<Page<Product>>('/products', { query: { ...query } }),
  product: (idOrSlug: string) => request<ProductDetail>(`/products/${encodeURIComponent(idOrSlug)}`),
  legacyMap: (ids: number[]) => request<{ items: { legacyId: number; id: string }[] }>('/products/legacy-map', { query: { ids: ids.join(',') } }),
  quote: (items: { productId: string; quantity: number }[]) => request<Quote>('/orders/quote', { method: 'POST', body: { items } }),
  createOrder: (input: CreateOrderInput, idempotencyKey: string) =>
    request<{ order: PublicOrder; accessToken: string }>('/orders', { method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey } }),
  order: (code: string, token: string) => request<PublicOrder>(`/orders/${code}`, { headers: { 'X-Order-Token': token } }),
  whatsappOpened: (code: string, token: string) =>
    request<void>(`/orders/${code}/whatsapp-opened`, { method: 'POST', headers: { 'X-Order-Token': token }, keepalive: true }),
};

/** Tokens dos pedidos feitos neste navegador (permitem reabrir a confirmação). */
const ORDERS_KEY = 'podium_pedidos';
export function rememberOrder(code: string, token: string, phone: string) {
  try {
    const all = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '{}') as Record<string, { token: string; phone: string }>;
    all[code] = { token, phone };
    const entries = Object.entries(all).slice(-10);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore
  }
}
export function recallOrder(code: string): { token: string; phone: string } | null {
  try {
    const all = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '{}') as Record<string, { token: string; phone: string }>;
    return all[code] ?? null;
  } catch {
    return null;
  }
}
