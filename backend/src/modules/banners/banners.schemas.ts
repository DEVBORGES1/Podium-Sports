import { z } from 'zod';
import { CATEGORY_ICONS } from '../categories/categories.schemas.js';
import { hexColor, optionalText, safeLink } from '../../lib/validation.js';
import { buttonTargetSchema } from './banners.targets.js';

const link = safeLink.nullish().transform((v) => v || null);
const date = z.coerce
  .date()
  .nullish()
  .transform((v) => v ?? null);
const cents = z
  .number()
  .int('Use um valor em centavos.')
  .min(1, 'O preço deve ser maior que zero.')
  .max(10_000_000)
  .nullish()
  .transform((v) => v ?? null);
const percent = z
  .number()
  .min(0)
  .max(100)
  .transform((v) => Math.round(v * 100) / 100);

/** Enquadramento da foto: "fill" preenche a área (pode cortar), "fit" mostra a imagem inteira. Posição em % e zoom ≥ 1. */
const frame = z
  .object({
    mode: z.enum(['fill', 'fit']),
    x: percent,
    y: percent,
    zoom: z
      .number()
      .min(1)
      .max(3)
      .transform((v) => Math.round(v * 100) / 100),
  })
  .strict();
export const imageFrameSchema = z.object({ desktop: frame, mobile: frame.nullable() }).strict();
export type ImageFrame = z.infer<typeof imageFrameSchema>;

const bannerImagePath = z
  .string()
  .regex(/^banners\/[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Imagem inválida.')
  .nullish()
  .transform((v) => v ?? null);

const fields = {
  kicker: optionalText(80),
  showKicker: z.boolean(),
  title: z.string().trim().min(1, 'Informe o título.').max(80),
  highlight: optionalText(80),
  subtitle: optionalText(300),
  footnote: optionalText(160),
  priceOriginalCents: cents,
  priceSaleCents: cents,
  showPrices: z.boolean(),
  imagePath: bannerImagePath,
  imageFrame: imageFrameSchema.nullable().optional(),
  imageBg: hexColor.nullish().transform((v) => v ?? null),
  /** Foto só para o celular; nula = o celular usa a foto principal. */
  mobileImagePath: bannerImagePath,
  mobileImageBg: hexColor.nullish().transform((v) => v ?? null),
  layout: z.enum(['split', 'full']),
  contentAlign: z.enum(['left', 'right']),
  overlay: z.number().int().min(0).max(90),
  /** Formato e escurecimento só do celular; nulos = o celular usa os do computador. */
  mobileLayout: z
    .enum(['split', 'full'])
    .nullish()
    .transform((v) => v ?? null),
  mobileOverlay: z
    .number()
    .int()
    .min(0)
    .max(90)
    .nullish()
    .transform((v) => v ?? null),
  icon: z
    .enum([...CATEGORY_ICONS, 'trophy'])
    .nullish()
    .transform((v) => v ?? null),
  colorFrom: hexColor,
  colorTo: hexColor,
  buttonLabel: optionalText(40),
  /** Legado: caminho/URL digitado. Quando buttonTarget é enviado, o servidor gera este endereço. */
  buttonUrl: link,
  buttonTarget: buttonTargetSchema.nullable().optional(),
  secondaryButtonLabel: optionalText(40),
  secondaryButtonUrl: link,
  secondaryButtonTarget: buttonTargetSchema.nullable().optional(),
  secondaryButtonEnabled: z.boolean(),
  badgeTop: optionalText(20),
  badgeMain: optionalText(12),
  badgeBottom: optionalText(20),
  sortOrder: z.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  startsAt: date,
  endsAt: date,
};

const periodOk = (v: { startsAt?: Date | null; endsAt?: Date | null }) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt;
const pricesOk = (v: { priceOriginalCents?: number | null; priceSaleCents?: number | null }) =>
  !v.priceOriginalCents || !v.priceSaleCents || v.priceOriginalCents > v.priceSaleCents;
const buttonsOk = (v: { buttonLabel?: string | null; buttonUrl?: string | null; buttonTarget?: unknown }) =>
  !v.buttonLabel === !(v.buttonUrl || v.buttonTarget);
const period = { message: 'A data final deve ser posterior à inicial.', path: ['endsAt'] };
const prices = { message: 'O preço original deve ser maior que o preço promocional.', path: ['priceOriginalCents'] };
const button = { message: 'Informe o texto e o destino do botão juntos.', path: ['buttonTarget'] };
/** A foto de celular complementa a principal: sem foto principal não há o que trocar no celular. */
const mobileOk = (v: { imagePath?: string | null; mobileImagePath?: string | null }) => !v.mobileImagePath || !!v.imagePath;
const mobile = { message: 'Envie primeiro a foto principal; a foto do celular é uma alternativa a ela.', path: ['mobileImagePath'] };

export const createBannerSchema = z
  .object({
    ...fields,
    showKicker: fields.showKicker.default(true),
    showPrices: fields.showPrices.default(true),
    secondaryButtonEnabled: fields.secondaryButtonEnabled.default(true),
    layout: fields.layout.default('full'),
    contentAlign: fields.contentAlign.default('left'),
    overlay: fields.overlay.default(85),
    colorFrom: hexColor.default('#2a2a2e'),
    colorTo: hexColor.default('#0b0b0c'),
    sortOrder: fields.sortOrder.default(0),
    isActive: fields.isActive.default(true),
  })
  .refine(periodOk, period)
  .refine(pricesOk, prices)
  .refine(buttonsOk, button)
  .refine(mobileOk, mobile);

export const updateBannerSchema = z.object(fields).partial().strict().refine(periodOk, period).refine(pricesOk, prices);
