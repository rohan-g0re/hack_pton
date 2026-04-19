#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/deploy-web.sh"
"$ROOT/scripts/deploy-workers.sh"
echo "Full deploy finished."
