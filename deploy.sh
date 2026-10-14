#!/usr/bin/env bash
# Deploy da API (backend/) para a VPS Hostinger.
# Uso: ./deploy.sh   (envia o que está commitado em HEAD; faça commit antes)
set -euo pipefail

HOST="root@72.60.243.98"
KEY="$HOME/.ssh/id_ed25519_podium"
APP_DIR="/opt/podium-sports"
HEALTH_URL="https://srv1388438.hstgr.cloud/api/v1/health"

cd "$(dirname "$0")"

if [ -n "$(git status --porcelain backend)" ]; then
  echo "Aviso: há mudanças não commitadas em backend/ (não serão enviadas)."
fi

echo "==> Enviando backend @ $(git rev-parse --short HEAD)"
git archive HEAD:backend | ssh -i "$KEY" "$HOST" "tar -x -C $APP_DIR && chown -R podium:podium $APP_DIR"

echo "==> Instalando, buildando e migrando"
ssh -i "$KEY" "$HOST" "cd $APP_DIR && su podium -c 'set -a; . ./.env; set +a; npm ci --include=dev && npm run build && npx prisma migrate deploy'"

echo "==> Reiniciando serviço"
ssh -i "$KEY" "$HOST" "systemctl restart podium-api"

sleep 4
echo "==> Health check"
curl -fsS -m 10 "$HEALTH_URL"
echo
