---
title: "pm2 worker crashes with missing env vars despite correct .env — stale ecosystem config not deployed to EC2"
problem_type: workflow_issue
track: bug
severity: high
status: resolved
resolution_type: environment_fix
component: pm2 / deployment pipeline
module: ecosystem.workers.config.cjs, deploy-workers.sh
date: 2026-04-19
project: hack-princeton-2026
tags:
  - pm2
  - ec2
  - aws
  - deployment
  - ecosystem-config
  - env-vars
  - rsync
  - scp
  - dotenv
  - loadEnv
  - crlf
  - wsl
  - npm
symptoms:
  - "pm2 caretaker-worker crashes: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON) are required for the worker"
  - "Env vars confirmed present in ~/hack_pton/.env on server via cat, but process still fails"
  - "pm2 delete all && pm2 start does not resolve the crash"
  - "Server ecosystem config is only 3 lines — missing loadEnv function"
root_cause: >
  ecosystem.workers.config.cjs on EC2 #2 was the old version (3 lines, no
  loadEnv function). The local rewrite that added a loadEnv() call to read
  .env from disk at startup was never pushed — deploy-workers.sh (rsync) had
  not been run since the rewrite. pm2 was starting the worker with the old
  config that had no mechanism to source .env, so SUPABASE_* vars were
  never injected into the process environment.
---

## Problem

The `caretaker-worker` pm2 process crashed in a restart loop because the `ecosystem.workers.config.cjs` on the EC2 server was an old 3-line stub with no env loading — the local rewrite that injects `.env` variables into pm2's process env had never been deployed to the server.

## Symptoms

- pm2 shows `caretaker-worker` in restart loop (`online → crashed → restarting`)
- `pm2 logs caretaker-worker` outputs:
  ```
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON) are required for the worker.
  ```
- `~/hack_pton/.env` on the server exists and contains correct credentials
- Re-deploying `.env` via scp has no effect
- `pm2 delete all && pm2 start ecosystem.workers.config.cjs` doesn't fix it

## What Didn't Work

1. **Copying `.env` to the server** — The file was already there. The ecosystem config never read it, so pm2 launched the worker with no env vars injected.

2. **`pm2 delete all && pm2 start`** — Reloaded the stale old config because `deploy-workers.sh` (rsync-based deploy) had never been run after the local rewrite; the server still had the original stub file.

3. **`pm2 restart`** — Same stale config reloaded; no env vars.

4. **Reading only `pm2 logs`** — Logs show the symptom (missing env var) but not the cause (stale config). The key diagnostic was checking the actual file on the server:
   ```bash
   ssh -i ~/.ssh/caretaker-key.pem ubuntu@<WORKER_IP> 'head -5 ~/hack_pton/ecosystem.workers.config.cjs'
   ```
   This revealed the old 3-line stub instead of the `loadEnv()` version — the real root cause.

## Solution

### Primary fix: push the updated ecosystem config directly, then restart

```bash
# Strip Windows CRLF line endings from the local file first (if on Windows/WSL)
sed -i 's/\r//' ecosystem.workers.config.cjs

# Copy the updated config to the server
scp -i ~/.ssh/caretaker-key.pem ecosystem.workers.config.cjs ubuntu@<WORKER_IP>:~/hack_pton/ecosystem.workers.config.cjs

# Restart pm2 cleanly with the new config
ssh -i ~/.ssh/caretaker-key.pem ubuntu@<WORKER_IP> 'cd ~/hack_pton && pm2 delete all && pm2 start ecosystem.workers.config.cjs'
```

### The correct ecosystem config with env loading

pm2 does not source shell dotfiles or read `.env` on its own. The `loadEnv()` function runs at require-time (before pm2 forks), baking all variables into the `env` object passed to the child process:

```javascript
// ecosystem.workers.config.cjs
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  fs.readFileSync(file, "utf8").split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    env[key] = val;
  });
  return env;
}

const envFile = path.join(__dirname, ".env");
const envVars = loadEnv(envFile);

module.exports = {
  apps: [
    {
      name: "caretaker-worker",
      script: "services/worker/index.mjs",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production", ...envVars }
    },
    {
      name: "caretaker-notifier",
      script: "services/notifier/server.mjs",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_memory_restart: "200M",
      env: { NODE_ENV: "production", ...envVars }
    }
  ]
};
```

---

### Sub-issue 1: CRLF line endings crash bash scripts in WSL

Scripts written on Windows have `\r\n` endings. When run in WSL/Linux they fail with:
```
/usr/bin/env: 'bash\r': No such file or directory
```

Fix:
```bash
sed -i 's/\r//' scripts/*.sh
# Or a specific file:
sed -i 's/\r//' ecosystem.workers.config.cjs
```

---

### Sub-issue 2: npm strips inline env vars passed before the command

`VAR=val npm run script` does NOT pass `VAR` into the script's Node.js process. npm clears or ignores inline env assignments before invoking the script.

```bash
# Wrong — SUPABASE_URL will not reach the script:
SUPABASE_URL=https://... npm run seed

# Right — bypass npm and call node directly:
SUPABASE_URL=https://... node scripts/seed-supabase.mjs
```

---

### Sub-issue 3: Orphaned Node process holds the port after pm2 churn

If Node was started manually before pm2 took over, `pm2 delete all` does not kill it. The orphaned process keeps :3000 bound and the pm2-managed process fails to start.

```bash
# Diagnose:
sudo lsof -i :3000

# Kill the orphan (use PID from lsof output):
kill -9 <PID>

# Then start pm2 cleanly:
pm2 start ecosystem.workers.config.cjs
```

## Why This Works

pm2 reads env vars from the `env` block in the ecosystem config **at startup**. It does not source shell dotfiles or `.env` files automatically. The `loadEnv()` function executes at CommonJS `require` time — before pm2 forks the child process — so all vars are available in the `env` object pm2 passes to the worker. Once the updated config is on the server, `pm2 delete all && pm2 start` forces a clean load from the new file.

## Prevention

1. **Always verify the deployed ecosystem file after any config change** — don't just check logs:
   ```bash
   ssh -i ~/.ssh/key.pem ubuntu@<IP> 'head -20 ~/hack_pton/ecosystem.workers.config.cjs'
   ```

2. **Ensure ecosystem configs are included in your rsync deploy script** — never leave them out:
   ```bash
   # deploy-workers.sh should explicitly include ecosystem.workers.config.cjs in the rsync sources
   rsync -av ecosystem.workers.config.cjs ubuntu@<WORKER_IP>:~/hack_pton/
   ```

3. **Strip CRLF as a pre-deploy step when developing on Windows/WSL:**
   ```bash
   sed -i 's/\r//' *.cjs scripts/*.sh
   ```

4. **Never start Node processes manually alongside pm2.** Use pm2 exclusively. If you need a one-shot run, use a separate terminal you can track — or `pm2 run`.

5. **After any deploy, confirm status and tail logs for 10–15 seconds:**
   ```bash
   pm2 status
   pm2 logs --lines 30 --nostream
   ```
