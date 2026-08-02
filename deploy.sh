#!/usr/bin/env bash
#
# Deploy seguro do painel.
# Uso:  ./deploy.sh
#
# Regras de ouro deste script:
#   - Builda ANTES de reiniciar o pm2. Se o build falhar, o pm2 NAO reinicia,
#     entao o site continua no ar com a versao anterior (nunca fica no ar quebrado).
#   - Se voce apertar Ctrl+C no meio, ele avisa que o build pode ter ficado
#     incompleto e que precisa rodar de novo ate ver "DEPLOY CONCLUIDO".
#   - No fim, mostra o commit e a data do build pra voce conferir que subiu mesmo.

set -euo pipefail

BRANCH="claude/vibrant-thompson-4563a7"
REPO_DIR="$HOME/painelSheilla"

trap 'echo ""; echo ">>> INTERROMPIDO. Se foi durante o build, o .next pode ter ficado incompleto."; echo ">>> Rode ./deploy.sh de novo e espere aparecer DEPLOY CONCLUIDO."; exit 130' INT

cd "$REPO_DIR"

echo "==> 1/3  Atualizando codigo (branch $BRANCH)..."
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo "    commit: $(git log --oneline -1)"

echo "==> 2/3  Buildando... (leva alguns minutos — NAO aperte Ctrl+C)"
if npm run build; then
  echo "==> 3/3  Build OK. Reiniciando o pm2..."
  pm2 restart all --update-env

  echo ""
  echo "============================================================"
  echo " DEPLOY CONCLUIDO"
  echo "   commit : $(git log --oneline -1)"
  echo "   build  : $(stat -c '%y' .next/BUILD_ID 2>/dev/null || echo '??')"
  echo "============================================================"
  pm2 list
else
  echo ""
  echo "############################################################"
  echo " BUILD FALHOU — o pm2 NAO foi reiniciado."
  echo " O site continua no ar com a versao anterior."
  echo " Veja o erro acima. Se for falta de memoria, cheque:  free -h"
  echo "############################################################"
  exit 1
fi
