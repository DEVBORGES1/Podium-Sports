import { z } from 'zod';
import { CATEGORY_ICONS } from '../categories/categories.schemas.js';
import { hexColor, optionalText, safeLink } from '../../lib/validation.js';

const link = safeLink.nullish().transform((v) => v || null);
const date = z.coerce.date().nullish().transform((v) => v ?? null);

const fields = {
  kicker: optionalText(80),
  title: z.string().trim().min(1, 'Informe o título.').max(80),
  highlight: optionalText(80),
  subtitle: optionalText(300),
  imagePath: z
    .string()
    .regex(/^banners\/[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Imagem inválida.')
    .nullish()
    .transform((v) => v ?? null),
  icon: z
    .enum([...CATEGORY_ICONS, 'trophy'])
    .nullish()
    .transform((v) => v ?? null),
  colorFrom: hexColor,
  colorTo: hexColor,
  buttonLabel: optionalText(40),
  buttonUrl: link,
  secondaryButtonLabel: optionalText(40),
  secondaryButtonUrl: link,
  badgeTop: optionalText(20),
  badgeMain: optionalText(12),
  badgeBottom: optionalText(20),
  sortOrder: z.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  startsAt: date,
  endsAt: date,
};

const periodOk = (v: { startsAt?: Date | null; endsAt?: Date | null }) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt;
const buttonsOk = (v: { buttonLabel?: string | null; buttonUrl?: string | null }) => !v.buttonLabel === !v.buttonUrl;
const period = { message: 'A data final deve ser posterior à inicial.', path: ['endsAt'] };
const button = { message: 'Informe o texto e o destino do botão juntos.', path: ['buttonUrl'] };

export const createBannerSchema = z
  .object({
    ...fields,
    colorFrom: hexColor.default('#2a2a2e'),
    colorTo: hexColor.default('#0b0b0c'),
    sortOrder: fields.sortOrder.default(0),
    isActive: fields.isActive.default(true),
  })
  .refine(periodOk, period)
  .refine(buttonsOk, button);

export const updateBannerSchema = z.object(fields).partial().strict().refine(periodOk, period);
