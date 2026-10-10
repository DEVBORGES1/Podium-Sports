import { z } from 'zod';
import { booleanQuery, optionalText } from '../../lib/validation.js';

const fields = {
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  description: optionalText(500),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE']),
  value: z.number().int('Use números inteiros (percentual ou centavos).').min(1).max(10_000_000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isActive: z.boolean(),
  productIds: z.array(z.uuid()).min(1, 'Selecione ao menos um produto.').max(500),
};

const rules = <T extends { discountType?: string; value?: number; startsAt?: Date; endsAt?: Date }>(v: T, ctx: z.RefinementCtx) => {
  if (v.discountType === 'PERCENTAGE' && v.value !== undefined && (v.value < 1 || v.value > 90)) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'O percentual deve ficar entre 1% e 90%.' });
  }
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A data final deve ser posterior à inicial.' });
  }
};

export const createPromotionSchema = z.object({ ...fields, isActive: fields.isActive.default(true) }).superRefine(rules);
export const updatePromotionSchema = z.object(fields).partial().strict().superRefine(rules);
export const adminPromotionsQuery = z.object({ active: booleanQuery.optional() });
