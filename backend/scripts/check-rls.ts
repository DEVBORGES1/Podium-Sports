/**
 * Verifica, contra o projeto Supabase real, que a chave PÚBLICA (anon/publishable) não acessa dados.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run check:rls
 *
 * Tenta ler e gravar cada tabela pela Data API (PostgREST) e enviar um arquivo ao Storage.
 * Sai com código 1 se algum acesso for permitido.
 */
const { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET = 'store-media' } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_ANON_KEY (chave pública).');
  process.exit(1);
}

const TABLES = [
  'profiles', 'categories', 'products', 'product_images', 'inventory_movements', 'banners', 'promotions',
  'promotion_products', 'orders', 'order_items', 'order_status_history', 'order_messages', 'product_variants', 'store_settings', 'audit_logs',
  '_prisma_migrations',
];
const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };
const base = SUPABASE_URL.replace(/\/$/, '');
let failures = 0;

async function check(label: string, res: Response) {
  const body = await res.text();
  // Bloqueado: erro HTTP. Permitido: 2xx (mesmo com lista vazia, a leitura não deveria ser possível).
  const blocked = !res.ok;
  if (!blocked) failures++;
  console.log(`${blocked ? 'OK      ' : 'FALHOU  '} ${label} → HTTP ${res.status}${blocked ? '' : ` ${body.slice(0, 80)}`}`);
}

for (const table of TABLES) {
  await check(`SELECT ${table}`, await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, { headers }));
  await check(`INSERT ${table}`, await fetch(`${base}/rest/v1/${table}`, { method: 'POST', headers, body: '{}' }));
}
await check(
  `UPLOAD storage/${STORAGE_BUCKET}`,
  await fetch(`${base}/storage/v1/object/${STORAGE_BUCKET}/rls-check-${Date.now()}.png`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'image/png' },
    body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  }),
);

console.log(failures === 0 ? '\nTodos os acessos públicos estão bloqueados.' : `\n${failures} acesso(s) indevido(s) encontrado(s)!`);
process.exit(failures === 0 ? 0 : 1);
