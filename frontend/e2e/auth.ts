import type { Page } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

export const USERS = {
  owner: { id: '00000000-0000-4000-8000-0000000000aa', email: 'dona@podium.test' },
  staff: { id: '00000000-0000-4000-8000-0000000000bb', email: 'atendente@podium.test' },
  stranger: { id: '00000000-0000-4000-8000-0000000000cc', email: 'curioso@podium.test' },
};

async function sessionFor(user: { id: string; email: string }) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({ email: user.email, role: 'authenticated', aal: 'aal1' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(`${E2E.supabaseUrl}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(E2E.jwtSecret));
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `refresh-${user.id}`,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

/** Simula o Supabase Auth: senha "senha-correta" autentica o e-mail informado. */
export async function mockSupabaseAuth(page: Page) {
  await page.route(`${E2E.supabaseUrl}/auth/v1/**`, async (route) => {
    const req = route.request();
    if (req.url().includes('/token?grant_type=password')) {
      const body = JSON.parse(req.postData() ?? '{}') as { email: string; password: string };
      const user = Object.values(USERS).find((u) => u.email === body.email);
      if (!user || body.password !== 'senha-correta') {
        return route.fulfill({
          status: 400,
          json: { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' },
        });
      }
      return route.fulfill({ json: await sessionFor(user) });
    }
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 200, json: {} });
  });
}

export async function login(page: Page, email: string, password = 'senha-correta') {
  await mockSupabaseAuth(page);
  await page.goto('/admin/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Login que deve dar certo: espera o painel abrir antes de o teste navegar
  // (navegar cedo demais abortava a requisição do token e deixava o teste instável).
  const expectsPanel = password === 'senha-correta' && email !== USERS.stranger.email;
  if (expectsPanel) await page.getByRole('complementary', { name: 'Menu do painel' }).waitFor();
}
