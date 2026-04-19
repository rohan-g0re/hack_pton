---
title: "AWS 2-EC2 Deployment v2"
type: feat
status: active
date: 2026-04-18
origin: docs/brainstorms/2026-04-18-aws-deployment-v2-requirements.md
supersedes: docs/plans/2026-04-18-004-feat-aws-deployment-directory-plan.md
---

# AWS 2-EC2 Deployment Plan (v2)

See implementation in repo: `infra/aws/`, `src/supabase-store.mjs`, `src/s3-presign.mjs`, `scripts/deploy-*.sh`, `ecosystem.*.config.cjs`, `apps/*.env.example`.

High-level: Web EC2 serves `server.mjs` with Supabase-backed store when env is set; Worker EC2 runs `npm run worker` and `npm run notifier`; S3 holds snapshot images; Photon called from Linux notifier process.

Full narrative requirements: [docs/brainstorms/2026-04-18-aws-deployment-v2-requirements.md](../brainstorms/2026-04-18-aws-deployment-v2-requirements.md).
