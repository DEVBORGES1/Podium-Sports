import { z } from 'zod';
import { booleanQuery, optionalText, pagination } from '../../lib/validation.js';

export const MAX_QUANTITY_PER_ITEM = 20;
const MAX_PRICE = 10_000_000; // R$ 100.000,00

const price = z.number().int('Use centavos inteiros.').min(1, 'O preço deve ser maior que zero.').max(MAX_PRICE);
const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens.')
  .max(180);

export const publicListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(100).optional(),
  onSale: booleanQuery.optional(),
  featured: booleanQuery.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'name_asc', 'newest']).default('relevance'),
  page: pagination.page,
  pageSize: z.coerce.number().int().min(1).max(60).default(20),
});

export const adminListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  categoryId: z.uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  stock: z.enum(['low', 'out', 'ok']).optional(),
  featured: booleanQuery.optional(),
  sort: z.enum(['sortOrder', 'name', 'price', 'stock', 'updated']).default('sortOrder'),
  ...pagination,
});

export const createProductSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome.').max(160),
    slug: slug.optional(),
    brand: optionalText(80),
    description: optionalText(5000),
    priceCents: price,
    salePriceCents: price.nullish().transform((v) => v ?? null),
    categoryId: z.uuid('Selecione uma categoria.'),
    initialStock: z.number().int().min(0).max(1_000_000).default(0),
    minStock: z.number().int().min(0).max(1_000_000).default(0),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(100_000).default(0),
  })
  .refine((v) => v.salePriceCents === null || v.salePriceCents < v.priceCents, {
    message: 'O preço promocional deve ser menor que o preço.',
    path: ['salePriceCents'],
  });

/** Estoque não é alterado aqui: somente por movimentações no módulo de estoque. */
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug,
    brand: optionalText(80),
    description: optionalText(5000),
    priceCents: price,
    salePriceCents: price.nullable(),
    categoryId: z.uuid(),
    minStock: z.number().int().min(0).max(1_000_000),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
  })
  .partial()
  .strict();

export const updateImageSchema = z
  .object({ altText: optionalText(200), isPrimary: z.literal(true) })
  .partial()
  .strict();

export const reorderImagesSchema = z.object({ imageIds: z.array(z.uuid()).min(1).max(10) });

/** Lugares do pódio da página inicial (1º = ouro). */
export const PODIUM_SIZE = 5;
export const podiumSchema = z.object({
  productIds: z
    .array(z.uuid())
    .max(PODIUM_SIZE, `O pódio tem no máximo ${PODIUM_SIZE} lugares.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Um produto só pode ocupar um lugar no pódio.'),
});

export const legacyMapQuery = z.object({
  ids: z
    .string()
    .max(400)
    .transform((v) => v.split(',').map((s) => Number(s.trim())))
    .pipe(z.array(z.number().int().min(1).max(1_000_000)).min(1).max(100)),
});
