import type { CategoryIcon, Product } from '../types/api';

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
  productId: string;
  quantity: number;
  snapshot: CartSnapshot;
}

export type CartAction =
  | { type: 'add'; product: Product; quantity: number }
  | { type: 'set'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' }
  | { type: 'replace'; items: CartItem[] };

export function snapshotOf(p: Product): CartSnapshot {
  return {
    name: p.name,
    slug: p.slug,
    priceCents: p.priceCents,
    regularPriceCents: p.regularPriceCents,
    imageUrl: p.imageUrl,
    icon: p.category.icon,
    categorySlug: p.category.slug,
    maxQuantity: p.maxQuantity,
  };
}

const limitFor = (snapshot: CartSnapshot) => Math.max(0, Math.min(snapshot.maxQuantity, MAX_QUANTITY_PER_ITEM));

export function cartReducer(items: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'add': {
      const snapshot = snapshotOf(action.product);
      const limit = limitFor(snapshot);
      if (limit === 0 || action.quantity < 1) return items;
      const existing = items.find((i) => i.productId === action.product.id);
      if (existing) {
        return items.map((i) =>
          i.productId === action.product.id ? { ...i, snapshot, quantity: Math.min(limit, i.quantity + action.quantity) } : i,
        );
      }
      return [...items, { productId: action.product.id, quantity: Math.min(limit, Math.floor(action.quantity)), snapshot }];
    }
    case 'set': {
      if (action.quantity <= 0) return items.filter((i) => i.productId !== action.productId);
      return items.map((i) =>
        i.productId === action.productId ? { ...i, quantity: Math.min(Math.floor(action.quantity), MAX_QUANTITY_PER_ITEM) } : i,
      );
    }
    case 'remove':
      return items.filter((i) => i.productId !== action.productId);
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

/** Lê a sacola salva. Formato antigo do HTML ({ "10": 2 }) é devolvido em `legacy` para migração. */
export function loadCart(storage: Pick<Storage, 'getItem'> = localStorage): { items: CartItem[]; legacy: Record<number, number> | null } {
  try {
    const raw = storage.getItem(CART_KEY);
    if (!raw) return { items: [], legacy: null };
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === 'object' && (data as StoredCart).v === 2 && Array.isArray((data as StoredCart).items)) {
      return { items: (data as StoredCart).items.filter(isItem).slice(0, 50), legacy: null };
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
