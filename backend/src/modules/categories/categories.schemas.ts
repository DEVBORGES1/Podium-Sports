import { z } from 'zod';
import { hexColor, optionalText } from '../../lib/validation.js';

export const CATEGORY_ICONS = ['ball', 'run', 'jar', 'shirt', 'glove', 'dumbbell', 'shoe'] as const;

const base = {
  name: z.string().trim().min(2, 'Informe o nome.').max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens.')
    .max(100)
    .optional(),
  description: optionalText(500),
  icon: z.enum(CATEGORY_ICONS).default('dumbbell'),
  colorFrom: hexColor.default('#44464d'),
  colorTo: hexColor.default('#121214'),
  imagePath: z
    .string()
    .regex(/^categories\/[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Imagem inválida.')
    .nullish()
    .transform((v) => v ?? null),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true),
  showOnHome: z.boolean().default(false),
};

export const createCategorySchema = z.object(base);
export const updateCategorySchema = z
  .object({
    ...base,
    icon: z.enum(CATEGORY_ICONS),
    colorFrom: hexColor,
    colorTo: hexColor,
    sortOrder: z.number().int().min(0).max(100_000),
    isActive: z.boolean(),
    showOnHome: z.boolean(),
  })
  .partial();
