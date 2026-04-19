---
title: "AWS Deployment, Infrastructure & Directory Structure Plan"
type: feat
status: superseded
date: 2026-04-18
origin: docs/product_idea.md
---

> **Superseded by** [2026-04-18-006-feat-aws-deployment-v2-plan.md](2026-04-18-006-feat-aws-deployment-v2-plan.md) (two Ubuntu EC2s, no macOS instance).

# AWS Deployment, Infrastructure & Directory Structure Plan

## Overview

This plan defines the complete AWS infrastructure, directory structure, and deployment pipeline for the Caretaker Command Center. Grounded solely in `docs/product_idea.md`, which specifies:

- EC2 instances for the Gemini analysis modules and Knot ordering
- A macOS EC2 instance for the Photon iMessage module
- Supabase as the database (external managed service, not AWS-hosted)
- S3 for snapshot image storage
- A Next.js frontend that can be served from the EC2 or from a CDN

The user explicitly wants the repository directory structured so that **each deployable module maps cleanly to an AWS resource**, making it easy to push individual services to AWS independently. This plan covers directory layout first, then infrastructure, then deployment steps assuming AWS CLI credentials are provided.

## Problem Frame

The product has four distinct deployable units:
1. **Next.js web app** — the frontend + API routes (caretaker dashboard, camera pages, CRUD APIs)
2. **Worker service** — Gemini pantry analysis, Gemini medicine analysis, Knot checkout processing (Linux)
3. **Notifier service** — Photon iMessage delivery (macOS only)
4. **Infrastructure** — S3 bucket, security groups, EC2 instances, IAM roles

Each of these needs to be independently deployable. The directory structure must make it obvious which folder maps to which AWS resource, and deployment scripts must be automatable via AWS CLI.

## Requirements Trace (from product_idea.md)

- R1. EC2 instance(s) for Gemini modules — can be single or split (product_idea.md says "single EC2 instance which deals with both the Gemini modules")
- R2. Separate process for Knot API module on the same EC2 (or separate EC2 if needed)
- R3. macOS EC2 instance for Photon iMessage module
- R4. S3 for storing camera snapshot images
- R5. Supabase as external database (not AWS RDS)
- R6. Next.js frontend deployable to EC2 or a CDN
- R7. User wants to "learn AWS while working with this"
- R8. Directory structured per module for clean AWS deployment

---

## Directory Structure

> *This is the target directory layout, restructured from the current flat `public/` + `src/` layout into a module-per-AWS-resource structure.*

