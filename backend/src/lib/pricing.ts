import type { DiscountType } from '@prisma/client';

export interface PromotionLike {
  id: string;
  name: string;
  discountType: DiscountType;
  value: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

export interface PricedProduct {
  priceCents: number;
  salePriceCents: number | null;
}

export interface EffectivePrice {
  /** Preço cobrado agora. */
  priceCents: number;
  /** Preço cheio (exibido riscado quando há desconto). */
  regularPriceCents: number;
  onSale: boolean;
  discountPercent: number;
  promotion: { id: string; name: string; endsAt: Date } | null;
}

export function isPromotionCurrent(p: PromotionLike, now: Date): boolean {
  return p.isActive && p.startsAt <= now && p.endsAt > now;
}

/**
 * Preço que uma promoção produz para um preço base.
 * Retorna null quando a promoção não é aplicável (resultado <= 0 ou não menor que o preço base).
 */
export function promotionPrice(basePriceCents: number, discountType: DiscountType, value: number): number | null {
  let result: number;
  switch (discountType) {
    case 'PERCENTAGE':
      if (value < 1 || value > 90) return null;
      result = Math.round((basePriceCents * (100 - value)) / 100);
      break;
    case 'FIXED_AMOUNT':
      result = basePriceCents - value;
      break;
    case 'FIXED_PRICE':
      result = value;
      break;
  }
  if (!Number.isInteger(result) || result <= 0 || result >= basePriceCents) return null;
  return result;
}

/**
 * Calcula o preço oficial de um produto: o menor entre o preço cheio, o preço promocional
 * do produto e as promoções vigentes. É a única fonte de preço usada nos pedidos.
 */
export function computeEffectivePrice(product: PricedProduct, promotions: PromotionLike[], now: Date = new Date()): EffectivePrice {
  const regular = product.priceCents;
  let best = regular;
  let promotion: EffectivePrice['promotion'] = null;

  if (product.salePriceCents !== null && product.salePriceCents > 0 && product.salePriceCents < regular) {
    best = product.salePriceCents;
  }
  for (const promo of promotions) {
    if (!isPromotionCurrent(promo, now)) continue;
    const candidate = promotionPrice(regular, promo.discountType, promo.value);
    if (candidate !== null && candidate < best) {
      best = candidate;
      promotion = { id: promo.id, name: promo.name, endsAt: promo.endsAt };
    }
  }
  const onSale = best < regular;
  return {
    priceCents: best,
    regularPriceCents: regular,
    onSale,
    discountPercent: onSale ? Math.round((1 - best / regular) * 100) : 0,
    promotion,
  };
}
