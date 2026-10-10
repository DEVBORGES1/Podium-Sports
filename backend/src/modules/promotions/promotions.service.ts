import type { DiscountType, Prisma, Promotion } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { isPromotionCurrent, promotionPrice } from '../../lib/pricing.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import type { createPromotionSchema, updatePromotionSchema } from './promotions.schemas.js';

export function promotionState(p: Promotion, now = new Date()) {
  if (!p.isActive) return 'INACTIVE' as const;
  if (p.startsAt > now) return 'SCHEDULED' as const;
  if (p.endsAt <= now) return 'EXPIRED' as const;
  return 'ACTIVE' as const;
}

/** Garante que o desconto produz um preço válido (> 0 e menor que o preço) para todos os produtos. */
async function assertCompatible(tx: Tx, productIds: string[], discountType: DiscountType, value: number) {
  const products = await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, priceCents: true } });
  if (products.length !== new Set(productIds).size) throw unprocessable('Um ou mais produtos selecionados não existem.');
  const incompatible = products.filter((p) => promotionPrice(p.priceCents, discountType, value) === null);
  if (incompatible.length > 0) {
    throw unprocessable(
      'O desconto é incompatível com o preço de alguns produtos (resultaria em preço zero, negativo ou maior que o preço atual).',
      incompatible.map((p) => ({ productId: p.id, name: p.name, priceCents: p.priceCents })),
      'PROMOTION_INCOMPATIBLE',
    );
  }
}

type WithProducts = Prisma.PromotionGetPayload<{ include: { products: { include: { product: { select: { id: true; name: true; slug: true; priceCents: true } } } } } }>;

const include = {
  products: { include: { product: { select: { id: true, name: true, slug: true, priceCents: true } } } },
} as const;

export function toAdminPromotion(p: WithProducts, now = new Date()) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    discountType: p.discountType,
    value: p.value,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    isActive: p.isActive,
    state: promotionState(p, now),
    products: p.products.map((pp) => ({
      ...pp.product,
      promotionalPriceCents: promotionPrice(pp.product.priceCents, p.discountType, p.value),
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listPublicPromotions() {
  const now = new Date();
  const promos = await prisma.promotion.findMany({
    where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
    include: { products: { where: { product: { isActive: true } }, select: { productId: true } } },
    orderBy: { endsAt: 'asc' },
  });
  return promos
    .filter((p) => isPromotionCurrent(p, now))
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      discountType: p.discountType,
      value: p.value,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      productIds: p.products.map((pp) => pp.productId),
    }));
}

export async function listAdminPromotions(active?: boolean) {
  const now = new Date();
  const promos = await prisma.promotion.findMany({ include, orderBy: [{ startsAt: 'desc' }] });
  const all = promos.map((p) => toAdminPromotion(p, now));
  return active === undefined ? all : all.filter((p) => (p.state === 'ACTIVE') === active);
}

export async function getAdminPromotion(id: string) {
  const promo = await prisma.promotion.findUnique({ where: { id }, include });
  if (!promo) throw notFound('Promoção não encontrada.');
  return toAdminPromotion(promo);
}

export async function createPromotion(input: z.infer<typeof createPromotionSchema>, profileId: string) {
  const id = await prisma.$transaction(async (tx) => {
    const productIds = [...new Set(input.productIds)];
    await assertCompatible(tx, productIds, input.discountType, input.value);
    const { productIds: _ignored, ...data } = input;
    const promo = await tx.promotion.create({
      data: { ...data, products: { create: productIds.map((productId) => ({ productId })) } },
    });
    await audit(
      {
        profileId,
        action: 'promotion.create',
        entityType: 'promotion',
        entityId: promo.id,
        metadata: { name: promo.name, discountType: promo.discountType, value: promo.value, products: productIds.length },
      },
      tx,
    );
    return promo.id;
  });
  return getAdminPromotion(id);
}

export async function updatePromotion(id: string, input: z.infer<typeof updatePromotionSchema>, profileId: string) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.promotion.findUnique({ where: { id }, include: { products: true } });
    if (!current) throw notFound('Promoção não encontrada.');
    const discountType = input.discountType ?? current.discountType;
    const value = input.value ?? current.value;
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt ?? current.endsAt;
    if (endsAt <= startsAt) throw unprocessable('A data final deve ser posterior à inicial.');
    if (discountType === 'PERCENTAGE' && (value < 1 || value > 90)) throw unprocessable('O percentual deve ficar entre 1% e 90%.');
    const productIds = input.productIds ? [...new Set(input.productIds)] : current.products.map((p) => p.productId);
    await assertCompatible(tx, productIds, discountType, value);
    const { productIds: _ignored, ...data } = input;
    await tx.promotion.update({ where: { id }, data });
    if (input.productIds) {
      await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
      await tx.promotionProduct.createMany({ data: productIds.map((productId) => ({ promotionId: id, productId })) });
    }
    await audit(
      {
        profileId,
        action: 'promotion.update',
        entityType: 'promotion',
        entityId: id,
        metadata: { ...diff(current, data), ...(input.productIds ? { products: productIds.length } : {}) } as Prisma.InputJsonValue,
      },
      tx,
    );
  });
  return getAdminPromotion(id);
}

export async function deletePromotion(id: string, profileId: string) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.promotion.findUnique({ where: { id } });
    if (!current) throw notFound('Promoção não encontrada.');
    await tx.promotion.delete({ where: { id } });
    await audit({ profileId, action: 'promotion.delete', entityType: 'promotion', entityId: id, metadata: { name: current.name } }, tx);
  });
}