```
Hack_Princeton_2026/
│
├── docs/
│   ├── product_idea.md
│   └── plans/
│       ├── 2026-04-18-001-feat-caretaker-monitoring-demo-plan.md
│       ├── 2026-04-18-002-feat-frontend-screens-wireframing-plan.md
│       ├── 2026-04-18-003-feat-backend-implementation-plan.md
│       └── 2026-04-18-004-feat-aws-deployment-directory-plan.md
│
├── infra/                              ← AWS infrastructure definitions
│   ├── README.md                       ← How to set up AWS from scratch
│   ├── setup.sh                        ← One-shot infra provisioning script
│   ├── teardown.sh                     ← Clean up all AWS resources
│   ├── ec2/
│   │   ├── worker-userdata.sh          ← EC2 Linux launch script (worker)
│   │   ├── web-userdata.sh             ← EC2 Linux launch script (web app)
│   │   └── notifier-userdata.sh        ← EC2 macOS launch script (Photon)
│   ├── s3/
│   │   ├── create-bucket.sh            ← Create S3 snapshot bucket
│   │   └── bucket-policy.json          ← Bucket policy for EC2 access
│   ├── security-groups/
│   │   ├── web-sg.json                 ← Inbound 80/443 for web
│   │   ├── worker-sg.json              ← Inbound from web SG only
│   │   └── notifier-sg.json            ← Inbound from worker SG only
│   └── iam/
│       ├── ec2-role.json               ← IAM role for EC2 instances
│       └── ec2-s3-policy.json          ← S3 read/write policy
│
├── apps/                               ← Deployable applications
│   └── web/                            ← Next.js frontend + API routes
│       ├── package.json
│       ├── next.config.mjs
│       ├── tsconfig.json
│       ├── .env.example                ← SUPABASE_URL, SUPABASE_ANON_KEY, etc.
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                ← S1: Welcome
│       │   ├── register/page.tsx       ← S2: Registration
│       │   ├── bind/page.tsx           ← S3: QR Bind
│       │   ├── dashboard/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx            ← S4: Dashboard
│       │   │   ├── patient/page.tsx    ← S5: Patient Settings
│       │   │   └── proposals/[id]/page.tsx ← S6: Proposal Detail
│       │   ├── camera/
│       │   │   ├── page.tsx            ← S7: Camera Selector
│       │   │   ├── pantry/page.tsx     ← S8: Pantry Cam
│       │   │   └── medicine/page.tsx   ← S9: Medicine Cam
│       │   └── api/                    ← Next.js API routes
│       │       ├── profile/route.ts
│       │       ├── inventory/route.ts
│       │       ├── prescriptions/route.ts
│       │       ├── cameras/[role]/register/route.ts
│       │       ├── cameras/[role]/snapshot/route.ts
│       │       ├── cameras/bind/route.ts
│       │       ├── proposals/[id]/approve/route.ts
│       │       ├── proposals/[id]/reject/route.ts
│       │       ├── state/route.ts
│       │       └── demo/reset/route.ts
│       ├── components/
│       │   └── ... (per frontend plan)
│       ├── lib/
│       │   ├── api.ts
│       │   ├── types.ts
│       │   ├── supabase.ts
│       │   ├── supabase-server.ts
│       │   └── qr.ts
│       └── public/
│           └── ... (static assets)
│
├── services/                           ← Backend services (each = separate deploy)
│   ├── worker/                         ← Gemini + Knot worker → Linux EC2
│   │   ├── package.json
│   │   ├── .env.example                ← GEMINI_API_KEY, KNOT_CLIENT_ID, etc.
│   │   ├── Dockerfile                  ← Docker image for EC2 deployment
│   │   ├── index.mjs                   ← Main entry: starts all worker loops
│   │   ├── queue.mjs                   ← Snapshot queue polling logic
│   │   ├── gemini-client.mjs           ← Gemini ER 1.6 API client
│   │   ├── gemini-pantry.mjs           ← Pantry analysis worker loop
│   │   ├── gemini-medicine.mjs         ← Medicine analysis worker loop
│   │   ├── knot-client.mjs             ← Knot Shopping/Vaulting API client
│   │   ├── knot-checkout.mjs           ← Checkout processing worker loop
│   │   ├── supabase-client.mjs         ← Supabase connection for worker
│   │   ├── s3-client.mjs              ← S3 upload/download for snapshots
│   │   └── prompts/
│   │       ├── pantry-prompt.md        ← Gemini prompt template for pantry
│   │       └── medicine-prompt.md      ← Gemini prompt template for medicine
│   │
│   └── notifier/                       ← Photon iMessage → macOS EC2
│       ├── package.json
│       ├── .env.example                ← PHOTON_PROJECT_ID, PHOTON_SECRET_KEY
│       ├── Dockerfile.macos            ← macOS-specific container config
│       ├── server.mjs                  ← HTTP server with POST /notify endpoint
│       ├── photon-client.mjs           ← spectrum-ts iMessage initialization
│       └── supabase-client.mjs         ← Write notifications to Supabase
│
├── supabase/                           ← Database schema and seeds
│   ├── migrations/
│   │   └── 001_initial_schema.sql      ← All table definitions
│   ├── seed.sql                        ← Demo household data
│   └── README.md                       ← Supabase setup instructions
│
├── scripts/                            ← Deployment automation
│   ├── deploy-web.sh                   ← Build + deploy Next.js to EC2
│   ├── deploy-worker.sh                ← Build + deploy worker to Linux EC2
│   ├── deploy-notifier.sh              ← Build + deploy notifier to macOS EC2
│   ├── deploy-all.sh                   ← Deploy everything in correct order
│   ├── seed-db.sh                      ← Run Supabase seed script
│   ├── logs-worker.sh                  ← Tail worker EC2 logs
│   ├── logs-notifier.sh               ← Tail notifier EC2 logs
│   ├── ssh-worker.sh                   ← SSH into worker EC2
│   ├── ssh-notifier.sh                ← SSH into notifier EC2
│   └── ssh-web.sh                      ← SSH into web EC2
│
├── tests/                              ← Test files
│   ├── app.test.mjs                    ← Existing test file
│   ├── api.test.mjs
│   ├── schema.test.mjs
│   ├── gemini-pantry.test.mjs
│   ├── gemini-medicine.test.mjs
│   ├── knot-checkout.test.mjs
│   ├── notifier.test.mjs
│   ├── worker-orchestration.test.mjs
│   └── realtime.test.mjs
│
├── .gitignore
├── .env.example                        ← Root-level env template
├── package.json                        ← Root package.json (workspace config)
└── README.md
```

