import { execSync } from 'node:child_process';
import { E2E } from '../playwright.config';

/** Banco limpo, migrations, seed e dois administradores (perfil vinculado a IDs fixos do Auth simulado). */
export default async function globalSetup() {
  const url = new URL(E2E.db);
  if (!/e2e|test/.test(url.pathname)) throw new Error('O banco de E2E deve ter "e2e" ou "test" no nome.');
  const admin = new URL(E2E.db);
  admin.pathname = '/postgres';
  const db = url.pathname.slice(1);
  const psql = (sql: string, target = admin.toString()) => execSync(`psql "${target}" -v ON_ERROR_STOP=1 -q -c "${sql}"`, { stdio: 'pipe' });
  psql(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  psql(`CREATE DATABASE ${db}`);
  const env = { ...process.env, DATABASE_URL: E2E.db, DIRECT_URL: E2E.db, SEED_DEFAULT_STOCK: '10' };
  execSync('npx prisma migrate deploy', { cwd: '../backend', env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd: '../backend', env, stdio: 'pipe' });
  psql(
    `INSERT INTO profiles (id, auth_user_id, name, email, role, status, updated_at) VALUES ` +
      `(gen_random_uuid(), '00000000-0000-4000-8000-0000000000aa', 'Dona da Loja', 'dona@podium.test', 'SUPER_ADMIN', 'ACTIVE', now()), ` +
      `(gen_random_uuid(), '00000000-0000-4000-8000-0000000000bb', 'Atendente', 'atendente@podium.test', 'ADMIN', 'ACTIVE', now())`,
    E2E.db,
  );
}
