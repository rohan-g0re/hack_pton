#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=deploy-lib.sh
source "${ROOT}/scripts/deploy-lib.sh"
load_deploy_env

TARGET="ubuntu@${WEB_HOST:?Set WEB_HOST in scripts/.deploy.env (copy from .deploy.env.example)}"

# Pre-deploy: strip Windows CRLF from anything pm2 / bash will execute.
echo "→ Normalising line endings (CRLF → LF) for shell + pm2 configs locally"
find "${ROOT}/scripts" -maxdepth 1 -type f -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//'
sed -i 's/\r$//' "${ROOT}/ecosystem.web.config.cjs" "${ROOT}/ecosystem.workers.config.cjs" 2>/dev/null || true

RSYNC=(rsync -az --delete --exclude node_modules --exclude .git --exclude .env -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new")
"${RSYNC[@]}" "${ROOT}/" "${TARGET}:~/hack_pton/"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TARGET" '
  set -e
  cd ~/hack_pton
  sed -i "s/\r\$//" .env ecosystem.web.config.cjs 2>/dev/null || true
  npm install --omit=dev
  npx pm2 delete caretaker-web 2>/dev/null || true
  npx pm2 flush 2>/dev/null || true
  npx pm2 start ecosystem.web.config.cjs
  npx pm2 save
'

echo "→ Verifying web health (5s grace)"
sleep 5
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TARGET" '
  set +e
  npx pm2 list
  curl -sS -m 3 http://127.0.0.1:3000/healthz || curl -sS -m 3 http://127.0.0.1:3000/ -o /dev/null -w "HTTP %{http_code}\n" || echo "WARN: web did not respond"
'
echo "Web deployed to ${WEB_HOST}"
