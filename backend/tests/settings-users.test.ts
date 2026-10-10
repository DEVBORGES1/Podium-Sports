import { beforeEach, describe, expect, it } from 'vitest';
import { authAdmin } from '../src/lib/auth-admin.js';
import { prisma } from '../src/lib/prisma.js';
import { api, createAdmin, makeApp, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let superAdmin: AdminCtx;
const invited: string[] = [];

authAdmin.set({
  async inviteUser(email) {
    invited.push(email);
    return { authUserId: crypto.randomUUID() };
  },
});

beforeEach(async () => {
  await resetDb();
  superAdmin = await createAdmin('SUPER_ADMIN');
  invited.length = 0;
});

describe('configurações da loja', () => {
  it('atualiza WhatsApp, textos e conteúdo da home com auditoria', async () => {
    const res = await api(app)
      .patch('/api/v1/admin/store/settings')
      .set('Authorization', superAdmin.auth)
      .send({
        whatsappNumber: '+55 (49) 98888-7777',
        storeName: 'Podium Sports Videira',
        heroIntervalSeconds: 8,
        content: { topbarMessages: ['Frete grátis acima de R$ 300'], brandBanner: { brands: ['Nike'] } },
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ whatsappNumber: '5549988887777', storeName: 'Podium Sports Videira', heroIntervalSeconds: 8 });
    expect(res.body.content.topbarMessages).toEqual(['Frete grátis acima de R$ 300']);
    expect(res.body.content.brandBanner.title).toBe('Entra em campo.'); // padrões preservados
    const pub = await api(app).get('/api/v1/store/settings');
    expect(pub.body.whatsappNumber).toBe('5549988887777');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'settings.update' } });
    expect(log.metadata).toMatchObject({ whatsappNumber: { from: '554998090818', to: '5549988887777' } });
  });

  it('valida campos e exige ao menos uma forma de recebimento', async () => {
    const send = (body: object) => api(app).patch('/api/v1/admin/store/settings').set('Authorization', superAdmin.auth).send(body);
    expect((await send({ whatsappNumber: '123' })).status).toBe(400);
    expect((await send({ instagramUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await send({ heroIntervalSeconds: 1 })).status).toBe(400);
    expect((await send({ pickupEnabled: false, deliveryEnabled: false })).status).toBe(400);
    await send({ pickupEnabled: false });
    expect((await send({ deliveryEnabled: false })).status).toBe(422);
  });
});

describe('usuários administrativos', () => {
  it('SUPER_ADMIN convida administrador pelo Supabase Auth', async () => {
    const res = await api(app).post('/api/v1/admin/users').set('Authorization', superAdmin.auth).send({ name: 'Ana', email: 'Ana@Loja.com' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'ana@loja.com', role: 'ADMIN', status: 'ACTIVE' });
    expect(invited).toEqual(['ana@loja.com']);
    const dup = await api(app).post('/api/v1/admin/users').set('Authorization', superAdmin.auth).send({ name: 'Ana', email: 'ana@loja.com' });
    expect(dup.status).toBe(409);
  });

  it('desativar um administrador corta o acesso imediatamente', async () => {
    const other = await createAdmin('ADMIN');
    expect((await api(app).get('/api/v1/admin/products').set('Authorization', other.auth)).status).toBe(200);
    await api(app).patch(`/api/v1/admin/users/${other.profile.id}`).set('Authorization', superAdmin.auth).send({ status: 'DISABLED' });
    expect((await api(app).get('/api/v1/admin/products').set('Authorization', other.auth)).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'user.update' } })).toBe(1);
  });

  it('impede alterar a própria função', async () => {
    const self = await api(app).patch(`/api/v1/admin/users/${superAdmin.profile.id}`).set('Authorization', superAdmin.auth).send({ role: 'ADMIN' });
    expect(self.status).toBe(422);
  });

  it('dois superadministradores rebaixando um ao outro ao mesmo tempo: sempre resta um', async () => {
    const other = await createAdmin('SUPER_ADMIN');
    const results = await Promise.all([
      api(app).patch(`/api/v1/admin/users/${other.profile.id}`).set('Authorization', superAdmin.auth).send({ role: 'ADMIN' }),
      api(app).patch(`/api/v1/admin/users/${superAdmin.profile.id}`).set('Authorization', other.auth).send({ role: 'ADMIN' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(await prisma.profile.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } })).toBe(1);
  });

  it('auditoria é listada para SUPER_ADMIN', async () => {
    await api(app).post('/api/v1/admin/users').set('Authorization', superAdmin.auth).send({ name: 'Bia', email: 'bia@loja.com' });
    const res = await api(app).get('/api/v1/admin/audit-logs?action=user.').set('Authorization', superAdmin.auth);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({ action: 'user.invite', user: { id: superAdmin.profile.id } });
  });
});
