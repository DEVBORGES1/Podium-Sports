import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cartCount, cartKey, cartReducer, loadCart, saveCart, snapshotOf, variantText, CART_KEY, type CartItem } from '../lib/cart';
import { storeApi } from '../lib/store-api';
import type { Product, ProductVariant } from '../types/api';
import { useToast } from './ToastContext';

interface CartApi {
  items: CartItem[];
  count: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** Produto com variações exige a opção escolhida (variant). */
  add: (product: Product, quantity?: number, origin?: HTMLElement | null, variant?: ProductVariant | null) => boolean;
  /** key = linha da sacola (produto + opção). */
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  cartButtonRef: RefObject<HTMLButtonElement | null>;
}

const CartContext = createContext<CartApi | null>(null);

function flyToCart(from: HTMLElement, to: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'fly';
  dot.style.left = `${a.left + a.width / 2 - 8}px`;
  dot.style.top = `${a.top + a.height / 2 - 8}px`;
  document.body.appendChild(dot);
  requestAnimationFrame(() => {
    dot.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px,${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.5)`;
    dot.style.opacity = '.4';
  });
  window.setTimeout(() => {
    dot.remove();
    to.classList.remove('bump');
    void to.offsetWidth;
    to.classList.add('bump');
  }, 700);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => loadCart(), []);
  const [items, dispatch] = useReducer(cartReducer, initial.items);
  const [isOpen, setOpen] = useState(false);
  const cartButtonRef = useRef<HTMLButtonElement | null>(null);
  const toast = useToast();

  useEffect(() => saveCart(items), [items]);

  // Sincroniza a sacola entre abas abertas.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) dispatch({ type: 'replace', items: loadCart().items });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Migra sacolas salvas pela versão HTML (IDs numéricos) para os produtos atuais.
  useEffect(() => {
    const legacy = initial.legacy;
    if (!legacy) return;
    let cancelled = false;
    (async () => {
      try {
        const { items: map } = await storeApi.legacyMap(Object.keys(legacy).map(Number));
        const products = await Promise.all(map.map((m) => storeApi.product(m.id).catch(() => null)));
        if (cancelled) return;
        const migrated: CartItem[] = [];
        products.forEach((p, idx) => {
          const qty = legacy[map[idx]!.legacyId] ?? 0;
          // Produtos que hoje têm variações ficam de fora: o cliente precisa escolher a opção.
          if (p && p.maxQuantity > 0 && qty > 0 && !p.variants?.length) {
            migrated.push({
              key: cartKey(p.id),
              productId: p.id,
              variantId: null,
              variantLabel: null,
              quantity: Math.min(qty, p.maxQuantity),
              snapshot: snapshotOf(p),
            });
          }
        });
        dispatch({ type: 'replace', items: migrated });
      } catch {
        // Sem conexão: tenta novamente na próxima visita (o formato antigo continua salvo).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.legacy]);

  const add = useCallback<CartApi['add']>(
    (product, quantity = 1, origin, variant = null) => {
      if ((product.variants?.length ?? 0) > 0 && !variant) {
        toast.show(`Escolha ${(product.variantType ?? 'a opção').toLowerCase()} de ${product.name}`, { tone: 'error' });
        return false;
      }
      const key = cartKey(product.id, variant?.id);
      const current = items.find((i) => i.key === key)?.quantity ?? 0;
      const limit = Math.min(variant ? variant.maxQuantity : product.maxQuantity, 20);
      const label = variant ? `${product.name} (${variantText(product, variant)})` : product.name;
      if (limit <= 0) {
        toast.show(`${label} está esgotado`, { tone: 'error' });
        return false;
      }
      if (current >= limit) {
        toast.show(`Máximo disponível: ${limit} unidade(s)`, { tone: 'error' });
        return false;
      }
      dispatch({ type: 'add', product, variant, quantity });
      if (origin && cartButtonRef.current) flyToCart(origin, cartButtonRef.current);
      toast.show(`${label} na sacola`, { action: { label: 'Ver sacola', onClick: () => setOpen(true) } });
      return true;
    },
    [items, toast],
  );

  const value: CartApi = {
    items,
    count: cartCount(items),
    isOpen,
    open: useCallback(() => setOpen(true), []),
    close: useCallback(() => setOpen(false), []),
    add,
    setQuantity: useCallback((key, quantity) => dispatch({ type: 'set', key, quantity }), []),
    remove: useCallback((key) => dispatch({ type: 'remove', key }), []),
    clear: useCallback(() => dispatch({ type: 'clear' }), []),
    cartButtonRef,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart fora do CartProvider');
  return ctx;
}

/** Preços, disponibilidade e totais oficiais da sacola, recalculados pela API. */
export function useCartQuote(enabled = true) {
  const { items } = useCart();
  const payload = items.map((i) => ({ productId: i.productId, ...(i.variantId ? { variantId: i.variantId } : {}), quantity: i.quantity }));
  const query = useQuery({
    queryKey: ['quote', payload],
    queryFn: () => storeApi.quote(payload),
    enabled: enabled && payload.length > 0,
    staleTime: 15_000,
  });
  /** Linha oficial do item (mesmo produto e mesma opção). */
  const lineFor = (item: Pick<CartItem, 'productId' | 'variantId'>) =>
    query.data?.lines.find((l) => l.productId === item.productId && (l.variantId ?? null) === item.variantId);
  return { ...query, lineFor };
}
