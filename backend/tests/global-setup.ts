import { execSync } from 'node:child_process';
import pg from 'pg';

/**
 * Prepara um banco de teste limpo e aplica as migrations reais.
 * Cria os papéis anon/authenticated (existentes no Supabase) para testar o bloqueio por RLS.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/podium_test';
  if (!/podium_test|_test\b|test/.test(new URL(url).pathname)) {
    throw new Error('TEST_DATABASE_URL precisa apontar para um banco de TESTE (o nome deve conter "test").');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$;
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    -- Simula o padrão do Supabase: novas tabelas recebem privilégios para anon/authenticated.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await client.end();
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
