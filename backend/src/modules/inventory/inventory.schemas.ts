import { z } from 'zod';
import { pagination } from '../../lib/validation.js';

const reason = z.string().trim().min(3, 'Informe a justificativa (mínimo 3 caracteres).').max(300);
/** Variação movimentada: obrigatória para produtos com estoque por variação. */
const variantId = z
  .uuid()
  .nullish()
  .transform((v) => v ?? null);

export const createMovementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('IN'),
    productId: z.uuid(),
    variantId,
    quantity: z.number().int().min(1, 'Quantidade deve ser maior que zero.').max(100_000),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal('OUT'),
    productId: z.uuid(),
    variantId,
    quantity: z.number().int().min(1, 'Quantidade deve ser maior que zero.').max(100_000),
    reason,
  }),
  z.object({
    type: z.literal('ADJUSTMENT'),
    productId: z.uuid(),
    variantId,
    newBalance: z.number().int().min(0, 'O saldo não pode ser negativo.').max(1_000_000),
    reason,
  }),
]);

/**
 * Ajustes feitos na tabela de estoque (+ / −) gravados de uma vez: tudo ou nada, numa única transação.
 * Cada item vira uma entrada (delta positivo) ou saída (negativo); saídas exigem justificativa.
 */
export const batchMovementsSchema = z
  .object({
    reason: z.string().trim().max(300).optional(),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          variantId,
          delta: z
            .number()
            .int()
            .min(-100_000)
            .max(100_000)
            .refine((v) => v !== 0, 'A variação não pode ser zero.'),
        }),
      )
      .min(1, 'Nenhum ajuste para salvar.')
      .max(100, 'Salve no máximo 100 produtos de uma vez.'),
  })
  .superRefine((v, ctx) => {
    const ids = v.items.map((i) => `${i.productId}:${i.variantId ?? ''}`);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Produto repetido na lista de ajustes.' });
    if (v.items.some((i) => i.delta < 0) && (v.reason?.length ?? 0) < 3) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Informe a justificativa das saídas (mínimo 3 caracteres).' });
    }
  });

export const updateMinStockSchema = z.object({ minStock: z.number().int().min(0).max(1_000_000) }).strict();

export const inventoryListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  categoryId: z.uuid().optional(),
  stock: z.enum(['low', 'out', 'ok']).optional(),
  ...pagination,
});

export const movementsQuery = z.object({
  productId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  type: z.enum(['INITIAL', 'IN', 'OUT', 'ADJUSTMENT', 'ORDER_RESERVATION', 'ORDER_RELEASE']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...pagination,
});
