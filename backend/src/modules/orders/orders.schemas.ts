import { z } from 'zod';
import { optionalText, pagination } from '../../lib/validation.js';
import { MAX_QUANTITY_PER_ITEM } from '../products/products.schemas.js';

export const MAX_ITEMS_PER_ORDER = 30;

const phone = z
  .string()
  .max(30)
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{10,13}$/, 'Informe um telefone com DDD.'));

const item = z.object({
  productId: z.uuid('Produto inválido.'),
  quantity: z
    .number()
    .int('Quantidade inválida.')
    .min(1, 'Quantidade mínima: 1.')
    .max(MAX_QUANTITY_PER_ITEM, `Quantidade máxima por produto: ${MAX_QUANTITY_PER_ITEM}.`),
});

export const addressSchema = z.object({
  street: z.string().trim().min(2, 'Informe a rua.').max(160),
  number: z.string().trim().min(1, 'Informe o número.').max(20),
  district: z.string().trim().min(2, 'Informe o bairro.').max(100),
  city: z.string().trim().min(2, 'Informe a cidade.').max(100),
  complement: optionalText(160),
});

export const createOrderSchema = z
  .object({
    customer: z.object({
      name: z.string().trim().min(2, 'Informe seu nome.').max(120),
      phone,
    }),
    fulfillment: z.enum(['PICKUP', 'DELIVERY']),
    address: addressSchema.nullish(),
    notes: optionalText(500),
    items: z.array(item).min(1, 'A sacola está vazia.').max(MAX_ITEMS_PER_ORDER),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment === 'DELIVERY' && !v.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Informe o endereço para entrega.' });
    }
  });

export const quoteSchema = z.object({
  items: z
    .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(999) }))
    .min(1)
    .max(50),
});

export const idempotencyKeySchema = z
  .string({ error: 'Cabeçalho Idempotency-Key obrigatório.' })
  .regex(/^[A-Za-z0-9_-]{16,80}$/, 'Idempotency-Key inválida (16 a 80 caracteres alfanuméricos).');

export const orderCodeParam = z.object({ code: z.string().regex(/^PS-[A-Z0-9]{6}$/, 'Código de pedido inválido.') });
export const orderTokenSchema = z.string({ error: 'Token do pedido ausente.' }).min(20).max(100);

export const ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const;

export const adminOrdersQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']).optional(),
  q: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...pagination,
});

export const updateStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED']),
  note: optionalText(300),
});

export const updatePaymentSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']),
  note: optionalText(300),
});
