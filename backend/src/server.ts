import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { expireStaleOrders } from './modules/orders/orders.service.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, corsOrigins: env.CORS_ORIGINS }, 'API online');
});

// Libera periodicamente o estoque de pedidos abandonados (idempotente: seguro com várias instâncias).
let timer: NodeJS.Timeout | undefined;
if (env.ORDER_EXPIRATION_INTERVAL_MINUTES > 0) {
  const run = () => expireStaleOrders().catch((err) => logger.error({ err }, 'order expiration job failed'));
  timer = setInterval(run, env.ORDER_EXPIRATION_INTERVAL_MINUTES * 60_000);
  timer.unref();
  setTimeout(run, 15_000).unref();
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  if (timer) clearInterval(timer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
// Estado do processo é desconhecido após uma exceção não tratada: registra e sai (o systemd reinicia).
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
