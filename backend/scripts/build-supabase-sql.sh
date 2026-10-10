#!/usr/bin/env bash
# Gera backend/supabase/01-instalacao.sql: migrations + registro no _prisma_migrations + dados do seed.
# Permite instalar tudo colando um único arquivo no SQL Editor do Supabase.
# Requer PostgreSQL local (PG_ADMIN_URL aponta para um banco de administração, ex.: .../postgres).
set -euo pipefail
cd "$(dirname "$0")/.."

PG_ADMIN_URL="${PG_ADMIN_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
TMP_DB="podium_sqlgen_tmp"
TMP_URL="${PG_ADMIN_URL%/*}/${TMP_DB}"
OUT="supabase/01-instalacao.sql"

psql "$PG_ADMIN_URL" -qc "DROP DATABASE IF EXISTS ${TMP_DB} WITH (FORCE)" -c "CREATE DATABASE ${TMP_DB}"
DATABASE_URL="$TMP_URL" DIRECT_URL="$TMP_URL" npx prisma migrate deploy >/dev/null
DATABASE_URL="$TMP_URL" DIRECT_URL="$TMP_URL" SEED_DEFAULT_STOCK="${SEED_DEFAULT_STOCK:-10}" npx tsx prisma/seed.ts >/dev/null

{
  echo "-- ============================================================================"
  echo "-- Podium Sports — instalação completa do banco no Supabase"
  echo "-- Gerado por backend/scripts/build-supabase-sql.sh (não edite à mão)."
  echo "--"
  echo "-- Como usar: Supabase → SQL Editor → New query → cole TODO o conteúdo → Run."
  echo "-- Roda em uma única transação: se algo falhar, nada é gravado."
  echo "-- Execute UMA vez, em um projeto novo."
  echo "-- ============================================================================"
  echo
  echo "BEGIN;"
  echo
  echo "-- Registro de migrations do Prisma (o deploy da API só aplicará migrations futuras)"
  cat <<'SQL'
CREATE TABLE "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
SQL
  for dir in prisma/migrations/*/; do
    name=$(basename "$dir")
    sum=$(sha256sum "$dir/migration.sql" | cut -c1-64)
    echo
    echo "-- ---------------------------------------------------------------------------"
    echo "-- Migration ${name}"
    echo "-- ---------------------------------------------------------------------------"
    cat "$dir/migration.sql"
    echo
    echo "INSERT INTO \"_prisma_migrations\" (id, checksum, finished_at, migration_name, applied_steps_count)"
    echo "VALUES (gen_random_uuid()::text, '${sum}', now(), '${name}', 1);"
  done
  echo
  echo "-- ---------------------------------------------------------------------------"
  echo "-- Dados iniciais (catálogo, categorias, banners e configurações do site original)"
  echo "-- Estoque provisório: ${SEED_DEFAULT_STOCK:-10} unidades por produto — ajuste no painel."
  echo "-- ---------------------------------------------------------------------------"
  pg_dump "$TMP_URL" --data-only --column-inserts --no-owner --no-privileges --no-comments \
    -t public.store_settings -t public.categories -t public.products -t public.inventory_movements -t public.banners \
    | grep -vE '^(SET |SELECT pg_catalog\.set_config|--|$)'
  echo
  echo "COMMIT;"
} > "$OUT"

psql "$PG_ADMIN_URL" -qc "DROP DATABASE IF EXISTS ${TMP_DB} WITH (FORCE)"
echo "Gerado: $OUT ($(wc -l < "$OUT") linhas)"
