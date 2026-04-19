#!/usr/bin/env bash
set -euo pipefail
# Copies apps/workers.env to the worker EC2 as ~/hack_pton/.env.
# Run from repo root after setting WORKER_HOST in scripts/.deploy.env.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-lib.sh
source "$SCRIPT_DIR/deploy-lib.sh"
load_deploy_env

KEY="${SSH_KEY:-$HOME/.ssh/caretaker-key.pem}"
HOST="ubuntu@${WORKER_HOST:?Set WORKER_HOST in scripts/.deploy.env}"
ENV_FILE="$SCRIPT_DIR/../apps/workers.env"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

# Strip Windows CRLF so dotenv/loadEnv on Linux do not see trailing \r values.
sed 's/\r$//' "$ENV_FILE" > "$TMP_FILE"

echo "Pushing workers.env to $HOST (CRLF stripped) ..."
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p ~/hack_pton"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$TMP_FILE" "${HOST}:~/hack_pton/.env"

# Defense-in-depth: normalize again on the server in case anything reintroduced CR.
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "sed -i 's/\\r\$//' ~/hack_pton/.env && file ~/hack_pton/.env"
echo "Done. Verify keys: ssh -i $KEY $HOST 'grep -c SUPABASE_URL ~/hack_pton/.env'"
