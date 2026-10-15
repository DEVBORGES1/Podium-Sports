#!/usr/bin/env bash
# Backup lógico diário do banco (Supabase) feito na VPS.
#
# Uso (como root, via cron):  /usr/local/sbin/podium-backup-db  (instalação: docs/IMPLANTACAO.md, seção 8)
# - Lê DIRECT_URL de /opt/podium-sports/.env (conexão direta, não o pooler de transação).
# - Usa o pg_dump da imagem oficial do Postgres (não precisa instalar o cliente na VPS).
# - Confere se o arquivo gerado é legível (pg_restore --list) antes de aceitá-lo.
# - Mantém os últimos KEEP_DAYS dias em BACKUP_DIR (padrão: 14 dias em /var/backups/podium).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/podium-sports/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/podium}"
KEEP_DAYS="${KEEP_DAYS:-14}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

DIRECT_URL="$(grep -E '^DIRECT_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
if [ -z "$DIRECT_URL" ]; then
  echo "DIRECT_URL não encontrado em $ENV_FILE" >&2
  exit 1
fi

install -d -m 700 "$BACKUP_DIR"
STAMP="$(date +%F)"
FILE="podium-$STAMP.dump"
TMP="$BACKUP_DIR/.$FILE.partial"

# A URL vai por variável de ambiente (não aparece na lista de processos).
docker run --rm -e DIRECT_URL="$DIRECT_URL" -v "$BACKUP_DIR:/backup" "$PG_IMAGE" \
  sh -c "pg_dump \"\$DIRECT_URL\" --format=custom --no-owner --schema=public -f /backup/.$FILE.partial"

# Arquivo vazio ou corrompido não substitui o backup anterior.
docker run --rm -v "$BACKUP_DIR:/backup" "$PG_IMAGE" pg_restore --list "/backup/.$FILE.partial" > /dev/null
mv "$TMP" "$BACKUP_DIR/$FILE"
chmod 600 "$BACKUP_DIR/$FILE"

find "$BACKUP_DIR" -maxdepth 1 -name 'podium-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup ok: $BACKUP_DIR/$FILE ($(du -h "$BACKUP_DIR/$FILE" | cut -f1))"
