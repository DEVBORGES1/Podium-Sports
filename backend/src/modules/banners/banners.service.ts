import type { Banner } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { mediaUrl, storage } from '../../lib/storage.js';
import type { createBannerSchema, updateBannerSchema } from './banners.schemas.js';

export function toBannerDto(b: Banner) {
  return {
    id: b.id,
    kicker: b.kicker,
    title: b.title,
    highlight: b.highlight,
    subtitle: b.subtitle,
    imageUrl: mediaUrl(b.imagePath),
    icon: b.icon,
    colorFrom: b.colorFrom,
    colorTo: b.colorTo,
    buttonLabel: b.buttonLabel,
    buttonUrl: b.buttonUrl,
    secondaryButtonLabel: b.secondaryButtonLabel,
    secondaryButtonUrl: b.secondaryButtonUrl,
    badgeTop: b.badgeTop,
    badgeMain: b.badgeMain,
    badgeBottom: b.badgeBottom,
    sortOrder: b.sortOrder,
  };
}

export function bannerState(b: Banner, now = new Date()) {
  if (!b.isActive) return 'INACTIVE' as const;
  if (b.startsAt && b.startsAt > now) return 'SCHEDULED' as const;
  if (b.endsAt && b.endsAt <= now) return 'EXPIRED' as const;
  return 'LIVE' as const;
}

export const toAdminBanner = (b: Banner) => ({
  ...toBannerDto(b),
  imagePath: b.imagePath,
  isActive: b.isActive,
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  state: bannerState(b),
  updatedAt: b.updatedAt,
});

export async function listPublicBanners() {
  const now = new Date();
  const banners = await prisma.banner.findMany({
    where: {
      isActive: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 10,
  });
  return banners.map(toBannerDto);
}

export async function listAdminBanners() {
  const banners = await prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return banners.map(toAdminBanner);
}

export async function createBanner(input: z.infer<typeof createBannerSchema>, profileId: string) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.banner.create({ data: input });
    await audit({ profileId, action: 'banner.create', entityType: 'banner', entityId: b.id, metadata: { title: b.title } }, tx);
    return b;
  });
}

export async function updateBanner(id: string, input: z.infer<typeof updateBannerSchema>, profileId: string) {
  const current = await prisma.banner.findUnique({ where: { id } });
  if (!current) throw notFound('Banner não encontrado.');
  const startsAt = input.startsAt !== undefined ? input.startsAt : current.startsAt;
  const endsAt = input.endsAt !== undefined ? input.endsAt : current.endsAt;
  if (startsAt && endsAt && endsAt <= startsAt) throw unprocessable('A data final deve ser posterior à inicial.');
  const label = input.buttonLabel !== undefined ? input.buttonLabel : current.buttonLabel;
  const url = input.buttonUrl !== undefined ? input.buttonUrl : current.buttonUrl;
  if (!label !== !url) throw unprocessable('Informe o texto e o destino do botão juntos.');
  const saved = await prisma.$transaction(async (tx) => {
    const b = await tx.banner.update({ where: { id }, data: input });
    await audit({ profileId, action: 'banner.update', entityType: 'banner', entityId: id, metadata: diff(current, input) as object }, tx);
    return b;
  });
  if (current.imagePath && current.imagePath !== saved.imagePath) {
    await storage.get().remove([current.imagePath]).catch(() => undefined);
  }
  return saved;
}

export async function deleteBanner(id: string, profileId: string) {
  const current = await prisma.banner.findUnique({ where: { id } });
  if (!current) throw notFound('Banner não encontrado.');
  await prisma.$transaction(async (tx) => {
    await tx.banner.delete({ where: { id } });
    await audit({ profileId, action: 'banner.delete', entityType: 'banner', entityId: id, metadata: { title: current.title } }, tx);
  });
  if (current.imagePath) await storage.get().remove([current.imagePath]).catch(() => undefined);
}