### Directory-to-AWS-Resource Mapping

| Directory | AWS Resource | Instance Type | OS | Purpose |
|-----------|-------------|---------------|-----|---------|
| `apps/web/` | EC2 instance #1 | t3.small | Amazon Linux 2023 | Next.js web app + API routes |
| `services/worker/` | EC2 instance #2 | t3.medium | Amazon Linux 2023 | Gemini analysis + Knot checkout |
| `services/notifier/` | EC2 instance #3 | mac2.metal | macOS Ventura | Photon iMessage delivery |
| `infra/s3/` | S3 bucket | — | — | Snapshot image storage |
| `supabase/` | External (Supabase.com) | — | — | PostgreSQL database + Realtime |

---

## AWS Infrastructure Architecture

> *This illustrates the intended AWS setup and is directional guidance for review, not implementation specification.*

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AWS VPC (us-east-1)                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Public Subnet                                │   │
│  │                                                                 │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                    │   │
│  │  │  EC2: Web App    │  │  EC2: Worker     │                    │   │
│  │  │  (t3.small)      │  │  (t3.medium)     │                    │   │
│  │  │  Amazon Linux    │  │  Amazon Linux    │                    │   │
│  │  │                  │  │                  │                    │   │
│  │  │  Next.js app     │  │  Gemini Module 1 │                    │   │
│  │  │  Port 3000       │  │  Gemini Module 2 │                    │   │
│  │  │                  │  │  Knot Checkout    │                    │   │
│  │  │  SG: web-sg      │  │  Health: :8080   │                    │   │
│  │  │  Inbound: 80,443 │  │                  │                    │   │
│  │  │  from 0.0.0.0/0  │  │  SG: worker-sg   │                    │   │
│  │  │                  │  │  Inbound: 8080   │                    │   │
│  │  │                  │  │  from web-sg     │                    │   │
│  │  └────────┬─────────┘  └────────┬─────────┘                    │   │
│  │           │                     │                               │   │
│  └───────────┼─────────────────────┼───────────────────────────────┘   │
│              │                     │                                   │
│  ┌───────────┼─────────────────────┼───────────────────────────────┐   │
│  │           │     Private Subnet  │                               │   │
│  │           │                     │                               │   │
│  │           │  ┌──────────────────┐                               │   │
│  │           │  │  EC2: Notifier   │                               │   │
│  │           │  │  (mac2.metal)    │                               │   │
│  │           │  │  macOS Ventura   │                               │   │
│  │           │  │                  │                               │   │
│  │           │  │  Photon/spectrum │                               │   │
│  │           │  │  Port 4000       │                               │   │
│  │           │  │                  │                               │   │
│  │           │  │  SG: notifier-sg │                               │   │
│  │           │  │  Inbound: 4000   │                               │   │
│  │           │  │  from worker-sg  │                               │   │
│  │           │  └──────────────────┘                               │   │
│  │           │                                                     │   │
│  └───────────┼─────────────────────────────────────────────────────┘   │
│              │                                                         │
│  ┌───────────┴─────────────────────────────────────────────────────┐   │
│  │  S3 Bucket: caretaker-snapshots-{account-id}                    │   │
│  │  - pantry/ prefix for pantry images                             │   │
│  │  - medicine/ prefix for medicine images                         │   │
│  │  - Lifecycle: auto-delete after 7 days (demo data)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

