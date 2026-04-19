---
date: 2026-04-18
topic: aws-deployment-v2
---

# AWS Deployment v2 — Requirements

## Problem Frame

The caretaker demo needs a production-like split: the public web server on one EC2, background workers on another, Postgres on Supabase, snapshots in S3, and notifications via Photon — without macOS EC2 cost and without heavy CI. Prior plan 004 assumed three EC2 instances including macOS; this v2 scope drops that in favor of two Ubuntu instances only.

## Requirements

**Topology**
- **R1.** Exactly **two** Ubuntu EC2 instances: (A) web + static frontend + HTTP API, (B) Gemini worker + Knot checkout + Photon notifier HTTP service.
- **R2.** Code updates are pushed from the developer laptop via **rsync** (or `scp`), not GitHub Actions in v2.
- **R3.** Processes on each box are managed with **pm2** so SSH disconnect does not kill the demo.

**Data & storage**
- **R4.** The web server **replaces** in-memory `DemoStore` with **Supabase** reads/writes when `SUPABASE_URL` and service role (or equivalent) are set.
- **R5.** Camera snapshots use **real S3 uploads** (presigned PUT from the browser), then **workers** fetch the image URL and call Gemini Vision; `scene_id`-only paths remain supported as fallback.

**Integrations**
- **R6.** **Photon** runs on **Linux** (HTTP/SDK), not macOS Messages; invalidates plan 004’s mac2.metal assumption.

## Success Criteria

- Hitting `/api/state` on the web host returns data from Supabase after seeding, not only in-memory demo JSON.
- A snapshot can flow: browser PUT to S3 → row in `snapshots` → worker processes → proposal/event rows visible after refresh.
- Two-instance deploy is documented: env per box, security groups, rsync + pm2 commands.

## Scope Boundaries

- No ALB, HTTPS certificates, or custom domains in v2.
- No Docker/ECR or GitHub Actions unless added in a later plan.
- RLS remains permissive (demo policies only).

## Key Decisions

- **Two EC2s:** Web isolation from CPU-heavy worker loops; worker box runs both worker and notifier processes in parallel OS processes.
- **Rsync:** Fastest iteration for a hackathon without setting up deploy keys to GitHub on every instance.
- **Supabase-backed API:** Single source of truth for dashboard and worker; avoids split-brain between RAM and DB.

## Dependencies / Assumptions

- Supabase project exists; `supabase/migrations/001_initial_schema.sql` and `supabase/seed.sql` applied.
- AWS credentials with S3 and EC2 permissions available for presign and optional infra scripts.

## Next Steps

→ Implementation plan: `docs/plans/2026-04-18-006-feat-aws-deployment-v2-plan.md`
