#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/deploy-lib.sh"
load_deploy_env
TARGET="ubuntu@${WEB_HOST:?Set WEB_HOST}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TARGET" "cd ~/hack_pton && npx pm2 logs caretaker-web --lines 200"
