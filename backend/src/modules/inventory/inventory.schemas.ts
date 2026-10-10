import { z } from 'zod';
import { pagination } from '../../lib/validation.js';

const reason = z.string().trim().min(3, 'Informe a justificativa (mínimo 3 caracteres).').max(300);

export const createMovementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('IN'),
    productId: z.uuid(),
    quantity: z.number().int().min(1, 'Quantidade deve ser maior que zero.').max(100_000),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal('OUT'),
    productId: z.uuid(),
    quantity: z.number().int().min(1, 'Quantidade deve ser maior que zero.').max(100_000),
    reason,
  }),
  z.object({
    type: z.literal('ADJUSTMENT'),
    productId: z.uuid(),
    newBalance: z.number().int().min(0, 'O saldo não pode ser negativo.').max(1_000_000),
    reason,
  }),
]);

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
