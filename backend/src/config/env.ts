import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim().replace(/\/$/, ''))
          .filter(Boolean),
      ),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    STORAGE_BUCKET: z.string().regex(/^[a-z0-9-]{3,63}$/).default('store-media'),
    ORDER_TOKEN_SECRET: z.string().min(32).optional(),
    ADMIN_APP_URL: z.url().optional(),
    API_DOCS_ENABLED: bool(true),
    ORDER_EXPIRATION_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),
    RATE_LIMIT_ORDERS_PER_10_MIN: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_ADMIN_PER_MIN: z.coerce.number().int().min(1).default(600),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ORDER_TOKEN_SECRET', 'ADMIN_APP_URL'] as const;
    for (const key of required) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} é obrigatória em produção` });
    }
    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'CORS_ORIGINS é obrigatória em produção' });
    }
    if (env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'CORS_ORIGINS não pode ser "*"' });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // Mostra apenas nomes das variáveis, nunca os valores.
    console.error(`Configuração inválida:\n${lines.join('\n')}`);
    process.exit(1);
  }
  const env = parsed.data;
  if (env.NODE_ENV !== 'production' && !env.ORDER_TOKEN_SECRET) {
    env.ORDER_TOKEN_SECRET = 'dev-only-order-token-secret-change-me-0000';
  }
  return env;
}

export const env = load();
