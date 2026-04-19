# Photon iMessage Alerts — Operator Runbook

This document covers setup, deployment, onboarding, and failure playbooks for the Photon iMessage alert integration.

---

## Overview

The system delivers caretaker iMessage alerts through three PM2 processes:

| Process | Runtime | Role |
|---|---|---|
| `caretaker-worker` | Node | Processes camera snapshots, runs Gemini, enqueues alerts |
| `caretaker-notifier` | Node | Internal `/notify` HTTP endpoint — enqueues to `photon_outbox` |
| `caretaker-photon-agent` | **Bun** | Drains outbox, sends via Photon Spectrum, handles inbound commands |

**Important:** The Photon agent uses **Bun**, not Node. The worker and notifier use Node. Do not swap runtimes.

---

## Shared-Mode Onboarding — REQUIRED Before First Alert

The Photon shared cloud plan uses a shared bot number. Cold outbound messages to arbitrary recipients do not work. The recipient **must** complete the following before alerts can be delivered:

1. **Add the recipient in the Photon dashboard** — name, E.164 phone number, and email address.
2. **Recipient accepts the Photon invite email.**
3. **Photon bot sends the first iMessage to the recipient.** The recipient must see and receive this message.
4. **Run the smoke test** (see below) to confirm delivery works.
5. **Update `photon_status` to `sendable`** in the dashboard or via the database.

Skipping any step results in `Target not allowed` errors (shown in dashboard as `onboarding_blocked`).

---

## First-Time Deployment

### Prerequisites

- Supabase project with migrations applied through `004_photon_alert_outbox.sql`
- Photon project with iMessage provider enabled
- `PHOTON_PROJECT_ID` and `PHOTON_PROJECT_SECRET` in `.env`
- Worker EC2 instance with Bun installed

### Install Bun on the worker host

```bash
curl -fsSL https://bun.sh/install | bash
# Add to PATH:
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
bun --version
```

### Deploy

```bash
bash scripts/deploy-workers.sh
```

The deploy script verifies Bun is available before starting PM2. If Bun is missing, the deploy fails with a clear error.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PHOTON_PROJECT_ID` | Yes | Photon dashboard project ID |
| `PHOTON_PROJECT_SECRET` | Yes | Photon project secret (preferred over `PHOTON_SECRET_KEY`) |
| `PHOTON_SECRET_KEY` | Alias | Deprecated alias for `PHOTON_PROJECT_SECRET` — migrate when convenient |
| `PHOTON_AGENT_POLL_MS` | No | Outbox poll interval in ms (default: 5000) |
| `PHOTON_AGENT_BATCH_SIZE` | No | Outbox batch size per poll (default: 10) |
| `PHOTON_HTTP_PORT` | No | Notifier HTTP port (default: 3040) |
| `NOTIFIER_BIND_HOST` | No | Notifier bind address (default: 127.0.0.1 — internal only) |
| `CARETAKER_PHONE` | Smoke only | E.164 phone for smoke test only — normal sends use the DB row |

**Do not use `docs/plans/PHOTON_INTEGRATION.md` as an env source.** That document contained live-looking examples. Use `.env.example` as the authoritative template.

---

## Smoke Test

Run after recipient onboarding is complete:

```bash
# On the worker host:
CARETAKER_PHONE=+1XXXXXXXXXX bun scripts/smoke-photon.ts
```

Expected output on success:
```
SUCCESS: Test message sent.
Next: Update caretaker photon_status to 'sendable' in the dashboard.
```

Then update the caretaker row in Supabase:
```sql
UPDATE caretakers SET photon_status = 'sendable' WHERE id = '11111111-1111-4111-8111-111111111101';
```

---

## Viewing Logs

```bash
# All processes
npx pm2 logs

# Photon agent only
npx pm2 logs caretaker-photon-agent --lines 50

# Notifier
npx pm2 logs caretaker-notifier --lines 20
```

---

## Failure Playbooks

### Bun not found

```
ERROR: bun not found. Install Bun before deploying the Photon agent.
```

**Fix:** Install Bun on the worker host (see First-Time Deployment above). The deploy script blocks on this.

---

### Missing Photon credentials

**Symptom:** Agent log shows `PHOTON_PROJECT_ID is required` or `PHOTON_PROJECT_SECRET is required`.

**Fix:** Add `PHOTON_PROJECT_ID` and `PHOTON_PROJECT_SECRET` to `.env` on the worker host. Then restart:
```bash
npx pm2 restart caretaker-photon-agent
```

---

### Target not allowed (onboarding blocked)

**Symptom:** Dashboard shows `onboarding_blocked`. Agent log: `category:onboarding_blocked`.

**Fix:** The recipient has not completed the Photon onboarding flow. Recheck:
1. Recipient is added in the Photon dashboard with the correct E.164 phone.
2. Recipient accepted the invite email.
3. Recipient received the first iMessage from the Photon bot number.

After completing onboarding, re-run the smoke test. Then update `photon_status` to `sendable`.

---

### Invalid phone

**Symptom:** Notifier returns `400 Invalid caretaker_phone`.

**Fix:** The caretaker phone number must be a valid E.164 number (e.g. `+16095550100`). Update the caretaker row in Supabase or via `/api/profile` with the correct format.

---

### Retryable Photon errors

**Symptom:** Agent log shows `category:retryable_error`. Outbox rows are retried with exponential backoff.

**Fix:** Usually a transient Photon service issue. Monitor PM2 logs. Rows retry automatically — no action needed unless errors persist for over 30 minutes.

---

### Outbox stuck in `sending`

**Symptom:** Rows in `photon_outbox` with `status = 'sending'` and no progress.

**Cause:** The agent crashed between claiming a row and updating it after delivery.

**Fix:** The agent reclaims stale `sending` rows on boot (rows stuck > 5 minutes). Simply restart the agent:
```bash
npx pm2 restart caretaker-photon-agent
```

Or manually reset in the database:
```sql
UPDATE photon_outbox SET status = 'pending', next_attempt_at = NULL
WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '5 minutes';
```

---

### Repeated permanent send errors

**Symptom:** Dashboard shows `failed`. Outbox rows have `status = 'failed'`.

**Fix:** Check `error_message` on the outbox rows:
```sql
SELECT id, recipient_phone, error_code, error_message, attempts FROM photon_outbox WHERE status = 'failed';
```

Common causes: invalid phone format, Photon project configuration issue, or recipient removed from Photon dashboard.

---

## Caretaker iMessage Commands

Caretakers can reply to alerts with these commands:

| Command | Effect |
|---|---|
| `help` | List available commands |
| `status` | Show recent warning/critical medication events |
| `ack <event-id>` | Acknowledge a medication alert (first 8 chars of the event UUID) |

Only messages from the registered caretaker phone are processed. Unrecognized senders are silently ignored.

---

## Dashboard Alert States

| Status | Meaning |
|---|---|
| `not_configured` | Photon credentials not set or caretaker not added to Photon dashboard |
| `invited` | Caretaker added in Photon dashboard — invite email sent, pending acceptance |
| `thread_open` | Invite accepted and first bot message received |
| `sendable` | Smoke test passed — alerts can be delivered |
| `onboarding_blocked` | `Target not allowed` error — recipient must complete onboarding |
| `failed` | Repeated permanent delivery errors — operator action required |
