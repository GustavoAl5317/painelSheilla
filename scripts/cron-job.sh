#!/bin/sh
# Dispara um endpoint de cron do AdvZap.
# Uso: scripts/cron-job.sh <caminho-do-endpoint>
# Ex.:  scripts/cron-job.sh /api/cron/djen
#
# Variáveis de ambiente esperadas:
#   APP_URL     - URL base da aplicação (ex.: http://localhost:3000)
#   CRON_SECRET - mesmo valor configurado na aplicação (.env)

if [ -z "$1" ]; then
  echo "Uso: $0 <caminho-do-endpoint>" >&2
  exit 1
fi

APP_URL="${APP_URL:-http://localhost:3000}"

curl -fsS -X GET "${APP_URL}$1" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -o /dev/null -w "%{http_code} $1\n"
