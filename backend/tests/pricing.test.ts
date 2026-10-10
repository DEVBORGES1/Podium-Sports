import { describe, expect, it } from 'vitest';
import { computeEffectivePrice, promotionPrice, type PromotionLike } from '../src/lib/pricing.js';

const now = new Date('2026-05-10T12:00:00Z');
const promo = (over: Partial<PromotionLike>): PromotionLike => ({
  id: 'p1',
  name: 'Promo',
  discountType: 'PERCENTAGE',
  value: 10,
  startsAt: new Date('2026-05-01T00:00:00Z'),
  endsAt: new Date('2026-05-31T00:00:00Z'),
  isActive: true,
  ...over,
});

describe('promotionPrice', () => {
  it('aplica percentual com arredondamento em centavos', () => {
    expect(promotionPrice(19_990, 'PERCENTAGE', 15)).toBe(16_992);
  });
  it('recusa descontos que zeram, negativam ou não reduzem o preço', () => {
    expect(promotionPrice(1_000, 'FIXED_AMOUNT', 1_000)).toBeNull();
    expect(promotionPrice(1_000, 'FIXED_AMOUNT', 5_000)).toBeNull();
    expect(promotionPrice(1_000, 'FIXED_PRICE', 1_000)).toBeNull();
    expect(promotionPrice(1_000, 'FIXED_PRICE', 1_200)).toBeNull();
    expect(promotionPrice(1_000, 'PERCENTAGE', 95)).toBeNull();
  });
});

describe('computeEffectivePrice', () => {
  it('sem desconto usa o preço cheio', () => {
    const r = computeEffectivePrice({ priceCents: 5_000, salePriceCents: null }, [], now);
    expect(r).toMatchObject({ priceCents: 5_000, onSale: false, discountPercent: 0, promotion: null });
  });
  it('usa o preço promocional do produto', () => {
    const r = computeEffectivePrice({ priceCents: 59_900, salePriceCents: 39_990 }, [], now);
    expect(r).toMatchObject({ priceCents: 39_990, regularPriceCents: 59_900, onSale: true, discountPercent: 33 });
  });
  it('escolhe o menor preço entre promoção vigente e preço promocional', () => {
    const r = computeEffectivePrice({ priceCents: 10_000, salePriceCents: 9_000 }, [promo({ value: 20 })], now);
    expect(r.priceCents).toBe(8_000);
    expect(r.promotion?.id).toBe('p1');
  });
  it('ignora promoções expiradas, futuras ou inativas', () => {
    const list = [
      promo({ endsAt: new Date('2026-05-09T00:00:00Z') }),
      promo({ startsAt: new Date('2026-06-01T00:00:00Z'), endsAt: new Date('2026-07-01T00:00:00Z') }),
      promo({ isActive: false }),
    ];
    expect(computeEffectivePrice({ priceCents: 10_000, salePriceCents: null }, list, now).priceCents).toBe(10_000);
  });
});
