#!/usr/bin/env bash
# Teste de restauração: sobe um Postgres descartável, restaura o backup mais recente
# e confere a contagem de linhas das tabelas principais. Não toca no banco de produção.
#
# Uso (como root na VPS):  /usr/local/sbin/podium-restore-test [arquivo.dump]
# Sai com código diferente de zero se a restauração falhar ou se as tabelas vierem vazias.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/podium}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/podium-*.dump 2>/dev/null | head -n1)}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Nenhum backup encontrado em $BACKUP_DIR" >&2
  exit 1
fi

NAME="podium-restore-test-$$"
cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=restore-test -v "$(dirname "$DUMP"):/backup:ro" "$PG_IMAGE" > /dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres > /dev/null 2>&1 && break
  sleep 1
done

psql_q() { docker exec "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "$1"; }

# Papéis do Supabase citados nos GRANT/REVOKE do dump.
psql_q "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;"

echo "==> Restaurando $(basename "$DUMP")"
docker exec "$NAME" pg_restore -U postgres -d postgres --no-owner --exit-on-error "/backup/$(basename "$DUMP")"

echo "==> Linhas por tabela"
FAIL=0
for table in profiles categories products product_variants product_images orders order_items store_settings _prisma_migrations; do
  count="$(psql_q "SELECT count(*) FROM public.\"$table\"")"
  printf '  %-22s %s\n' "$table" "$count"
  case "$table" in
    categories|products|store_settings|_prisma_migrations) [ "$count" -gt 0 ] || FAIL=1 ;;
  esac
done

if [ "$FAIL" -ne 0 ]; then
  echo "FALHA: tabelas essenciais vazias no backup restaurado." >&2
  exit 1
fi
echo "$(date -Is) restauração ok: $(basename "$DUMP")"