External Services:
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  Supabase        │  │  Gemini API      │  │  Knot API        │
  │  (supabase.com)  │  │  (Google Cloud)  │  │  (knotapi.com)   │
  │  PostgreSQL +    │  │  ER Robotics 1.6 │  │  Shopping +      │
  │  Realtime        │  │                  │  │  Vaulting         │
  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## Key Technical Decisions

- **Three EC2 instances, not two**: Although the product_idea.md suggests combining web + worker, separating them gives cleaner deployment and avoids Next.js blocking the worker processes. The web EC2 is small (t3.small); the worker needs more memory for image processing (t3.medium); the notifier requires macOS (mac2.metal).
- **macOS EC2 dedicated host**: macOS EC2 instances on AWS require a dedicated host with a minimum 24-hour allocation. This is more expensive but required for Photon. For the hackathon, allocate one mac2.metal for the duration.
- **S3 with lifecycle policy**: Snapshot images are ephemeral demo data. Auto-delete after 7 days to avoid cost accumulation.
- **No load balancer**: For hackathon simplicity, the web EC2 serves directly on port 80. No ALB needed for single-instance demo.
- **No Docker registry**: Build Docker images on the EC2 instances directly. For the hackathon, SCP the code and run `docker build` on-instance.
- **Environment variables via .env files**: Each service has its own `.env.example`. On EC2, copy to `.env` and fill with real credentials.
- **Security groups for isolation**: Web is public-facing; worker accepts connections only from web; notifier accepts connections only from worker. This provides basic network isolation.

---

## Implementation Units

- [ ] **Unit 1: Restructure the repository directory layout**

**Goal:** Reorganize the current flat structure into the modular AWS-deployable layout.

**Requirements:** R8

**Dependencies:** None

**Files:**
- Move: `public/*` → `apps/web/public/`
- Move: `src/app.mjs` → `apps/web/` (will be replaced by Next.js routes)
- Move: `src/store.mjs` → `apps/web/lib/store.ts` (reference for business logic)
- Move: `src/demo-data.mjs` → `apps/web/lib/demo-data.ts` + `supabase/seed.sql`
- Move: `server.mjs` → `apps/web/` (will be replaced by Next.js)
- Move: `tests/*` → `tests/`
- Create: `apps/web/package.json`
- Create: `services/worker/package.json`
- Create: `services/notifier/package.json`
- Create: `infra/README.md`
- Create: `scripts/deploy-all.sh`
- Create: `.env.example` (root)

**Approach:**
- Preserve the existing working demo in `apps/web/` as a starting point
- Create empty service directories with package.json stubs
- Create infra directory with README placeholder
- Update root package.json to use npm workspaces pointing to `apps/web`, `services/worker`, `services/notifier`
- Ensure `node server.mjs` still works from the apps/web directory during transition

**Test expectation: none** — pure directory restructuring with no behavioral change

**Verification:**
- `npm start` from `apps/web/` still launches the existing demo
- All three service directories have valid package.json files
- `infra/` and `scripts/` directories exist with READMEs

---

- [ ] **Unit 2: Create S3 bucket and IAM configuration**

**Goal:** Provision the S3 bucket for snapshot storage and the IAM role that EC2 instances use to access it.

**Requirements:** R4

**Dependencies:** Unit 1

**Files:**
- Create: `infra/s3/create-bucket.sh`
- Create: `infra/s3/bucket-policy.json`
- Create: `infra/iam/ec2-role.json`
- Create: `infra/iam/ec2-s3-policy.json`

