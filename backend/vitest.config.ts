import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/podium_test';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    // Os arquivos compartilham o mesmo banco de teste: execução sequencial.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters!!',
      ORDER_TOKEN_SECRET: 'test-order-token-secret-with-32-plus-chars',
      ADMIN_APP_URL: 'https://loja.test',
      CORS_ORIGINS: 'https://loja.test',
      ORDER_EXPIRATION_INTERVAL_MINUTES: '0',
    },
  },
});
