#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=deploy-lib.sh
source "${ROOT}/scripts/deploy-lib.sh"
load_deploy_env

TARGET="ubuntu@${WORKER_HOST:?Set WORKER_HOST in scripts/.deploy.env}"

# Pre-deploy: strip Windows CRLF from anything pm2 / bash will execute, so the
# server never sees `bash\r` shebangs or trailing \r baked into ecosystem env.
echo "→ Normalising line endings (CRLF → LF) for shell + pm2 configs locally"
find "${ROOT}/scripts" -maxdepth 1 -type f -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//'
sed -i 's/\r$//' "${ROOT}/ecosystem.workers.config.cjs" "${ROOT}/ecosystem.web.config.cjs" 2>/dev/null || true

RSYNC=(rsync -az --delete --exclude node_modules --exclude .git --exclude .env -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new")
"${RSYNC[@]}" "${ROOT}/" "${TARGET}:~/hack_pton/"

# Always re-load the ecosystem cleanly (delete + start beats startOrRestart for
# config-file changes — pm2 can otherwise keep the old `env` block in memory).
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TARGET" '
  set -e
  cd ~/hack_pton
  sed -i "s/\r\$//" .env ecosystem.workers.config.cjs 2>/dev/null || true
  npm install --omit=dev
  npx pm2 delete caretaker-worker caretaker-notifier 2>/dev/null || true
  npx pm2 flush 2>/dev/null || true
  npx pm2 start ecosystem.workers.config.cjs
  npx pm2 save
'

# Post-deploy verification — non-fatal; we want a loud signal but not a blocker
echo "→ Verifying worker health (5s grace)"
sleep 5
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TARGET" '
  set +e
  echo "--- pm2 status ---"
  npx pm2 list
  echo "--- worker /health ---"
  curl -sS -m 3 http://127.0.0.1:3031/health || echo "WARN: worker health did not respond"
  echo
  echo "--- recent error log (post-flush) ---"
  npx pm2 logs caretaker-worker --lines 10 --nostream --err 2>&1 | tail -15
'
echo "Workers deployed to ${WORKER_HOST}"
