/**
 * Cria (ou vincula) um administrador. Processo controlado: roda no servidor, com a chave de serviço.
 *
 *   npm run admin:create -- --email dono@loja.com --name "Nome do Dono" [--role SUPER_ADMIN|ADMIN]
 *
 * - Se o usuário já existe no Supabase Auth (ex.: criado em Authentication → Users), apenas cria o perfil.
 * - Caso contrário, envia um convite por e-mail para a pessoa definir a própria senha.
 * Nenhuma senha é gerada, exibida ou armazenada por este script.
 */
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'SUPER_ADMIN' } },
});
const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
const role = values.role === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN';

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
  console.error('Uso: npm run admin:create -- --email pessoa@loja.com --name "Nome" [--role SUPER_ADMIN|ADMIN]');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_APP_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (backend/.env).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const prisma = new PrismaClient();

async function findAuthUser(target: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Falha ao consultar o Supabase Auth: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  let user = await findAuthUser(email!);
  if (user) {
    console.log(`Usuário encontrado no Supabase Auth (${email}).`);
  } else {
    const redirectTo = ADMIN_APP_URL ? `${ADMIN_APP_URL.replace(/\/$/, '')}/admin/definir-senha` : undefined;
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email!, redirectTo ? { redirectTo } : {});
    if (error || !data.user) throw new Error(`Não foi possível convidar: ${error?.message ?? 'erro desconhecido'}`);
    user = data.user;
    console.log(`Convite enviado para ${email}. A pessoa define a senha pelo link recebido.`);
  }
  const profile = await prisma.profile.upsert({
    where: { authUserId: user.id },
    update: { name: name!, role, status: 'ACTIVE' },
    create: { authUserId: user.id, email: email!, name: name!, role },
  });
  await prisma.auditLog.create({
    data: { action: 'user.bootstrap', entityType: 'profile', entityId: profile.id, metadata: { email, role, via: 'cli' } },
  });
  console.log(`Perfil ${role} pronto para ${email}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
