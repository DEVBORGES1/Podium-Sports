import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { requireAdmin, requireRole } from './middlewares/auth.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { limiter } from './middlewares/rate-limit.js';
import { adminAuditRouter } from './modules/audit/audit.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { adminBannersRouter, publicBannersRouter } from './modules/banners/banners.routes.js';
import { adminCategoriesRouter, publicCategoriesRouter } from './modules/categories/categories.routes.js';
import { adminDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { adminInventoryRouter } from './modules/inventory/inventory.routes.js';
import { adminOrdersRouter, publicOrdersRouter } from './modules/orders/orders.routes.js';
import { adminProductsRouter, publicProductsRouter } from './modules/products/products.routes.js';
import { adminPromotionsRouter, publicPromotionsRouter } from './modules/promotions/promotions.routes.js';
import { adminSettingsRouter, publicSettingsRouter } from './modules/settings/settings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { adminUsersRouter } from './modules/users/users.routes.js';

export interface AppOptions {
  rateLimits?: Partial<{ publicPerMin: number; ordersPer10Min: number; adminPerMin: number; authPerMin: number }>;
}

export const OPENAPI_PATH = fileURLToPath(new URL('../openapi.yaml', import.meta.url));

export function createApp(options: AppOptions = {}) {
  const limits = {
    publicPerMin: env.RATE_LIMIT_PUBLIC_PER_MIN,
    ordersPer10Min: env.RATE_LIMIT_ORDERS_PER_10_MIN,
    adminPerMin: env.RATE_LIMIT_ADMIN_PER_MIN,
    authPerMin: 60,
    ...options.rateLimits,
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Somente o necessário: sem cabeçalhos (tokens), corpo (dados pessoais) ou IP.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Necessário apenas para a interface do Swagger em /api/docs.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  const allowed = new Set(env.CORS_ORIGINS);
  app.use(
    cors({
      origin: (origin, cb) => {
        // Requisições sem Origin (curl, health checks) não são de navegador: CORS não se aplica.
        if (!origin) return cb(null, true);
        if (allowed.has(origin)) return cb(null, true);
        if (env.NODE_ENV === 'development' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Order-Token', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  const api = Router();

  // ---------- Saúde ----------
  api.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok', uptimeSeconds: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  // Rotas administrativas e de autenticação primeiro: não consomem o limite das rotas públicas.
  // ---------- Autenticação ----------
  api.use('/auth', limiter(60_000, limits.authPerMin));
  api.use(authRouter);

  // ---------- Administração (todas as rotas exigem administrador ativo) ----------
  const admin = Router();
  admin.use(limiter(60_000, limits.adminPerMin));
  admin.use(requireAdmin);
  admin.use(
    adminDashboardRouter,
    adminProductsRouter,
    adminCategoriesRouter,
    adminInventoryRouter,
    adminOrdersRouter,
    adminBannersRouter,
    adminPromotionsRouter,
    adminSettingsRouter,
  );
  admin.use('/uploads', limiter(10 * 60_000, 120));
  admin.use(uploadsRouter);
  const superAdmin = Router();
  superAdmin.use(requireRole('SUPER_ADMIN'));
  superAdmin.use(adminUsersRouter, adminAuditRouter);
  admin.use(superAdmin);
  api.use('/admin', admin);

  // ---------- Público ----------
  const publicApi = Router();
  publicApi.use(limiter(60_000, limits.publicPerMin));
  publicApi.use(publicSettingsRouter, publicCategoriesRouter, publicProductsRouter, publicBannersRouter, publicPromotionsRouter);
  publicApi.post('/orders', limiter(10 * 60_000, limits.ordersPer10Min));
  publicApi.use(publicOrdersRouter);
  api.use(publicApi);

  app.use('/api/v1', api);

  // ---------- Documentação ----------
  if (env.API_DOCS_ENABLED) {
    const spec = YAML.parse(readFileSync(OPENAPI_PATH, 'utf8'));
    app.get('/api/v1/openapi.json', (_req, res) => {
      res.json(spec);
    });
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Podium Sports API' }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
