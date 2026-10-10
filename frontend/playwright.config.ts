import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra a API real e um banco PostgreSQL dedicado (podium_e2e por padrão).
 * O login do painel usa o endpoint do Supabase Auth simulado (ver e2e/auth.ts):
 * os tokens são assinados com o segredo HS256 configurado na API de teste,
 * então a validação real de JWT, perfil e permissões é exercitada.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/podium_e2e';
export const E2E = {
  apiPort: 3334,
  webPort: 5174,
  supabaseUrl: 'https://e2e-project.supabase.co',
  jwtSecret: 'e2e-jwt-secret-with-at-least-32-characters!!',
  db: E2E_DB,
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${E2E.webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /store\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: '../backend',
      port: E2E.apiPort,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        PORT: String(E2E.apiPort),
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E_DB,
        DIRECT_URL: E2E_DB,
        SUPABASE_URL: E2E.supabaseUrl,
        SUPABASE_JWT_SECRET: E2E.jwtSecret,
        ORDER_TOKEN_SECRET: 'e2e-order-token-secret-with-32-plus-chars',
        CORS_ORIGINS: `http://localhost:${E2E.webPort}`,
        ORDER_EXPIRATION_INTERVAL_MINUTES: '0',
        RATE_LIMIT_ORDERS_PER_10_MIN: '1000',
      },
    },
    {
      command: `npx vite --port ${E2E.webPort} --strictPort`,
      port: E2E.webPort,
      reuseExistingServer: false,
      env: {
        VITE_API_URL: '/api/v1',
        VITE_DEV_API_PROXY: `http://localhost:${E2E.apiPort}`,
        VITE_SUPABASE_URL: E2E.supabaseUrl,
        VITE_SUPABASE_ANON_KEY: 'e2e-public-anon-key',
      },
    },
  ],
});
