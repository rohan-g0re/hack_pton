#!/usr/bin/env bash
load_deploy_env() {
  local f
  f="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.deploy.env"
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$f"
    set +a
  fi
  export SSH_KEY="${SSH_KEY:-$HOME/.ssh/caretaker-key.pem}"
}
