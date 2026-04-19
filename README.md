# Caretaker Demo

## Run

From the repo root:

```powershell
node server.mjs
```

Or:

```powershell
npm.cmd start
```

Open:

- `http://localhost:3000/` - dashboard
- `http://localhost:3000/camera.html?role=pantry` - pantry cam
- `http://localhost:3000/camera.html?role=medicine` - medicine cam

## Test

```powershell
npm test
```

## Supabase + S3 (optional)

1. Apply `supabase/migrations/001_initial_schema.sql` and `supabase/seed.sql` in the Supabase SQL editor (or `npm run seed:supabase` with service role env vars).
2. Copy `.env.example` to `.env` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AWS_*`, and `AWS_S3_BUCKET`.
3. Restart `npm start` — `/api/state` will include `"supabase": true` in `meta`, and the pantry camera page will upload JPEGs via presigned S3 URLs.

## Two-EC2 deploy (web + workers)

- Infra helpers: `infra/aws/create-bucket.sh`, `infra/aws/security-groups.sh` (see `infra/README.md`).
- Per-host env templates: `apps/web.env.example`, `apps/workers.env.example`.
- Copy `scripts/.deploy.env.example` to `scripts/.deploy.env` and set `WEB_HOST`, `WORKER_HOST`.
- From WSL/Git Bash: `scripts/deploy-web.sh`, `scripts/deploy-workers.sh`, or `scripts/deploy-all.sh`.
- Process manager on each box: `npx pm2 startOrRestart ecosystem.web.config.cjs` (web) or `ecosystem.workers.config.cjs` (worker EC2).
- Smoke checklist: `docs/SMOKE_TEST.md`.

## Alternate Port

```powershell
$env:PORT=3001; node server.mjs
```