**Approach:**
- S3 bucket name: `caretaker-snapshots-{aws-account-id}` (globally unique)
- Bucket in us-east-1 (closest to Princeton)
- Enable versioning: off (demo data, not critical)
- Lifecycle rule: delete objects after 7 days
- CORS: allow PUT from the web app origin (for direct browser uploads)
- IAM role: `caretaker-ec2-role` with permission to read/write the S3 bucket
- IAM instance profile: `caretaker-ec2-profile` (attached to all EC2 instances)

**Script: `infra/s3/create-bucket.sh`:**
```
aws s3api create-bucket --bucket $BUCKET_NAME --region us-east-1
aws s3api put-lifecycle-configuration ...
aws s3api put-bucket-cors ...
```

**Script: `infra/iam/` creates role + policy + instance profile:**
```
aws iam create-role --role-name caretaker-ec2-role ...
aws iam put-role-policy --policy-document ec2-s3-policy.json ...
aws iam create-instance-profile ...
aws iam add-role-to-instance-profile ...
```

**Test scenarios:**
- Happy path: `aws s3 ls s3://$BUCKET_NAME` succeeds after creation
- Happy path: EC2 instance with the role can `aws s3 cp` an image to the bucket
- Error path: Script is idempotent — running it twice does not fail

**Verification:**
- S3 bucket exists; IAM role and instance profile are created; test upload succeeds

---

- [ ] **Unit 3: Provision EC2 instance for the web app**

**Goal:** Create the EC2 instance that runs the Next.js frontend + API routes.

**Requirements:** R6

**Dependencies:** Unit 2

**Files:**
- Create: `infra/ec2/web-userdata.sh`
- Create: `infra/security-groups/web-sg.json`
- Create: `scripts/deploy-web.sh`
- Create: `scripts/ssh-web.sh`

**Approach:**
- Instance type: t3.small (2 vCPU, 2 GB RAM — sufficient for Next.js)
- AMI: Amazon Linux 2023 (latest)
- Security group `web-sg`: inbound TCP 80, 443, 22 (SSH) from 0.0.0.0/0
- Attach IAM instance profile `caretaker-ec2-profile`
- User data script installs: Node.js 20 LTS, npm, git, pm2 (process manager)
- Elastic IP: allocate and associate for stable public IP
- Tag: `Name=caretaker-web`, `Project=hack-princeton-2026`

**Deploy script (`scripts/deploy-web.sh`):**
1. SSH into the web EC2 instance
2. `git pull` or `scp` the `apps/web/` directory
3. `cd apps/web && npm install && npm run build`
4. `pm2 restart caretaker-web` (or `pm2 start npm -- start`)
5. Verify health: `curl http://localhost:3000`

**User data script (`infra/ec2/web-userdata.sh`):**
- Installs Node.js 20, pm2
- Clones the repo (or expects code to be deployed via SCP)
- Sets up pm2 startup on boot

**Test scenarios:**
- Happy path: EC2 launches; SSH works; Node.js 20 is installed; pm2 is available
- Happy path: After deploy-web.sh, the Next.js app is accessible on the public IP port 80
- Error path: Deploy script exits cleanly if SSH connection fails

**Verification:**
- `curl http://{elastic-ip}/` returns the Welcome page HTML

---

- [ ] **Unit 4: Provision EC2 instance for the worker service**

**Goal:** Create the EC2 instance that runs both Gemini modules and the Knot checkout processor.

**Requirements:** R1, R2

**Dependencies:** Unit 2

**Files:**
- Create: `infra/ec2/worker-userdata.sh`
- Create: `infra/security-groups/worker-sg.json`
- Create: `scripts/deploy-worker.sh`
- Create: `scripts/ssh-worker.sh`
- Create: `scripts/logs-worker.sh`

