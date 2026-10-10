import { z } from 'zod';
import { AppError } from './errors.js';

/** Valida e converte dados de entrada; erros viram 400 com a lista de campos. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos.', formatIssues(result.error));
  }
  return result.data;
}

export function formatIssues(error: z.ZodError) {
  return error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

export const uuidParam = z.object({ id: z.uuid('Identificador inválido.') });

export const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const booleanQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB.');

/** Link de botão: caminho interno ("/produtos?...") ou URL https. Bloqueia javascript:, data: etc. */
export const safeLink = z
  .string()
  .trim()
  .max(300)
  .refine((v) => /^\/(?!\/)[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v), {
    message: 'Use um caminho interno começando com "/" ou uma URL https://.',
  });

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
