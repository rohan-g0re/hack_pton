#!/usr/bin/env bash
# Dev fallback — run Next.js locally + expose it via ngrok so phones on other
# networks can reach the app before the Linux EC2 is provisioned.
#
# Requires: ngrok installed and authed (`ngrok config add-authtoken ...`).

set -e

PORT="${PORT:-3000}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install: https://ngrok.com/download"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "[dev-tunnel] starting Next.js on :$PORT..."
npm run dev -- -p "$PORT" &
NEXT_PID=$!
trap 'kill $NEXT_PID 2>/dev/null || true' EXIT

# Give Next.js a moment to boot.
sleep 4

echo "[dev-tunnel] starting ngrok HTTPS tunnel..."
ngrok http "$PORT"
