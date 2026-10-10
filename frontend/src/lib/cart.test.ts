import { describe, expect, it } from 'vitest';
import { product, whey } from '../test/fixtures';
import { CART_KEY, cartCount, cartReducer, estimatedTotal, loadCart, type CartItem } from './cart';

const memory = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null });

describe('sacola', () => {
  it('adiciona, soma quantidades e respeita o estoque disponível', () => {
    let items: CartItem[] = [];
    items = cartReducer(items, { type: 'add', product: product({ maxQuantity: 3 }), quantity: 2 });
    items = cartReducer(items, { type: 'add', product: product({ maxQuantity: 3 }), quantity: 2 });
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(3);
  });

  it('não adiciona produto esgotado nem quantidade inválida', () => {
    expect(cartReducer([], { type: 'add', product: product({ maxQuantity: 0, availability: 'OUT_OF_STOCK' }), quantity: 1 })).toEqual([]);
    expect(cartReducer([], { type: 'add', product: product(), quantity: 0 })).toEqual([]);
  });

  it('altera, remove e limita a 20 unidades', () => {
    let items = cartReducer([], { type: 'add', product: whey, quantity: 1 });
    items = cartReducer(items, { type: 'set', productId: whey.id, quantity: 50 });
    expect(items[0]!.quantity).toBe(20);
    items = cartReducer(items, { type: 'set', productId: whey.id, quantity: 0 });
    expect(items).toEqual([]);
  });

  it('calcula contagem e total estimado', () => {
    let items = cartReducer([], { type: 'add', product: product(), quantity: 2 });
    items = cartReducer(items, { type: 'add', product: whey, quantity: 1 });
    expect(cartCount(items)).toBe(3);
    expect(estimatedTotal(items)).toBe(2 * 39_990 + 21_990);
  });

  it('lê o formato antigo do site HTML para migração', () => {
    const r = loadCart(memory({ [CART_KEY]: JSON.stringify({ '10': 2, '1': 1, x: 3, '5': -1 }) }));
    expect(r).toEqual({ items: [], legacy: { 10: 2, 1: 1 } });
  });

  it('ignora conteúdo corrompido ou adulterado', () => {
    expect(loadCart(memory({ [CART_KEY]: '{oops' }))).toEqual({ items: [], legacy: null });
    const tampered = { v: 2, items: [{ productId: 'x', quantity: -5, snapshot: { name: 'X' } }, { productId: 1 }] };
    expect(loadCart(memory({ [CART_KEY]: JSON.stringify(tampered) })).items).toEqual([]);
  });
});