**Approach:**
- Instance type: t3.medium (2 vCPU, 4 GB RAM — more memory for image processing)
- AMI: Amazon Linux 2023
- Security group `worker-sg`: inbound TCP 8080 (health check) from web-sg only; inbound 22 from your IP
- Attach IAM instance profile `caretaker-ec2-profile`
- No Elastic IP needed (worker communicates with Supabase, Gemini, Knot outbound; receives health checks from web)
- User data installs: Node.js 20, pm2, git
- Per product_idea.md: runs three parallel processes (pantry worker, medicine worker, knot checkout)
- PM2 manages all three as a single ecosystem

**Deploy script (`scripts/deploy-worker.sh`):**
1. SSH into worker EC2
2. Deploy `services/worker/` directory
3. Copy `.env` with GEMINI_API_KEY, KNOT_CLIENT_ID, KNOT_SECRET, SUPABASE_URL, S3 config
4. `npm install && pm2 restart caretaker-worker`
5. Verify: `curl http://localhost:8080/health`

**Test scenarios:**
- Happy path: Worker EC2 launches; all three worker loops start via pm2
- Happy path: Health check endpoint returns 200
- Happy path: Worker can reach Supabase, Gemini API, S3 (outbound internet access)
- Error path: If Gemini API key is missing, worker logs error but doesn't crash

**Verification:**
- Worker is running (pm2 status shows "online"); health check responds; logs show polling activity

---

- [ ] **Unit 5: Provision EC2 macOS instance for the notifier service**

**Goal:** Create the macOS EC2 instance that runs Photon/spectrum-ts for iMessage delivery.

**Requirements:** R3, R10

**Dependencies:** Unit 2

**Files:**
- Create: `infra/ec2/notifier-userdata.sh`
- Create: `infra/security-groups/notifier-sg.json`
- Create: `scripts/deploy-notifier.sh`
- Create: `scripts/ssh-notifier.sh`
- Create: `scripts/logs-notifier.sh`

**Approach:**
- **Dedicated host required**: macOS EC2 instances require allocating a dedicated host first
  1. `aws ec2 allocate-hosts --instance-type mac2.metal --availability-zone us-east-1a --quantity 1`
  2. Wait for host allocation (can take minutes)
  3. Launch EC2 instance on the dedicated host
- Instance type: mac2.metal (Apple silicon, only option for macOS on EC2)
- AMI: macOS Ventura (latest available)
- Security group `notifier-sg`: inbound TCP 4000 from worker-sg only; inbound 22 from your IP
- User data: install Homebrew, Node.js 20 via nvm, pm2
- Note: macOS dedicated hosts have a 24-hour minimum allocation — plan for cost

**Deploy script (`scripts/deploy-notifier.sh`):**
1. SSH into notifier EC2 (macOS uses ec2-user or similar)
2. Deploy `services/notifier/` directory
3. Copy `.env` with PHOTON_PROJECT_ID, PHOTON_SECRET_KEY, SUPABASE_URL
4. `npm install && pm2 restart caretaker-notifier`
5. Verify: `curl http://localhost:4000/health`

**Cost warning:** mac2.metal is expensive (~$6.50/hour for bare metal). For the hackathon:
- Allocate only when ready to demo
- Deallocate immediately after judging
- Alternative: run Photon locally on a teammate's MacBook and expose via ngrok as a cheaper fallback

**Test scenarios:**
- Happy path: macOS EC2 launches on dedicated host; SSH works; Node.js installed via Homebrew
- Happy path: spectrum-ts initializes successfully with Photon credentials
- Happy path: POST /notify sends an iMessage and returns 200
- Error path: If Photon credentials are invalid, server logs error but remains running
- Edge case: Dedicated host allocation timeout → script retries or reports failure

**Verification:**
- Notifier responds to health check; test notification sends an iMessage to a test phone number

---

- [ ] **Unit 6: Create unified deployment scripts**

**Goal:** Create scripts that deploy the entire system in the correct order, and individual scripts for deploying each service independently.

**Requirements:** R7, R8

**Dependencies:** Units 2, 3, 4, 5

**Files:**
- Create: `scripts/deploy-all.sh`
- Create: `scripts/seed-db.sh`
- Create: `infra/setup.sh`
- Create: `infra/teardown.sh`

