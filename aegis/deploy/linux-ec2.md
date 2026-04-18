# Linux EC2 — Aegis app host runbook

The Linux EC2 runs the Next.js app, the 30 s scheduler, the 3 s perception loop, and the Knot integration. All stateful pieces live here.

## 1. Instance

- **Type:** `t3.medium` or larger (two always-on loops + occasional Gemini calls).
- **AMI:** Ubuntu 22.04 LTS.
- **Disk:** 20 GB gp3.
- **Elastic IP:** allocate one and attach. Point a subdomain at it (e.g. `aegis.example.com`).
- **Security group inbound:** 22 (SSH, your IP), 80 (Caddy HTTP→HTTPS redirect), 443 (Caddy HTTPS).

## 2. Base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential curl caddy
```

## 3. Node 24 via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
node -v   # v24.x
```

## 4. Clone and install

```bash
git clone <repo-url> aegis-app
cd aegis-app/aegis
npm install
cp .env.example .env
# edit .env: GEMINI_API_KEY, KNOT_*, KNOT_MERCHANT_ID, IMESSAGE_BRIDGE_URL,
# IMESSAGE_BRIDGE_TOKEN, AEGIS_PUBLIC_URL=https://aegis.example.com
```

## 5. Prelink Knot (one-time)

```bash
npm run prelink:knot
# pick your target merchant; script writes data/knot-merchants.json,
# data/knot-products.json, and prints KNOT_MERCHANT_ID=<id>
# — paste that into .env
```

## 6. Build + run under pm2

```bash
npm install -g pm2
npm run build
pm2 start npm --name aegis -- run start
pm2 save
pm2 startup   # copy-paste the printed sudo command
```

## 7. TLS via Caddy + Let's Encrypt

Create `/etc/caddy/Caddyfile`:

```
aegis.example.com {
  reverse_proxy localhost:3000
  encode gzip
}
```

```bash
sudo systemctl restart caddy
```

Caddy provisions the Let's Encrypt cert automatically. Verify with `curl -I https://aegis.example.com`.

## 8. Smoke test

- Open `https://aegis.example.com/dashboard` → dashboard renders.
- `curl https://aegis.example.com/api/perception-state | jq .meta` → `tickCount` is non-zero after a few seconds.
- From a teammate's phone, open `https://aegis.example.com/onboarding/patient` → camera picker flow works.

## 9. Operational

- Logs: `pm2 logs aegis`.
- Update: `git pull && npm install && npm run build && pm2 restart aegis`.
- Env change: `pm2 restart aegis --update-env` after editing `.env`.
- In-memory state (snapshotStore, perceptionState) resets on restart; rebuilds within one cadence cycle.
