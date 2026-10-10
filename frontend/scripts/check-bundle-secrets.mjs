// Falha o build se o bundle do navegador contiver algo que pareça uma chave secreta.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'chave secreta do Supabase (sb_secret_)'],
  [/"role"\s*:\s*"service_role"/, 'JWT service_role'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/, 'JWT com role service_role'],
  [/SUPABASE_SERVICE_ROLE_KEY|ORDER_TOKEN_SECRET|DATABASE_URL/, 'nome de variável secreta do backend'],
  [/postgres(ql)?:\/\/[^"'\s]+:[^"'\s]+@/, 'string de conexão com senha'],
];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|map|json)$/.test(name)) files.push(p);
  }
};
walk('dist');

const problems = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of PATTERNS) if (re.test(text)) problems.push(`${file}: ${label}`);
}
if (problems.length) {
  console.error('Possíveis segredos no bundle do frontend:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`check-bundle-secrets: ${files.length} arquivos verificados, nenhum segredo encontrado.`);