**Approach:**

**`infra/setup.sh` — One-time infrastructure provisioning:**
```
1. Create S3 bucket (infra/s3/create-bucket.sh)
2. Create IAM role + instance profile (infra/iam/)
3. Create security groups (infra/security-groups/)
4. Launch web EC2 instance + allocate Elastic IP
5. Launch worker EC2 instance
6. Allocate macOS dedicated host + launch notifier EC2
7. Output: instance IDs, public IPs, SSH commands
8. Write connection info to infra/.instances.json (gitignored)
```

**`scripts/deploy-all.sh` — Deploy code to all instances:**
```
1. Read instance IPs from infra/.instances.json
2. Deploy Supabase schema (scripts/seed-db.sh)
3. Deploy web app (scripts/deploy-web.sh)
4. Deploy worker (scripts/deploy-worker.sh)
5. Deploy notifier (scripts/deploy-notifier.sh)
6. Run health checks on all three services
7. Output: URLs and status
```

**`infra/teardown.sh` — Clean up everything:**
```
1. Terminate all EC2 instances
2. Release Elastic IP
3. Release macOS dedicated host
4. Delete security groups
5. Delete IAM instance profile + role
6. Optionally delete S3 bucket (with confirmation)
```

**`scripts/seed-db.sh`:**
```
1. Read SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env
2. Run supabase/migrations/001_initial_schema.sql
3. Run supabase/seed.sql
4. Verify: query caretakers table has 1 row
```

**Test scenarios:**
- Happy path: `infra/setup.sh` provisions all resources and outputs connection info
- Happy path: `scripts/deploy-all.sh` deploys to all three instances and reports all healthy
- Happy path: `infra/teardown.sh` cleans up all resources
- Error path: Teardown handles "resource not found" gracefully (idempotent)
- Edge case: Running setup.sh twice does not create duplicate resources

**Verification:**
- All three services are running and healthy; web app is publicly accessible; full demo flow works end-to-end

---

- [ ] **Unit 7: Environment variable management and .env templates**

**Goal:** Create .env.example files for each service documenting every required environment variable.

**Requirements:** R7

**Dependencies:** Unit 1

**Files:**
- Create: `.env.example` (root — shared vars)
- Create: `apps/web/.env.example`
- Create: `services/worker/.env.example`
- Create: `services/notifier/.env.example`

**Approach:**

**Root `.env.example`:**
```
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=
S3_BUCKET_NAME=caretaker-snapshots-${AWS_ACCOUNT_ID}
```

**`apps/web/.env.example`:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
KNOT_CLIENT_ID=your-knot-client-id
WORKER_URL=http://worker-ec2-private-ip:8080
S3_BUCKET_NAME=caretaker-snapshots-xxx
AWS_REGION=us-east-1
PORT=3000
```

**`services/worker/.env.example`:**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
KNOT_CLIENT_ID=your-knot-client-id
KNOT_CLIENT_SECRET=your-knot-client-secret
S3_BUCKET_NAME=caretaker-snapshots-xxx
AWS_REGION=us-east-1
NOTIFIER_URL=http://notifier-ec2-private-ip:4000
HEALTH_PORT=8080
SNAPSHOT_POLL_INTERVAL_MS=3000
```

