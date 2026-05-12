#!/bin/sh
# Roda prisma migrate deploy com até 3 tentativas (advisory lock timeout na Vercel)
MAX=3
i=1
until prisma migrate deploy; do
  if [ $i -ge $MAX ]; then
    echo "migrate deploy falhou após $MAX tentativas"
    exit 1
  fi
  echo "Tentativa $i falhou, aguardando 5s..."
  i=$((i + 1))
  sleep 5
done
