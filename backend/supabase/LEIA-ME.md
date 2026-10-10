# Instalação do banco pelo navegador

Alternativa a `npm run db:migrate` + `npm run db:seed` para quem não quer usar o terminal.

1. **`01-instalacao.sql`** — Supabase → SQL Editor → New query → cole o arquivo inteiro → **Run**.
   Cria tabelas, constraints, RLS, bucket `store-media`, registra as migrations no `_prisma_migrations`
   (assim o deploy da API não tenta recriá-las) e importa catálogo, categorias, banners e textos do site original.
   Roda em uma transação: se der erro, nada é gravado. Execute uma única vez, em projeto novo.
2. Authentication → Users → **Add user** → *Create new user* (marque *Auto Confirm User*).
3. **`02-primeiro-admin.sql`** — troque e-mail e nome e rode no SQL Editor para tornar esse usuário superadministrador.

Para regenerar o `01-instalacao.sql` depois de criar novas migrations: `./scripts/build-supabase-sql.sh` (requer PostgreSQL local).
