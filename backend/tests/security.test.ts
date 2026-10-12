import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, createAdmin, makeApp, resetDb, signToken } from './helpers.js';

const app = makeApp();

const ADMIN_ROUTES: [string, string][] = [
  ['get', '/api/v1/admin/dashboard/summary'],
  ['get', '/api/v1/admin/dashboard/sales'],
  ['get', '/api/v1/admin/dashboard/top-products'],
  ['get', '/api/v1/admin/products'],
  ['post', '/api/v1/admin/products'],
  ['patch', `/api/v1/admin/products/${randomUUID()}`],
  ['delete', `/api/v1/admin/products/${randomUUID()}`],
  ['get', '/api/v1/admin/categories'],
  ['post', '/api/v1/admin/categories'],
  ['get', '/api/v1/admin/inventory'],
  ['get', '/api/v1/admin/inventory/movements'],
  ['post', '/api/v1/admin/inventory/movements'],
  ['get', '/api/v1/admin/orders'],
  ['get', '/api/v1/admin/orders/live'],
  ['post', `/api/v1/admin/orders/${randomUUID()}/messages`],
  ['post', `/api/v1/admin/orders/${randomUUID()}/messages/${randomUUID()}/confirm`],
  ['patch', `/api/v1/admin/orders/${randomUUID()}/status`],
  ['patch', `/api/v1/admin/orders/${randomUUID()}/payment`],
  ['get', '/api/v1/admin/banners'],
  ['post', '/api/v1/admin/banners'],
  ['get', '/api/v1/admin/promotions'],
  ['get', '/api/v1/admin/store/settings'],
  ['patch', '/api/v1/admin/store/settings'],
  ['post', '/api/v1/admin/uploads?folder=banners'],
  ['get', '/api/v1/admin/users'],
  ['get', '/api/v1/admin/audit-logs'],
  ['get', '/api/v1/auth/me'],
];

beforeEach(resetDb);

describe('rotas administrativas', () => {
  it.each(ADMIN_ROUTES)('%s %s exige autenticação (401 para anônimo)', async (method, path) => {
    const res = await (api(app) as unknown as Record<string, (p: string) => Promise<{ status: number; body: { error: { code: string } } }>>)[method]!(path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejeita token com assinatura inválida', async () => {
    const forged = await signToken(randomUUID(), { secret: new TextEncoder().encode('outro-segredo-qualquer-com-32-caracteres!!') });
    const res = await api(app).get('/api/v1/admin/products').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejeita token expirado, de outro emissor ou outra audiência', async () => {
    const { profile } = await createAdmin();
    for (const token of [
      await signToken(profile.authUserId, { expiresIn: '-10s' }),
      await signToken(profile.authUserId, { issuer: 'https://evil.supabase.co/auth/v1' }),
      await signToken(profile.authUserId, { audience: 'anon' }),
    ]) {
      const res = await api(app).get('/api/v1/admin/products').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('rejeita tokens sem assinatura (alg "none")', async () => {
    const { profile } = await createAdmin();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: profile.authUserId, aud: 'authenticated', iss: 'https://test-project.supabase.co/auth/v1', exp: 9999999999 }),
    ).toString('base64url');
    const res = await api(app).get('/api/v1/admin/products').set('Authorization', `Bearer ${header}.${payload}.`);
    expect(res.status).toBe(401);
  });

  it('usuário autenticado sem perfil administrativo recebe 403', async () => {
    const token = await signToken(randomUUID());
    const res = await api(app).get('/api/v1/admin/products').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('administrador desativado recebe 403 imediatamente', async () => {
    const { auth } = await createAdmin('ADMIN', 'DISABLED');
    const res = await api(app).get('/api/v1/admin/products').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('ADMIN não acessa rotas de SUPER_ADMIN', async () => {
    const { auth } = await createAdmin('ADMIN');
    expect((await api(app).get('/api/v1/admin/users').set('Authorization', auth)).status).toBe(403);
    expect((await api(app).get('/api/v1/admin/audit-logs').set('Authorization', auth)).status).toBe(403);
    expect((await api(app).post('/api/v1/admin/users').set('Authorization', auth).send({ name: 'X', email: 'x@y.com' })).status).toBe(403);
  });

  it('GET /auth/me devolve o perfil', async () => {
    const { auth, profile } = await createAdmin('SUPER_ADMIN');
    const res = await api(app).get('/api/v1/auth/me').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: profile.id, role: 'SUPER_ADMIN' });
  });

  it('token assinado com algoritmo diferente do esperado não é aceito', async () => {
    const { profile } = await createAdmin();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject(profile.authUserId)
      .setIssuer('https://test-project.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('test-jwt-secret-with-at-least-32-characters!!'));
    expect((await api(app).get('/api/v1/admin/products').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });
});

describe('cabeçalhos e erros', () => {
  it('aplica cabeçalhos de segurança e não expõe x-powered-by', async () => {
    const res = await api(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('CORS só libera origens configuradas', async () => {
    const ok = await api(app).get('/api/v1/categories').set('Origin', 'https://loja.test');
    expect(ok.headers['access-control-allow-origin']).toBe('https://loja.test');
    const bad = await api(app).get('/api/v1/categories').set('Origin', 'https://site-malicioso.com');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('JSON inválido e corpo grande demais geram erros padronizados', async () => {
    const bad = await api(app).post('/api/v1/orders/quote').set('Content-Type', 'application/json').send('{"items":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    const big = await api(app)
      .post('/api/v1/orders/quote')
      .send({ items: [], pad: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
  });

  it('rota inexistente devolve 404 em JSON', async () => {
    const res = await api(app).get('/api/v1/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('rate limiting', () => {
  it('limita a criação de pedidos por IP', async () => {
    const limited = makeApp({ rateLimits: { ordersPer10Min: 2 } });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await api(limited).post('/api/v1/orders').send({})).status);
    }
    expect(statuses.slice(0, 2)).toEqual([400, 400]);
    expect(statuses[2]).toBe(429);
  });

  it('limita requisições públicas excessivas', async () => {
    const limited = makeApp({ rateLimits: { publicPerMin: 3 } });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await api(limited).get('/api/v1/categories')).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
