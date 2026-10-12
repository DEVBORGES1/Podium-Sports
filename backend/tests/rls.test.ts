import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Simula o acesso pela Data API do Supabase (papéis anon e authenticated usados pelas chaves públicas).
 * Nenhuma tabela deve ser legível ou gravável por esses papéis.
 */
const TABLES = [
  'profiles',
  'categories',
  'products',
  'product_images',
  'inventory_movements',
  'banners',
  'promotions',
  'promotion_products',
  'orders',
  'order_items',
  'order_status_history',
  'order_messages',
  'store_settings',
  'audit_logs',
  '_prisma_migrations',
];

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

describe('RLS e privilégios', () => {
  it('RLS está ativada em todas as tabelas do schema public', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(`
      SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`);
    expect(rows.length).toBeGreaterThanOrEqual(TABLES.length);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('nenhuma política permissiva foi criada para anon/authenticated', async () => {
    const { rows } = await client.query(`SELECT policyname FROM pg_policies WHERE schemaname = 'public'`);
    expect(rows).toEqual([]);
  });

  for (const role of ['anon', 'authenticated']) {
    it.each(TABLES)(`papel ${role} não lê nem grava %s`, async (table) => {
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(client.query(`SELECT * FROM public."${table}" LIMIT 1`)).rejects.toThrow(/permission denied/);
      } finally {
        await client.query('ROLLBACK');
      }
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(client.query(`DELETE FROM public."${table}"`)).rejects.toThrow(/permission denied/);
      } finally {
        await client.query('ROLLBACK');
      }
    });
  }
});
