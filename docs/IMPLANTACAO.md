# Implantação, configuração e operação

Este guia leva o projeto do zero até produção. Nenhuma credencial real deve ser copiada para o repositório: use `.env` apenas na sua máquina e as variáveis de ambiente do provedor de hospedagem.

Arquitetura recomendada (frontend e backend hospedados separadamente):

```
Navegador ──▶ Frontend estático (Vercel/Netlify/Cloudflare Pages)
                 └─ /api/* (rewrite, mesmo domínio) ──▶ API Node (Render/Railway/Fly)
                                                            ├─ Supabase PostgreSQL (pooler)
                                                            └─ Supabase Storage (chave secreta)
Navegador ──▶ Supabase Auth (login do painel, chave pública)
```

---

## 1. Projeto Supabase

1. Crie o projeto em <https://supabase.com/dashboard> (região **South America (São Paulo)**). Guarde a senha do banco em um gerenciador de senhas.
2. **Project Settings → API**: anote
   - `Project URL` → `SUPABASE_URL` (API) e `VITE_SUPABASE_URL` (frontend);
   - chave **pública** (`anon` ou `sb_publishable_…`) → `VITE_SUPABASE_ANON_KEY` (frontend);
   - chave **secreta** (`service_role` ou `sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY` (**somente** na API).
3. **JWT**: projetos novos usam chaves assimétricas — deixe `SUPABASE_JWT_SECRET` vazio e a API valida pelo JWKS (`/auth/v1/.well-known/jwks.json`). Projetos com segredo HS256 legado: preencha `SUPABASE_JWT_SECRET` com o *JWT Secret*.
4. **Project Settings → Database → Connection string**:
   - `DATABASE_URL`: pooler em **modo transação** (porta `6543`) acrescentando `?pgbouncer=true&connection_limit=5`;
   - `DIRECT_URL`: pooler em modo sessão ou conexão direta (porta `5432`) — usada pelas migrations.
5. **Authentication → Sign In / Providers**:
   - **desative “Allow new users to sign up”** — administradores só entram por convite;
   - Email: senha mínima de 10 caracteres; confirmação de e-mail ligada.
6. **Authentication → URL Configuration**: `Site URL` = domínio da loja (ex.: `https://www.podiumsports.com.br`) e, em *Redirect URLs*, `https://www.podiumsports.com.br/admin/definir-senha` (e `http://localhost:5173/admin/definir-senha` para desenvolvimento).
7. **Authentication → Emails → SMTP**: configure um SMTP próprio (o envio padrão do Supabase tem limite baixo e serve só para testes). Os convites e a recuperação de senha dependem disso.

## 2. Banco de dados (migrations)

As migrations em `backend/prisma/migrations` criam **tudo** que a aplicação precisa — nada é feito manualmente no painel do Supabase:

- tabelas, chaves estrangeiras, índices e `CHECK`s (preço > 0, estoque ≥ 0, total = subtotal − desconto, etc.);
- índice parcial que garante uma única imagem principal por produto;
- **RLS ativada em todas as tabelas, sem políticas, e privilégios revogados de `anon` e `authenticated`**;
- bucket `store-media` do Storage (público só para leitura, 5 MB, JPG/PNG/WEBP).

```bash
cd backend
cp .env.example .env          # preencha DATABASE_URL, DIRECT_URL e as chaves
npm ci
npm run db:migrate            # prisma migrate deploy
npm run db:seed               # opcional: catálogo, categorias, banners e textos do site original
```

> **Estoque do seed**: o HTML original não tinha estoque, então o seed usa `SEED_DEFAULT_STOCK` (padrão 10) e registra a movimentação “Carga inicial — ajuste com a contagem real”. Use `SEED_DEFAULT_STOCK=0` para importar tudo zerado e lançar as entradas pelo painel.

Novas alterações de schema: edite `prisma/schema.prisma`, rode `npm run db:migrate:dev -- --name descricao` localmente, revise o SQL gerado e **acrescente** `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL … FROM anon, authenticated` para tabelas novas (o teste `tests/rls.test.ts` falha se esquecer).

> **Sem terminal?** Cole `backend/supabase/01-instalacao.sql` no *SQL Editor* do Supabase: ele faz o mesmo que `db:migrate` + `db:seed` em uma única transação (ver `backend/supabase/LEIA-ME.md`).

## 3. Primeiro administrador

O cadastro público de administradores não existe. O primeiro superadministrador é criado pelo servidor (ou pelo navegador, com `backend/supabase/02-primeiro-admin.sql`):

```bash
cd backend
npm run admin:create -- --email dona@podiumsports.com.br --name "Nome da Dona" --role SUPER_ADMIN
```

- Se o e-mail já existir em *Authentication → Users*, o script só cria o perfil.
- Caso contrário, envia um convite; a pessoa define a senha em `/admin/definir-senha`.
- Depois, novos administradores são convidados em **Painel → Usuários** (somente SUPER_ADMIN).

## 4. Verificar RLS no projeto real

```bash
cd backend
SUPABASE_URL=https://SEU_REF.supabase.co SUPABASE_ANON_KEY=sua-chave-publica npm run check:rls
```

O script tenta ler e gravar cada tabela pela Data API e enviar um arquivo ao Storage usando **somente a chave pública**. Todas as linhas devem sair como `OK` (bloqueado). Rode após cada migration em produção.

## 5. Variáveis de ambiente

### API (`backend`)

| Variável | Obrigatória em produção | Descrição |
| --- | --- | --- |
| `NODE_ENV` | sim | `production` |
| `PORT` | não | porta HTTP (padrão 3333; o Render define sozinho) |
| `DATABASE_URL` / `DIRECT_URL` | sim | conexões do Supabase (ver seção 1) |
| `SUPABASE_URL` | sim | URL do projeto; também define o emissor esperado dos tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | chave secreta (Storage e convites). **Nunca** no frontend |
| `SUPABASE_JWT_SECRET` | não | só para projetos com HS256 legado |
| `ORDER_TOKEN_SECRET` | sim | ≥ 32 caracteres aleatórios (`openssl rand -base64 48`) |
| `CORS_ORIGINS` | sim | origens permitidas, separadas por vírgula (ex.: `https://www.podiumsports.com.br`) |
| `ADMIN_APP_URL` | sim | URL pública da loja (links de convite) |
| `TRUST_PROXY` | recomendado | número de proxies à frente da API (Render = 1; Vercel → Render = 2). Necessário para o rate limit por IP |
| `STORAGE_BUCKET` | não | padrão `store-media` |
| `API_DOCS_ENABLED` | não | `false` para esconder `/api/docs` em produção |
| `ORDER_EXPIRATION_INTERVAL_MINUTES` | não | frequência da expiração de pedidos pendentes (padrão 10; `0` desliga) |
| `RATE_LIMIT_*` | não | limites por IP (pedidos: 10 a cada 10 min) |
| `LOG_LEVEL` | não | `info` |

A API **não inicia** se faltar algo obrigatório: o log lista apenas os nomes das variáveis, nunca os valores.

### Frontend (`frontend`) — somente valores públicos

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | `/api/v1` quando a API é servida pelo mesmo domínio (recomendado) ou a URL completa da API |
| `VITE_SUPABASE_URL` | URL do projeto |
| `VITE_SUPABASE_ANON_KEY` | chave **pública** |

O build falha se encontrar algo parecido com uma chave secreta no bundle (`scripts/check-bundle-secrets.mjs`).

## 6. Deploy

### API no Render (exemplo; Railway/Fly funcionam igual)

1. *New → Blueprint* apontando para o repositório: o `render.yaml` da raiz cria o serviço com `rootDir: backend`.
2. Preencha as variáveis marcadas como `sync: false` no painel do Render.
3. Build: `npm ci --include=dev && npm run build`; antes de publicar cada versão roda `npx prisma migrate deploy`; start: `npm start`; health check: `/api/v1/health`.
4. Rode a API com **uma** instância, ou troque o armazenamento do rate limit por Redis antes de escalar horizontalmente (ver [SEGURANCA.md](SEGURANCA.md)). A expiração de pedidos é segura com várias instâncias.

### Frontend na Vercel (exemplo)

1. *Import Project* → *Root Directory* `frontend`, *Framework* Vite, build `npm run build`, output `dist`.
2. Variáveis `VITE_*` (seção 5).
3. Em `frontend/vercel.json`, confira se `https://podium-sports-api.onrender.com` é a URL da API (troque se o Render gerar outra). Assim `/api/*` fica no mesmo domínio da loja (sem CORS no navegador e com a CSP restrita a `'self'`).
4. `CORS_ORIGINS` da API deve conter o domínio da loja (o proxy repassa o cabeçalho `Origin`).

**API em outro domínio** (sem rewrite): use `VITE_API_URL=https://api.seudominio.com/api/v1`, inclua o domínio em `connect-src` da CSP do `vercel.json` e em `CORS_ORIGINS` da API.

### Domínios

- Loja: `www.seudominio.com.br` (frontend). API: subdomínio próprio ou via rewrite.
- Atualize `Site URL`/`Redirect URLs` do Supabase Auth, `ADMIN_APP_URL` e `CORS_ORIGINS` sempre que o domínio mudar.

## 7. Testes

| Suíte | Como rodar | Requisitos |
| --- | --- | --- |
| API (149 testes) | `cd backend && npm test` | PostgreSQL local; `TEST_DATABASE_URL` (padrão `postgresql://postgres:postgres@localhost:5432/podium_test`). O banco é **apagado** a cada execução — o nome precisa conter “test” |
| Frontend (25 testes) | `cd frontend && npm test` | nenhum (API simulada com MSW) |
| E2E (20 testes) | `cd frontend && npm run test:e2e` | PostgreSQL local; cria/recria o banco `podium_e2e`; navegadores do Playwright (`npx playwright install chromium`) |

O workflow `.github/workflows/ci.yml` roda lint, typecheck, testes, build e E2E em cada push/PR, com PostgreSQL 16 como serviço.

## 8. Backups e restauração

**Banco**
- Supabase Pro faz backup diário automático (7 dias); para recuperar um momento exato, ative *Point in Time Recovery*.
- Faça também um backup lógico próprio, fora do Supabase (ex.: diário, guardado por 30 dias):
  ```bash
  pg_dump "$DIRECT_URL" --format=custom --no-owner --schema=public -f podium-$(date +%F).dump
  ```
- Restauração em um projeto novo/limpo (mantenha os privilégios do dump: eles carregam os `REVOKE` que bloqueiam a chave pública):
  ```bash
  pg_restore --no-owner -d "$DIRECT_URL_DESTINO" podium-AAAA-MM-DD.dump
  npm --prefix backend run check:rls      # confirme que RLS/privilégios continuam bloqueando a chave pública
  ```
- Teste a restauração periodicamente em um projeto separado — backup não testado não é backup.

**Imagens (Storage)**: o bucket `store-media` é compatível com S3. Habilite as *S3 access keys* no Supabase e sincronize com `rclone sync supabase:store-media backup:podium-media` (ou `aws s3 sync`). O banco guarda apenas os caminhos (`products/<uuid>.jpg`), então restaurar os arquivos no mesmo caminho basta.

## 9. Operação do dia a dia

- **Pedidos**: chegam como *Aguardando atendimento*. Confirme pelo WhatsApp, avance o status no painel e marque **Pago** somente quando o pagamento for confirmado. O faturamento do dashboard conta só pedidos pagos.
- **Pedidos abandonados**: pendentes sem atendimento expiram após `Configurações → Pedidos e vitrine` (padrão 48 h) e o estoque reservado volta automaticamente.
- **Estoque**: o saldo só muda por movimentações (entrada, saída, ajuste com justificativa) e pelos pedidos. Tudo fica no histórico e na auditoria.
- **Produtos com pedidos** não podem ser excluídos (o histórico é preservado): desative a publicação.

## 10. Diagnóstico de falhas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| API encerra ao iniciar com “Configuração inválida” | variável obrigatória ausente/inválida | o log lista os nomes; corrija no provedor |
| `GET /api/v1/health` → `503` | banco inacessível | confira `DATABASE_URL`, senha, se o projeto Supabase está pausado |
| Erros `prepared statement … already exists` | pooler em modo transação sem `pgbouncer=true` | acrescente `?pgbouncer=true` à `DATABASE_URL` |
| Migrations travam ou falham | usando a porta 6543 | `DIRECT_URL` deve apontar para a porta 5432 |
| Login ok, mas painel diz “Esta conta não possui acesso administrativo” | usuário sem perfil | `npm run admin:create` ou convite por um SUPER_ADMIN |
| Todas as rotas do painel retornam 401 | `SUPABASE_URL` da API diferente do frontend (emissor do token) ou segredo HS256 errado | alinhe as URLs; deixe `SUPABASE_JWT_SECRET` vazio em projetos com chaves assimétricas |
| Navegador bloqueia chamadas (CORS) | domínio fora de `CORS_ORIGINS` | adicione a origem exata (com `https://`, sem barra final) |
| Upload responde `503 STORAGE_NOT_CONFIGURED` | `SUPABASE_SERVICE_ROLE_KEY` ausente | configure a chave secreta na API |
| Convite não chega | SMTP padrão do Supabase limitado | configure SMTP próprio (seção 1) |
| `429` em pedidos | rate limit por IP | se todos os clientes aparecem com o mesmo IP, ajuste `TRUST_PROXY` |

Cada resposta da API traz `X-Request-Id`; o mesmo ID aparece nos logs estruturados (JSON) e no corpo dos erros (`requestId`), facilitando localizar a falha. Os logs não registram tokens, cabeçalhos de autenticação, corpo das requisições nem IPs.