**`services/notifier/.env.example`:**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PHOTON_PROJECT_ID=your-photon-project-id
PHOTON_SECRET_KEY=your-photon-secret-key
PORT=4000
```

**Test expectation: none** — configuration files with no behavioral change

**Verification:**
- Each service can read its .env and start without missing variable errors (validated in respective service startup)

---

- [ ] **Unit 8: Docker configuration for each service**

**Goal:** Create Dockerfiles for the worker and web app to enable consistent builds on EC2.

**Requirements:** R7

**Dependencies:** Unit 1

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `services/worker/Dockerfile`
- Create: `docker-compose.yml` (for local development)

**Approach:**
- **Web Dockerfile**: Multi-stage build — install deps → build Next.js → production image with Node.js 20 Alpine
- **Worker Dockerfile**: Node.js 20 Alpine, copy service files, install deps, CMD runs index.mjs
- **Notifier**: No Docker — macOS EC2 runs directly on the host OS (Docker on macOS EC2 is not practical for Photon which needs native macOS iMessage integration)
- **docker-compose.yml**: For local development, runs web + worker + a mock notifier together

**Test scenarios:**
- Happy path: `docker build -t caretaker-web apps/web/` succeeds
- Happy path: `docker build -t caretaker-worker services/worker/` succeeds
- Happy path: `docker-compose up` starts web + worker locally

**Verification:**
- Docker images build successfully; local docker-compose stack starts all services

---

## Deployment Sequence (Step-by-Step)

This is the complete sequence assuming AWS CLI credentials are configured:

### Step 1: Prerequisites
1. AWS CLI installed and configured (`aws configure`)
2. SSH key pair created (`aws ec2 create-key-pair --key-name caretaker-key`)
3. Supabase project created at supabase.com (free tier)
4. Gemini API key from Google AI Studio
5. Knot API credentials from knotapi.com (sandbox)
6. Photon credentials from photon.codes

### Step 2: Infrastructure
```
cd infra && ./setup.sh
```
This creates: S3 bucket, IAM role, security groups, 3 EC2 instances, Elastic IP

### Step 3: Database
```
cd scripts && ./seed-db.sh
```
This runs migrations and seeds the demo household

### Step 4: Deploy Services
```
cd scripts && ./deploy-all.sh
```
This deploys web, worker, and notifier in order and runs health checks

### Step 5: Verify
- Open `http://{elastic-ip}/` → should see Welcome page
- Register as caretaker → dashboard loads
- Open pantry cam on second device → send snapshot
- Check dashboard for proposal → approve → checkout event appears
- Check iMessage for notification

---

## Cost Estimate (Hackathon Duration ~24-48 hours)

| Resource | Type | Hourly Cost | 48-hour Cost |
|----------|------|-------------|-------------|
| Web EC2 | t3.small | $0.0208/hr | ~$1.00 |
| Worker EC2 | t3.medium | $0.0416/hr | ~$2.00 |
| Notifier EC2 | mac2.metal dedicated host | ~$6.50/hr | ~$312 (24hr min) |
| S3 | Standard | ~$0.00 | ~$0.00 (minimal data) |
| Elastic IP | Allocated | $0.005/hr | ~$0.24 |
| **Total** | | | **~$315** |

**Cost optimization**: The macOS EC2 is by far the most expensive. Consider:
- Running Photon on a teammate's MacBook locally + ngrok tunnel (~$0 extra)
- Only allocating the macOS EC2 for the final demo (save ~$156)
- Using the terminal provider for Photon during development (no macOS needed)

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| macOS EC2 dedicated host allocation is slow or unavailable in us-east-1 | Medium | High | Pre-allocate hours before demo; have MacBook + ngrok as fallback |
| macOS EC2 cost exceeds budget | High | Medium | Use MacBook + ngrok for development; only allocate EC2 for final demo |
| AWS credential management during hackathon is error-prone | Medium | Medium | Use .env files + .gitignore; never commit credentials; use IAM instance profiles |
| Security groups misconfigured → services can't communicate | Medium | Medium | Test inter-service connectivity after setup; use `curl` health checks |
| Supabase free tier rate limits hit during demo | Low | Low | Demo is single-user; free tier is sufficient |

---

## Sources & References

- **Origin document:** [docs/product_idea.md](docs/product_idea.md)
- AWS EC2 macOS instances: https://aws.amazon.com/ec2/instance-types/mac/
- AWS CLI EC2 guide: https://docs.aws.amazon.com/cli/latest/reference/ec2/
- AWS S3 CLI guide: https://docs.aws.amazon.com/cli/latest/reference/s3/
- PM2 process manager: https://pm2.keymetrics.io/docs/usage/quick-start/
- Supabase self-hosting vs hosted: https://supabase.com/docs/guides/self-hosting
