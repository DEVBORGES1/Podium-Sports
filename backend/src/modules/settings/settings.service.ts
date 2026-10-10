import type { Prisma, StoreSettings } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { mediaUrl } from '../../lib/storage.js';
import { contentSchema, type updateSettingsSchema } from './settings.schemas.js';

export const DEFAULT_SETTINGS = {
  storeName: 'Podium Sports',
  whatsappNumber: '554998090818',
  phoneDisplay: '(49) 99809-0818',
  city: 'Videira, SC',
  whatsappGreeting: 'Olá, Podium Sports! Vim pelo site.',
  orderMessageIntro: 'Olá, Podium Sports! Quero fazer este pedido:',
  pickupInfo: 'Retire na loja em Videira, SC.',
  deliveryInfo: 'Entrega em Videira e região — taxa combinada pelo WhatsApp.',
} as const;

export async function getSettings(): Promise<StoreSettings> {
  const found = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  if (found) return found;
  return prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_SETTINGS, content: contentSchema.parse({}) },
  });
}

/** Lê o conteúdo salvo aplicando os padrões para campos ausentes ou inválidos. */
export function readContent(raw: Prisma.JsonValue) {
  const parsed = contentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : contentSchema.parse({});
}

export function toPublicSettings(s: StoreSettings) {
  return {
    storeName: s.storeName,
    logoUrl: mediaUrl(s.logoPath),
    whatsappNumber: s.whatsappNumber,
    phoneDisplay: s.phoneDisplay,
    email: s.email,
    address: s.address,
    city: s.city,
    openingHours: s.openingHours,
    pickupEnabled: s.pickupEnabled,
    deliveryEnabled: s.deliveryEnabled,
    pickupInfo: s.pickupInfo,
    deliveryInfo: s.deliveryInfo,
    instagramUrl: s.instagramUrl,
    facebookUrl: s.facebookUrl,
    tiktokUrl: s.tiktokUrl,
    whatsappGreeting: s.whatsappGreeting,
    orderMessageIntro: s.orderMessageIntro,
    orderMessageFooter: s.orderMessageFooter,
    heroIntervalSeconds: s.heroIntervalSeconds,
    content: readContent(s.content),
  };
}

export function toAdminSettings(s: StoreSettings) {
  return {
    ...toPublicSettings(s),
    logoPath: s.logoPath,
    pendingOrderTtlHours: s.pendingOrderTtlHours,
    timezone: s.timezone,
    updatedAt: s.updatedAt,
  };
}

export async function updateSettings(input: z.infer<typeof updateSettingsSchema>, profileId: string) {
  const current = await getSettings();
  const pickup = input.pickupEnabled ?? current.pickupEnabled;
  const delivery = input.deliveryEnabled ?? current.deliveryEnabled;
  if (!pickup && !delivery) {
    throw unprocessable('Mantenha ao menos uma forma de recebimento (retirada ou entrega).');
  }
  const { content, ...rest } = input;
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.storeSettings.update({
      where: { id: 1 },
      data: { ...rest, ...(content ? { content: content as Prisma.InputJsonValue } : {}) },
    });
    const changes = diff(current as unknown as Record<string, unknown>, rest as Record<string, unknown>);
    if (content) changes.content = { from: '(conteúdo anterior)', to: '(conteúdo atualizado)' };
    await audit(
      { profileId, action: 'settings.update', entityType: 'store_settings', entityId: '1', metadata: changes as Prisma.InputJsonValue },
      tx,
    );
    return saved;
  });
  return updated;
}
