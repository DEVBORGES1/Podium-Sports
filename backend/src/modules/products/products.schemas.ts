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

/** Uma ou mais marcas separadas por vírgula (ex.: "Nike,Penalty"). */
const brandList = z
  .string()
  .trim()
  .max(400)
  .transform((v) => [
    ...new Set(
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().max(80)).max(20));

export const publicListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(100).optional(),
  brand: brandList.optional(),
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

export const MAX_VARIANTS_PER_PRODUCT = 40;

/**
 * Lista completa de variações do produto, na ordem de exibição. Variações existentes vêm com "id";
 * as que ficarem de fora são excluídas. O estoque muda por "stockDelta" (diferença em relação ao
 * saldo que a tela carregou), para não desfazer reservas feitas por pedidos nesse meio-tempo.
 * Lista vazia (e variantType nulo) = o produto volta a ter um estoque único.
 */
export const setVariantsSchema = z
  .object({
    variantType: z.string().trim().min(2, 'Informe o nome da variação (ex.: Tamanho).').max(30).nullable(),
    variants: z
      .array(
        z.object({
          id: z.uuid().optional(),
          label: z.string().trim().min(1, 'Informe a opção.').max(40),
          isActive: z.boolean().default(true),
          stockDelta: z.number().int().min(-1_000_000).max(1_000_000).default(0),
        }),
      )
      .max(MAX_VARIANTS_PER_PRODUCT, `No máximo ${MAX_VARIANTS_PER_PRODUCT} opções por produto.`),
  })
  .superRefine((v, ctx) => {
    if (v.variants.length > 0 && !v.variantType) {
      ctx.addIssue({ code: 'custom', path: ['variantType'], message: 'Informe o nome da variação (ex.: Tamanho).' });
    }
    if (v.variants.length === 0 && v.variantType) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Cadastre ao menos uma opção.' });
    }
    const labels = v.variants.map((x) => x.label.toLocaleLowerCase('pt-BR'));
    if (new Set(labels).size !== labels.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Há opções repetidas.' });
    const ids = v.variants.flatMap((x) => (x.id ? [x.id] : []));
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Variação repetida.' });
    v.variants.forEach((x, i) => {
      if (!x.id && x.stockDelta < 0) ctx.addIssue({ code: 'custom', path: ['variants', i, 'stockDelta'], message: 'O estoque não pode ser negativo.' });
    });
  });

export const optimizeImagesSchema = z.object({ limit: z.number().int().min(1).max(30).default(10) });

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
