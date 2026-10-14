import type { CategoryIcon, Product, ProductVariant } from '../types/api';

/** Mesma chave do site original: sacolas antigas são migradas automaticamente. */
export const CART_KEY = 'podium_sacola';
export const MAX_QUANTITY_PER_ITEM = 20;

/** Dados para exibição enquanto o servidor não confirma preços (nunca usados para cobrar). */
export interface CartSnapshot {
  name: string;
  slug: string;
  priceCents: number;
  regularPriceCents: number;
  imageUrl: string | null;
  icon: CategoryIcon;
  categorySlug: string;
  maxQuantity: number;
}

export interface CartItem {
  /** Identifica a linha: o mesmo produto em tamanhos diferentes são linhas diferentes. */
  key: string;
  productId: string;
  /** Opção escolhida (tamanho, sabor…); null = produto sem variações. */
  variantId: string | null;
  /** Ex.: "Tamanho: 40". */
  variantLabel: string | null;
  quantity: number;
  snapshot: CartSnapshot;
}

export type CartAction =
  | { type: 'add'; product: Product; variant?: ProductVariant | null; quantity: number }
  | { type: 'set'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  | { type: 'clear' }
  | { type: 'replace'; items: CartItem[] };

/** Linhas sem variação usam o próprio id do produto (compatível com sacolas salvas antes das variações). */
export const cartKey = (productId: string, variantId?: string | null) => (variantId ? `${productId}:${variantId}` : productId);

export const variantText = (product: Pick<Product, 'variantType'>, variant: Pick<ProductVariant, 'label'>) =>
  `${product.variantType ?? 'Opção'}: ${variant.label}`;

export function snapshotOf(p: Product, variant?: ProductVariant | null): CartSnapshot {
  return {
    name: p.name,
    slug: p.slug,
    priceCents: p.priceCents,
    regularPriceCents: p.regularPriceCents,
    imageUrl: p.thumbUrl ?? p.imageUrl,
    icon: p.category.icon,
    categorySlug: p.category.slug,
    maxQuantity: variant ? variant.maxQuantity : p.maxQuantity,
  };
}

const limitFor = (snapshot: CartSnapshot) => Math.max(0, Math.min(snapshot.maxQuantity, MAX_QUANTITY_PER_ITEM));

export function cartReducer(items: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'add': {
      const variant = action.variant ?? null;
      // Produto com variações só entra na sacola com a opção escolhida.
      if ((action.product.variants?.length ?? 0) > 0 && !variant) return items;
      const snapshot = snapshotOf(action.product, variant);
      const limit = limitFor(snapshot);
      if (limit === 0 || action.quantity < 1) return items;
      const key = cartKey(action.product.id, variant?.id);
      const existing = items.find((i) => i.key === key);
      if (existing) {
        return items.map((i) => (i.key === key ? { ...i, snapshot, quantity: Math.min(limit, i.quantity + action.quantity) } : i));
      }
      return [
        ...items,
        {
          key,
          productId: action.product.id,
          variantId: variant?.id ?? null,
          variantLabel: variant ? variantText(action.product, variant) : null,
          quantity: Math.min(limit, Math.floor(action.quantity)),
          snapshot,
        },
      ];
    }
    case 'set': {
      if (action.quantity <= 0) return items.filter((i) => i.key !== action.key);
      return items.map((i) => (i.key === action.key ? { ...i, quantity: Math.min(Math.floor(action.quantity), MAX_QUANTITY_PER_ITEM) } : i));
    }
    case 'remove':
      return items.filter((i) => i.key !== action.key);
    case 'clear':
      return [];
    case 'replace':
      return action.items;
  }
}

interface StoredCart {
  v: 2;
  items: CartItem[];
}

const isItem = (x: unknown): x is CartItem => {
  const i = x as CartItem;
  return !!i && typeof i.productId === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && !!i.snapshot && typeof i.snapshot.name === 'string';
};

/** Itens salvos antes das variações não têm key/variantId: completa os campos. */
function normalize(i: CartItem): CartItem {
  const variantId = typeof i.variantId === 'string' ? i.variantId : null;
  return { ...i, variantId, variantLabel: typeof i.variantLabel === 'string' ? i.variantLabel : null, key: cartKey(i.productId, variantId) };
}

/** Lê a sacola salva. Formato antigo do HTML ({ "10": 2 }) é devolvido em `legacy` para migração. */
export function loadCart(storage: Pick<Storage, 'getItem'> = localStorage): { items: CartItem[]; legacy: Record<number, number> | null } {
  try {
    const raw = storage.getItem(CART_KEY);
    if (!raw) return { items: [], legacy: null };
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === 'object' && (data as StoredCart).v === 2 && Array.isArray((data as StoredCart).items)) {
      return { items: (data as StoredCart).items.filter(isItem).map(normalize).slice(0, 50), legacy: null };
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const legacy: Record<number, number> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        const id = Number(k);
        if (Number.isInteger(id) && id > 0 && Number.isInteger(v) && (v as number) > 0) legacy[id] = Math.min(v as number, MAX_QUANTITY_PER_ITEM);
      }
      return { items: [], legacy: Object.keys(legacy).length ? legacy : null };
    }
  } catch {
    // Conteúdo corrompido: começa com sacola vazia.
  }
  return { items: [], legacy: null };
}

export function saveCart(items: CartItem[], storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(CART_KEY, JSON.stringify({ v: 2, items } satisfies StoredCart));
  } catch {
    // Armazenamento indisponível (modo privado): a sacola continua funcionando em memória.
  }
}

export const cartCount = (items: CartItem[]) => items.reduce((s, i) => s + i.quantity, 0);
export const estimatedTotal = (items: CartItem[]) => items.reduce((s, i) => s + i.snapshot.priceCents * i.quantity, 0);
/** Unidades de um produto na sacola, somando todas as opções. */
export const productCount = (items: CartItem[], productId: string) => items.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0);
