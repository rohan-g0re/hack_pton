#!/usr/bin/env bash
set -euo pipefail
# Usage: SSH_KEY=~/.ssh/caretaker-key.pem ./scripts/sync-env.sh ubuntu@1.2.3.4 ./apps/web.env

HOST="${1:?host}"
ENV_FILE="${2:?env file}"
KEY="${SSH_KEY:-$HOME/.ssh/caretaker-key.pem}"
DEST="${3:-~/hack_pton/.env}"

scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$ENV_FILE" "${HOST}:${DEST}"
