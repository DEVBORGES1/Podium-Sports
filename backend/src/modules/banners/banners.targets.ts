import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { getSettings } from '../settings/settings.service.js';

/**
 * Destino de um botão do banner escolhido no painel. O endereço é montado aqui a partir das rotas
 * reais da loja (src/App.tsx do frontend), sempre com o slug atual do produto/categoria — se o slug
 * mudar, o botão acompanha; se o item for excluído ou desativado, o botão sai da loja e o painel avisa.
 */
export const PAGE_PATHS = {
  home: '/',
  catalog: '/produtos',
  offers: '/produtos?ofertas=1',
  new: '/produtos?ordem=newest',
} as const;
export type PageKey = keyof typeof PAGE_PATHS;
const PAGE_KEYS = Object.keys(PAGE_PATHS) as [PageKey, ...PageKey[]];
const PAGE_LABELS: Record<PageKey, string> = {
  home: 'Página inicial',
  catalog: 'Todos os produtos',
  offers: 'Produtos em oferta',
  new: 'Novidades',
};

/** URL externa segura: somente https, com domínio e sem espaços (bloqueia javascript:, data:, http:). */
export function isHttpsUrl(value: string) {
  if (/\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

const message = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((v) => v || null);

export const buttonTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('product'), productId: z.uuid('Escolha um produto.') }).strict(),
  z.object({ type: z.literal('category'), categoryId: z.uuid('Escolha uma categoria.') }).strict(),
  z.object({ type: z.literal('page'), page: z.enum(PAGE_KEYS, 'Escolha uma página.') }).strict(),
  z
    .object({
      type: z.literal('external'),
      url: z.string().trim().max(300).refine(isHttpsUrl, 'Informe um endereço completo começando com https://'),
    })
    .strict(),
  z.object({ type: z.literal('whatsapp'), message }).strict(),
]);
export type ButtonTarget = z.infer<typeof buttonTargetSchema>;

export type TargetIssue = 'PRODUCT_REMOVED' | 'PRODUCT_INACTIVE' | 'CATEGORY_REMOVED' | 'CATEGORY_INACTIVE' | 'WHATSAPP_MISSING';

