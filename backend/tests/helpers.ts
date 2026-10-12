import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { Profile, UserRole } from '@prisma/client';
import { createApp, type AppOptions } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { buildProductSearchText } from '../src/lib/text.js';
import { contentSchema } from '../src/modules/settings/settings.schemas.js';
import { DEFAULT_SETTINGS } from '../src/modules/settings/settings.service.js';

export const ISSUER = 'https://test-project.supabase.co/auth/v1';
const SECRET = new TextEncoder().encode('test-jwt-secret-with-at-least-32-characters!!');

export function makeApp(options: AppOptions = {}) {
  return createApp({
    rateLimits: { publicPerMin: 100_000, ordersPer10Min: 100_000, adminPerMin: 100_000, authPerMin: 100_000, ...options.rateLimits },
  });
}

export const api = (app = makeApp()) => request(app);

const TABLES = [
  'audit_logs',
  'order_messages',
  'order_status_history',
  'inventory_movements',
  'order_items',
  'orders',
  'promotion_products',
  'promotions',
  'product_images',
  'products',
  'categories',
  'banners',
  'store_settings',
  'profiles',
];

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.storeSettings.create({ data: { id: 1, ...DEFAULT_SETTINGS, content: contentSchema.parse({}) } });
}

/** Gera um access token no formato do Supabase Auth (HS256 com o segredo de teste). */
export async function signToken(
  sub: string,
  overrides: { issuer?: string; audience?: string; expiresIn?: string; secret?: Uint8Array } = {},
) {
  return new SignJWT({ role: 'authenticated', email: 'user@test.dev' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '1h')
    .sign(overrides.secret ?? SECRET);
}

export async function createAdmin(role: UserRole = 'ADMIN', status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
  const profile = await prisma.profile.create({
    data: { authUserId: randomUUID(), name: `${role} Teste`, email: `${randomUUID()}@test.dev`, role, status },
  });
  const token = await signToken(profile.authUserId);
  return { profile, token, auth: `Bearer ${token}` };
}

export type AdminCtx = { profile: Profile; token: string; auth: string };

export async function createCategory(data: Partial<{ name: string; slug: string; isActive: boolean }> = {}) {
  const name = data.name ?? `Categoria ${randomUUID().slice(0, 6)}`;
  return prisma.category.create({
    data: { name, slug: data.slug ?? `cat-${randomUUID().slice(0, 8)}`, isActive: data.isActive ?? true },
  });
}

export async function createProduct(
  data: Partial<{
    name: string;
    priceCents: number;
    salePriceCents: number | null;
    stock: number;
    minStock: number;
    isActive: boolean;
    isFeatured: boolean;
    categoryId: string;
    brand: string;
  }> = {},
) {
  const category = data.categoryId
    ? await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } })
    : await createCategory();
  const name = data.name ?? `Produto ${randomUUID().slice(0, 6)}`;
  return prisma.product.create({
    data: {
      name,
      slug: `p-${randomUUID().slice(0, 12)}`,
      brand: data.brand ?? null,
      priceCents: data.priceCents ?? 10_000,
      salePriceCents: data.salePriceCents ?? null,
      stockQuantity: data.stock ?? 10,
      minStock: data.minStock ?? 0,
      isActive: data.isActive ?? true,
      isFeatured: data.isFeatured ?? false,
      categoryId: category.id,
      searchText: buildProductSearchText(name, data.brand ?? null, category.name),
    },
  });
}

export const idemKey = () => randomUUID().replace(/-/g, '');

export function orderBody(items: { productId: string; quantity: number }[], extra: Record<string, unknown> = {}) {
  return {
    customer: { name: 'Maria Cliente', phone: '(49) 99999-1234' },
    fulfillment: 'PICKUP',
    items,
    ...extra,
  };
}

/** PNG 1x1 válido. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
