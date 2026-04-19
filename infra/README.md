# AWS infrastructure (v2)

Two Ubuntu EC2 instances: **web** (Node + static UI) and **workers** (Gemini + Knot + Photon notifier).
Supabase hosts Postgres; S3 holds snapshot images.

## Prerequisites

- AWS CLI configured (`aws configure`) — region default: `us-east-1`
- Key pair `caretaker-key` already exists in AWS (create once):
  ```bash
  aws ec2 create-key-pair \
    --key-name caretaker-key \
    --query "KeyMaterial" \
    --output text > ~/.ssh/caretaker-key.pem
  chmod 400 ~/.ssh/caretaker-key.pem
  ```

## One-shot setup

Run this once to provision **everything** — S3 bucket, both security groups, both EC2 instances, Elastic IP, and `scripts/.deploy.env`:

```bash
cd infra/aws
chmod +x setup.sh
./setup.sh
```

Optional overrides:

```bash
REGION=us-east-1 KEY_NAME=caretaker-key WEB_PORT=3000 ./setup.sh
```

What it creates (all idempotent — safe to re-run):

| Resource | Name / type |
|---|---|
| S3 bucket | `caretaker-snapshots-<account-id>` (7-day lifecycle, CORS) |
| Security group | `caretaker-web-sg` — inbound 22 + 3000 from internet |
| Security group | `caretaker-worker-sg` — inbound 22 from internet, 3031 + 3040 from web-sg only |
| EC2 #1 | `caretaker-web` (Ubuntu 24.04 LTS, t3.small) |
| EC2 #2 | `caretaker-worker` (Ubuntu 24.04 LTS, t3.medium) |
| Elastic IP | attached to web instance (stable address) |
| `infra/.instances.json` | machine-readable IDs + IPs |
| `scripts/.deploy.env` | pre-filled `WEB_HOST`, `WORKER_HOST`, `SSH_KEY` |

After the script finishes, both instances are running and Node 20 + pm2 are being installed via user-data (takes ~2 min after launch).

## Individual scripts

These are superseded by `setup.sh` but kept for reference or targeted re-runs:

- `aws/create-bucket.sh` — only creates/configures the S3 bucket
- `aws/security-groups.sh` — only creates the worker security group

## After setup — deploy & verify

```bash
# 1. Fill per-box .env files (edit with real credentials first)
cp apps/web.env.example apps/web.env      # fill SUPABASE_URL etc.
cp apps/workers.env.example apps/workers.env

scripts/sync-env.sh ubuntu@<WEB_HOST>    apps/web.env
scripts/sync-env.sh ubuntu@<WORKER_HOST> apps/workers.env

# 2. Push code + restart pm2
scripts/deploy-all.sh

# 3. Smoke test
curl http://<WEB_HOST>:3000/api/state
```

See `docs/SMOKE_TEST.md` for the full checklist.

## See also

- [docs/plans/2026-04-18-006-feat-aws-deployment-v2-plan.md](../docs/plans/2026-04-18-006-feat-aws-deployment-v2-plan.md)
- Deploy scripts: `scripts/deploy-web.sh`, `scripts/deploy-workers.sh`
