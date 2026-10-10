import { Router } from 'express';
import type { Profile } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { audit, diff } from '../../lib/audit.js';
import { authAdmin } from '../../lib/auth-admin.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse, uuidParam } from '../../lib/validation.js';
import { currentProfile } from '../../middlewares/auth.js';

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email('E-mail inválido.').max(254).transform((v) => v.toLowerCase()),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']).default('ADMIN'),
});
const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    role: z.enum(['ADMIN', 'SUPER_ADMIN']),
    status: z.enum(['ACTIVE', 'DISABLED']),
  })
  .partial()
  .strict();

const toDto = (p: Profile) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role,
  status: p.status,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

/** Gestão de administradores: somente SUPER_ADMIN (verificado em app.ts). */
export const adminUsersRouter = Router();

adminUsersRouter.get('/users', async (_req, res) => {
  const users = await prisma.profile.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] });
  res.json({ items: users.map(toDto) });
});

adminUsersRouter.post('/users', async (req, res) => {
  const input = parse(createUserSchema, req.body);
  const actor = currentProfile(req);
  if (await prisma.profile.findUnique({ where: { email: input.email } })) {
    throw conflict('Já existe um administrador com este e-mail.');
  }
  const redirectTo = env.ADMIN_APP_URL ? `${env.ADMIN_APP_URL.replace(/\/$/, '')}/admin/definir-senha` : undefined;
  const { authUserId } = await authAdmin.get().inviteUser(input.email, redirectTo);
  const created = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.create({ data: { ...input, authUserId } });
    await audit(
      { profileId: actor.id, action: 'user.invite', entityType: 'profile', entityId: profile.id, metadata: { email: input.email, role: input.role } },
      tx,
    );
    return profile;
  });
  res.status(201).json(toDto(created));
});

adminUsersRouter.patch('/users/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const input = parse(updateUserSchema, req.body);
  const actor = currentProfile(req);
  const updated = await prisma.$transaction(async (tx) => {
    const target = await tx.profile.findUnique({ where: { id } });
    if (!target) throw notFound('Usuário não encontrado.');
    if (target.id === actor.id && (input.role || input.status)) {
      throw unprocessable('Você não pode alterar a própria função ou desativar a própria conta.');
    }
    const losesSuper =
      target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE' && (input.role === 'ADMIN' || input.status === 'DISABLED');
    if (losesSuper) {
      // Trava as linhas de superadministradores para evitar duas remoções simultâneas.
      const supers = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM profiles WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' FOR UPDATE`;
      if (supers.length <= 1) throw unprocessable('É necessário manter ao menos um superadministrador ativo.');
    }
    const saved = await tx.profile.update({ where: { id }, data: input });
    await audit(
      { profileId: actor.id, action: 'user.update', entityType: 'profile', entityId: id, metadata: { email: target.email, changes: diff(target, input) } as object },
      tx,
    );
    return saved;
  });
  res.json(toDto(updated));
});