interface Ref {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

export interface TargetRefs {
  products: Map<string, Ref>;
  categories: Map<string, Ref>;
  productsBySlug: Map<string, Ref>;
  categoriesBySlug: Map<string, Ref>;
  whatsappNumber: string;
  whatsappGreeting: string;
}

/** Lê um destino salvo no banco; valores corrompidos são tratados como ausentes. */
export function readTarget(raw: unknown): ButtonTarget | null {
  if (raw === null || raw === undefined) return null;
  const parsed = buttonTargetSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Caminhos internos antigos (digitados à mão) que podem ser convertidos em destinos do seletor. */
function legacySlugs(url: string | null) {
  if (!url || !url.startsWith('/')) return {};
  const u = new URL(url, 'https://loja.local');
  const product = /^\/produto\/([^/]+)\/?$/.exec(u.pathname)?.[1];
  if (product) return { product: safeDecode(product) };
  const category = u.pathname.replace(/\/$/, '') === '/produtos' ? u.searchParams.get('categoria') : null;
  return category ? { category } : {};
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Carrega, de uma vez, os produtos/categorias referenciados pelos botões (por id ou pelo slug de links antigos). */
export async function loadTargetRefs(entries: { target: ButtonTarget | null; url: string | null }[]): Promise<TargetRefs> {
  const productIds = new Set<string>();
  const categoryIds = new Set<string>();
  const productSlugs = new Set<string>();
  const categorySlugs = new Set<string>();
  let needsWhatsapp = false;
  for (const { target, url } of entries) {
    if (target?.type === 'product') productIds.add(target.productId);
    else if (target?.type === 'category') categoryIds.add(target.categoryId);
    else if (target?.type === 'whatsapp') needsWhatsapp = true;
    else if (!target) {
      const slugs = legacySlugs(url);
      if (slugs.product) productSlugs.add(slugs.product);
      if (slugs.category) categorySlugs.add(slugs.category);
    }
  }
  const select = { id: true, slug: true, name: true, isActive: true } as const;
  const [products, categories, settings] = await Promise.all([
    productIds.size || productSlugs.size
      ? prisma.product.findMany({ where: { OR: [{ id: { in: [...productIds] } }, { slug: { in: [...productSlugs] } }] }, select })
      : [],
    categoryIds.size || categorySlugs.size
      ? prisma.category.findMany({ where: { OR: [{ id: { in: [...categoryIds] } }, { slug: { in: [...categorySlugs] } }] }, select })
      : [],
    needsWhatsapp ? getSettings() : null,
  ]);
  return {
    products: new Map(products.map((p) => [p.id, p])),
    categories: new Map(categories.map((c) => [c.id, c])),
    productsBySlug: new Map(products.map((p) => [p.slug, p])),
    categoriesBySlug: new Map(categories.map((c) => [c.slug, c])),
    whatsappNumber: settings?.whatsappNumber ?? '',
    whatsappGreeting: settings?.whatsappGreeting ?? '',
  };
}

export interface ResolvedTarget {
  /** Endereço montado a partir do destino (existe mesmo com o item inativo, para referência). */
  path: string | null;
  /** Problema que impede o botão de aparecer na loja. */
  issue: TargetIssue | null;
  /** Descrição curta para o painel ("Produto: Chuteira F50"). */
  description: string;
}

export function resolveTarget(target: ButtonTarget, refs: TargetRefs): ResolvedTarget {
  switch (target.type) {
    case 'product': {
      const p = refs.products.get(target.productId);
      if (!p) return { path: null, issue: 'PRODUCT_REMOVED', description: 'Produto removido da loja' };
      return { path: `/produto/${encodeURIComponent(p.slug)}`, issue: p.isActive ? null : 'PRODUCT_INACTIVE', description: `Produto: ${p.name}` };
    }
    case 'category': {
      const c = refs.categories.get(target.categoryId);
      if (!c) return { path: null, issue: 'CATEGORY_REMOVED', description: 'Categoria removida da loja' };
      return { path: `/produtos?categoria=${encodeURIComponent(c.slug)}`, issue: c.isActive ? null : 'CATEGORY_INACTIVE', description: `Categoria: ${c.name}` };
    }
    case 'page':
      return { path: PAGE_PATHS[target.page], issue: null, description: `Página: ${PAGE_LABELS[target.page]}` };
    case 'external':
      return { path: target.url, issue: null, description: `Link externo: ${new URL(target.url).hostname}` };
    case 'whatsapp': {
      const digits = refs.whatsappNumber.replace(/\D/g, '');
      if (!digits) return { path: null, issue: 'WHATSAPP_MISSING', description: 'Conversa no WhatsApp' };
      const text = target.message ?? refs.whatsappGreeting;
      return { path: `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`, issue: null, description: 'Conversa no WhatsApp' };
    }
  }
}

/**
 * Converte um link antigo (digitado à mão) no destino equivalente do seletor, quando possível.
 * Links que não correspondem a nada cadastrado devolvem null e continuam valendo como estão.
 */
export function targetFromLegacyUrl(url: string | null, refs: TargetRefs): ButtonTarget | null {
  if (!url) return null;
  if (url.startsWith('https://')) return isHttpsUrl(url) ? { type: 'external', url } : null;
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  const u = new URL(url, 'https://loja.local');
  const path = u.pathname.replace(/(.)\/$/, '$1');
  const params = [...u.searchParams.entries()];
  const product = /^\/produto\/([^/]+)$/.exec(path)?.[1];
  if (product && !params.length) {
    const p = refs.productsBySlug.get(safeDecode(product));
    return p ? { type: 'product', productId: p.id } : null;
  }
  if (path === '/' && !params.length) return { type: 'page', page: 'home' };
  if (path !== '/produtos') return null;
  if (!params.length) return { type: 'page', page: 'catalog' };
  if (params.length !== 1) return null;
  const [key, value] = params[0]!;
  if (key === 'ofertas' && value === '1') return { type: 'page', page: 'offers' };
  if (key === 'ordem' && value === 'newest') return { type: 'page', page: 'new' };
  if (key === 'categoria') {
    const c = refs.categoriesBySlug.get(value);
    return c ? { type: 'category', categoryId: c.id } : null;
  }
  return null;
}
