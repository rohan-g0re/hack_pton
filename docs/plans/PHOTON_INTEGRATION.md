# Photon Spectrum iMessage Integration — Complete Reference

## Table of Contents

1. [What is Photon Spectrum](#1-what-is-photon-spectrum)
2. [Architecture Overview](#2-architecture-overview)
3. [Environment Variables Required](#3-environment-variables-required)
4. [Dashboard Setup (One-Time)](#4-dashboard-setup-one-time)
5. [The Critical User Onboarding Flow](#5-the-critical-user-onboarding-flow)
6. [Package & Runtime Requirements](#6-package--runtime-requirements)
7. [Code: Service Layer](#7-code-service-layer)
8. [Code: Outbox Pattern](#8-code-outbox-pattern)
9. [Code: Agent Worker](#9-code-agent-worker)
10. [Code: Command Router](#10-code-command-router)
11. [Debugging Journey & Lessons Learned](#11-debugging-journey--lessons-learned)
12. [How Everything Links Together](#12-how-everything-links-together)
13. [Running in Development](#13-running-in-development)

---

## 1. What is Photon Spectrum

Photon Spectrum is a cloud service and TypeScript SDK that lets you build agents that send and receive iMessages programmatically. It abstracts away Apple's iMessage protocol behind a unified API.

**Plans:**
- **Shared (Pro):** Your project shares a single Apple ID with other Photon users. Phone number is `+1 (415) 610-6180`. Cheapest but has restrictions (see section 5).
- **Dedicated:** Your project gets its own Apple ID and phone number. Can cold-message anyone. Enterprise pricing.

**This project uses: Shared / Pro plan.**

**SDK:** `spectrum-ts` — TypeScript framework wrapping `@photon-ai/advanced-imessage`.

---

## 2. Architecture Overview

```
Next.js app (port 3000)
  └─ /api/vision/capture        ─┐
  └─ /api/knot/webhook           ├─► services/outbox.ts ─► outbox table (Supabase)
  └─ /api/cron/nightly-summary  ─┘                              │
                                                                 │ (polled every 2s)
                                                                 ▼
                                                    Agent Worker (bun src/agent/worker.ts)
                                                      ├─ drains outbox → Photon → iMessage
                                                      └─ receives inbound iMessages → commandRouter
```

**Key design principle:** Next.js routes NEVER call Photon directly. They write to the `outbox` table. The agent worker (a separate long-lived process) owns the Spectrum connection and handles all iMessage I/O.

**Why:** The Spectrum SDK uses a long-lived async iterator (`for await (const [space, message] of app.messages)`). Next.js serverless route handlers time out after a few seconds and cannot hold this open. The worker process runs indefinitely.

---

## 3. Environment Variables Required

All in `.env.local` at project root:

```env
# Photon Spectrum (Pro plan — cloud/shared mode)
PHOTON_PROJECT_ID=1790d4b6-6465-4627-b483-ef7f61baf879
PHOTON_PROJECT_SECRET=VcqX0z8i0aIVCFkeGGuq9qv1xqTTFm5UcVvtzqx-B3k

# Target phone for demo notifications (must be a registered Photon user — see section 5)
CARETAKER_PHONE=+13472069409
```

**Where to find these:**
- `PHOTON_PROJECT_ID` and `PHOTON_PROJECT_SECRET`: Photon dashboard → your project → **Settings** tab
- `CARETAKER_PHONE`: The E.164 phone number (`+[country][number]`, no spaces) of the caretaker who will receive iMessages

**How env vars are validated:**

`src/lib/env.ts` uses Zod to validate all env vars at startup. If any are missing, the app throws at import time with a clear error listing the missing keys:

```typescript
// src/lib/env.ts
const serverSchema = z.object({
  PHOTON_PROJECT_ID: z.string().min(1),
  PHOTON_PROJECT_SECRET: z.string().min(1),
  CARETAKER_PHONE: z.string().min(1),
  // ... other vars
});

export const env = parseEnv(); // throws immediately if missing
```

**Access pattern:** Never use `process.env.PHOTON_PROJECT_ID` directly. Always use `env.PHOTON_PROJECT_ID` from `@/lib/env`.

---

## 4. Dashboard Setup (One-Time)

### 4.1 Create a Photon Project

1. Sign up at **app.photon.codes**
2. Create an organisation and a **Spectrum** project
3. Go to **Settings** tab → copy `Project ID` and `Project Secret`
4. Put them in `.env.local`

### 4.2 Enable iMessage Platform

1. In your Spectrum project → **Platforms** tab
2. Toggle **iMessage (RCS/SMS fallback)** ON
3. Confirm the toggle is dark/enabled

### 4.3 Add Users

1. Go to **Users** tab → **+ Add User**
2. Enter name, phone number (E.164), and email for each caretaker/recipient
3. The user will receive an **email invite** from Photon
4. They MUST accept the invite (see section 5 — this is critical)

---

## 5. The Critical User Onboarding Flow

**This is the most important thing to understand about shared mode.**

### The Problem We Hit

When we first tried sending a message to a registered user, the API returned:

```
{ ok: false, error: 'Target not allowed for this project' }
```

### Why It Happens

In **shared mode**, Photon's bot uses a single shared Apple ID (`+1 (415) 610-6180`) across many projects. Apple's iMessage anti-spam rules prevent a shared account from cold-messaging arbitrary phone numbers it has never interacted with.

### The Required Flow

```
1. You add user in Photon dashboard (name + phone + email)
        │
        ▼
2. Photon sends the user an email invite
        │
        ▼
3. User accepts the email invite
        │
        ▼
4. Photon bot (+1 415 610-6180) automatically sends the user
   a welcome iMessage — this OPENS the conversation thread
        │
        ▼
5. Conversation is now open — your app CAN send messages to this user
```

**Without step 3 and 4, ALL outbound messages will fail with "Target not allowed".**

### How to Verify

After the user accepts and receives the bot's first message, their status in the Photon dashboard **Users** tab will show **"Running"** (green badge).

### What the Shared Bot Number Is

The shared iMessage bot number is: **+1 (415) 610-6180**

This is NOT exposed via the Photon API (calling `GET /projects/{id}/imessage/` only returns `{ type: 'shared' }`). We found it by having the user check their iMessages after accepting the invite.

---

## 6. Package & Runtime Requirements

### Packages

```json
{
  "dependencies": {
    "spectrum-ts": "^0.4.0",
    "@photon-ai/advanced-imessage": "^0.4.3"
  }
}
```

Install with:
```bash
npm install spectrum-ts @photon-ai/advanced-imessage
```

### Critical: Must Use Bun, Not Node/tsx

**`@photon-ai/advanced-imessage`'s `package.json` exports:**

```json
{
  "exports": {
    ".": {
      "bun": "./dist/index.js",
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

There is **no `"require"` or `"default"` export condition**. Node.js CJS loader (`npx tsx`) cannot resolve this package and throws:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
.../node_modules/@photon-ai/advanced-imessage/package.json
```

**Solution: Use bun.**

Install bun:
```bash
curl -fsSL https://bun.sh/install | bash
exec /bin/zsh  # reload shell
```

Run scripts with bun:
```bash
bun scripts/smoke-photon.ts        # instead of npx tsx scripts/smoke-photon.ts
bun src/agent/worker.ts            # instead of tsx src/agent/worker.ts
```

**`package.json` script:**
```json
{
  "scripts": {
    "agent": "bun src/agent/worker.ts"
  }
}
```

---

## 7. Code: Service Layer

### 7.1 `src/services/photon/app.ts`

Creates the Spectrum app instance. Used only by the agent worker (never by Next.js routes).

```typescript
import { Spectrum, type SpectrumInstance } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { env } from "@/lib/env";

export type SpectrumApp = SpectrumInstance;

export async function createSpectrumApp(): Promise<SpectrumApp> {
  return Spectrum({
    projectId: env.PHOTON_PROJECT_ID,
    projectSecret: env.PHOTON_PROJECT_SECRET,
    providers: [imessage.config()],
  });
}
```

**What `imessage.config()` does internally:**
1. Calls `POST /projects/{id}/imessage/tokens` on `spectrum.photon.codes` with Basic auth
2. Gets a short-lived gRPC token
3. Creates a gRPC client pointing to `imessage.spectrum.photon.codes:443`
4. Schedules token renewal at 80% of TTL

### 7.2 `src/services/photon/outbound.ts`

Low-level send functions. Used by the worker's outbox drainer.

```typescript
import { imessage } from "spectrum-ts/providers/imessage";
import { attachment, text } from "spectrum-ts";
import type { ContentInput } from "spectrum-ts";
import type { SpectrumApp } from "./app";

export async function sendToPhone(
  app: SpectrumApp,
  phone: string,
  ...content: ContentInput[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const im = imessage(app);
    const user = await im.user(phone);
    const space = await im.space(user);
    await space.send(...(content as [ContentInput, ...ContentInput[]]));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTextWithImage(
  app: SpectrumApp,
  phone: string,
  body: string,
  imagePath: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const im = imessage(app);
    const user = await im.user(phone);
    const space = await im.space(user);
    await space.send(text(body), attachment(imagePath));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

**How `im.user(phone)` + `im.space(user)` works internally:**
- `im.user(phone)` resolves to `{ id: phone }` — just stores the phone number
- `im.space(user)` calls `directChat(phone)` from `@photon-ai/advanced-imessage` which constructs a chat GUID: `iMessage;-;+13472069409`
- `space.send(content)` calls `remote.messages.send(chatGuid, text)` over gRPC

### 7.3 `scripts/smoke-photon.ts`

One-time smoke test to verify the Photon integration works.

```typescript
import { createSpectrumApp } from "../src/services/photon/app";
import { sendToPhone } from "../src/services/photon/outbound";
import { env } from "../src/lib/env";

async function main() {
  const app = await createSpectrumApp();
  const result = await sendToPhone(
    app,
    env.CARETAKER_PHONE,
    `NannyCam is online 👋 ${new Date().toISOString()}`,
  );
  if (!result.ok) {
    console.error("Failed to send message:", result.error);
    await app.stop();
    process.exit(1);
  }
  console.log("Message sent successfully");
  await app.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run with: `bun scripts/smoke-photon.ts`

---

## 8. Code: Outbox Pattern

Next.js routes never call Photon directly. They write to an `outbox` table. The worker drains it.

### 8.1 Database Schema

```sql
-- supabase/migrations/0002_outbox.sql
create table outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_phone text not null,
  body text not null,
  attachment_path text,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_pending on outbox(created_at) where status = 'pending';
```

Apply with: `npx supabase db push` (after `npx supabase link --project-ref <ref>`)

### 8.2 `src/services/outbox.ts`

```typescript
import { adminClient } from "@/services/supabase/admin";

export async function enqueueMessage(opts: {
  phone: string;
  body: string;
  attachmentPath?: string;
}): Promise<string> {
  const { data, error } = await adminClient
    .from("outbox")
    .insert({
      recipient_phone: opts.phone,
      body: opts.body,
      attachment_path: opts.attachmentPath ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`[outbox] Failed to enqueue: ${error.message}`);
  return data.id;
}
```

### 8.3 Usage in API Routes

```typescript
// e.g. src/app/api/vision/capture/route.ts
import { enqueueMessage } from "@/services/outbox";
import { env } from "@/lib/env";

await enqueueMessage({
  phone: env.CARETAKER_PHONE,
  body: `Pill check: compartment taken ✓ (confidence: high)`,
  attachmentPath: snapshotUrl ?? undefined,
});
```

---

## 9. Code: Agent Worker

`src/agent/worker.ts` — run with `npm run agent` (which calls `bun src/agent/worker.ts`)

```typescript
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { attachment, text } from "spectrum-ts";
import { adminClient } from "@/services/supabase/admin";
import { route } from "./commandRouter";
import { env } from "@/lib/env";
import type { OutboxStatus } from "@/types/db";

async function main() {
  // 1. Initialize Spectrum app
  const app = await Spectrum({
    projectId: env.PHOTON_PROJECT_ID,
    projectSecret: env.PHOTON_PROJECT_SECRET,
    providers: [imessage.config()],
  });

  // 2. On boot: reclaim rows stuck in 'sending' from a prior crashed worker
  await adminClient
    .from("outbox")
    .update({ status: "pending" as OutboxStatus })
    .eq("status", "sending" as OutboxStatus);

  console.log("agent ready");

  // 3. Outbox drainer — runs in background, checks every 2s
  const drainer = (async () => {
    while (true) {
      try {
        // Atomic claim: UPDATE returns only rows that were 'pending' at UPDATE time
        const { data: rows } = await adminClient
          .from("outbox")
          .update({ status: "sending" as OutboxStatus })
          .eq("status", "pending" as OutboxStatus)
          .select()
          .limit(5);

        for (const row of rows ?? []) {
          try {
            const im = imessage(app);
            const user = await im.user(row.recipient_phone);
            const space = await im.space(user);
            if (row.attachment_path) {
              await space.send(text(row.body), attachment(row.attachment_path));
            } else {
              await space.send(text(row.body));
            }
            await adminClient
              .from("outbox")
              .update({ status: "sent" as OutboxStatus, sent_at: new Date().toISOString() })
              .eq("id", row.id);
          } catch (err: unknown) {
            await adminClient
              .from("outbox")
              .update({ status: "failed" as OutboxStatus, error: String(err instanceof Error ? err.message : err) })
              .eq("id", row.id);
          }
        }
      } catch (err) {
        console.error("[drainer] Supabase error:", err);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();

  // 4. Inbound message loop
  for await (const [space, message] of app.messages) {
    if (message.content.type !== "text") continue;

    // Soft auth: only respond to messages from the registered caretaker
    if (message.sender.id !== env.CARETAKER_PHONE) continue;

    const msgText = message.content.text;
    try {
      await space.responding(async () => {
        // space.responding() shows typing indicator automatically
        const reply = await route({ from: message.sender.id, text: msgText });
        await space.send(text(reply));
      });
    } catch (err) {
      console.error("[inbound] Error handling message:", err);
    }
  }

  await drainer;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Key design notes:**

- The drainer and inbound loop run **concurrently** — drainer is a floating promise, inbound is the `for await` main loop
- Drainer uses **atomic UPDATE** to claim rows (prevents duplicate sends if worker restarts)
- On boot, `'sending'` rows are reset to `'pending'` to recover from a previous crash
- Soft auth: `message.sender.id` is the phone number in E.164 format — must exactly match `CARETAKER_PHONE`
- `space.responding()` automatically sends and clears the typing indicator even if the callback throws

---

## 10. Code: Command Router

`src/agent/commandRouter.ts` — handles inbound iMessage commands from the caretaker.

Supported commands:

| Message sent         | Response                                        |
|----------------------|-------------------------------------------------|
| `status`             | Last 5 events from Supabase                    |
| `rules`              | Current spending rules                          |
| `reorder`            | Assess last pantry snapshot, list low items    |
| `reorder <item>`     | Queue a reorder for a specific item             |
| `approve <eventId>`  | Set event status = 'approved'                  |
| `block <eventId>`    | Set event status = 'blocked'                   |

**Fallback:** `"Try: status, rules, approve <id>, block <id>, reorder <item>"`

The router uses simple regex matching — no NLP/LLM for command parsing (fast, reliable, no quota usage).

---

## 11. Debugging Journey & Lessons Learned

### Problem 1: "Target not allowed for this project"

**Error:** `sendToPhone returned { ok: false, error: 'Target not allowed for this project' }`

**Initial assumption:** Code bug, wrong API usage, or iMessage not enabled.

**What we tried:**
1. Verified iMessage platform was enabled in dashboard ✓
2. Verified user was added with correct phone number ✓
3. Verified credentials were correct ✓
4. Checked Photon API: `GET /projects/{id}/imessage/` → returned `{ type: 'shared' }` — no phone number

**Root cause:** Shared mode Apple ID cannot cold-message a phone number it has never interacted with. Recipient must initiate contact first OR be onboarded via Photon's invite flow.

**Fix:** Have each recipient accept the Photon email invite, which triggers the bot to text them first, opening the conversation thread.

---

### Problem 2: `ERR_PACKAGE_PATH_NOT_EXPORTED`

**Error:**
```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
.../node_modules/@photon-ai/advanced-imessage/package.json
```

**When it occurs:** Running `npx tsx scripts/smoke-photon.ts` or `npm run agent` (when using tsx)

**Root cause:** `@photon-ai/advanced-imessage/package.json` only has `"bun"` and `"import"` export conditions — no `"require"` or `"default"`. Node.js CJS resolution fails.

**Fix:** Use `bun` instead of `node`/`tsx`:
```bash
# Before (broken)
npx tsx scripts/smoke-photon.ts
tsx src/agent/worker.ts

# After (working)
bun scripts/smoke-photon.ts
bun src/agent/worker.ts
```

Also updated `package.json`:
```json
{ "scripts": { "agent": "bun src/agent/worker.ts" } }
```

---

### Problem 3: Inbound messages not triggering responses

**Symptom:** Sending a message to the bot does nothing.

**Root cause:** The soft auth check — `message.sender.id !== env.CARETAKER_PHONE` — drops the message if the sender's phone doesn't exactly match `CARETAKER_PHONE` in `.env.local`.

**Fix:** Ensure `CARETAKER_PHONE` in `.env.local` exactly matches the phone number of whoever is texting the bot, in E.164 format (`+13472069409` not `13472069409` or `(347) 206-9409`).

---

### Problem 4: Gemini quota exhausted by motion detection

**Symptom:** `429 RESOURCE_EXHAUSTED` — quota exceeded for `gemini-2.5-flash` (50 RPD free).

**Root cause:** Motion detection in `WebcamCapture.tsx` was firing a Gemini API call every 2 seconds whenever any motion was detected (e.g. just sitting in front of the camera).

**Fix 1:** Add 60-second cooldown between motion-triggered captures:
```typescript
// src/components/cam/WebcamCapture.tsx
if (hasMotion(prev, frame)) {
  const now = Date.now();
  if (now - lastMotionRef.current > 60_000) {  // 60s cooldown
    lastMotionRef.current = now;
    capture();
  }
}
```

**Fix 2:** Switch model from `gemini-2.5-flash` (50 RPD free) to `gemini-2.0-flash` (1500 RPD free):
```typescript
// src/services/gemini/client.ts
const MODEL_PRIMARY = "gemini-2.0-flash";  // was "gemini-2.5-flash"
```

---

## 12. How Everything Links Together

```
User action (webcam capture / Knot webhook / cron)
        │
        ▼
Next.js API route (e.g. /api/vision/capture)
        │
        ├─ Calls Gemini for analysis
        ├─ Inserts into events table
        └─ Calls enqueueMessage() → inserts into outbox table
                                            │
                                            │ (Supabase Postgres)
                                            │
                                            ▼
                                Agent Worker (bun src/agent/worker.ts)
                                    │
                                    ├─ Drainer loop (every 2s):
                                    │   - SELECT pending outbox rows (atomic UPDATE)
                                    │   - imessage(app).user(phone) → space → send
                                    │   - UPDATE outbox SET status='sent'
                                    │
                                    └─ Inbound loop (for await app.messages):
                                        - Filter: only CARETAKER_PHONE
                                        - Filter: only text messages
                                        - Route to commandRouter
                                        - space.send(reply)
                                                │
                                                ▼
                                        Caretaker's iPhone (iMessage)
```

---

## 13. Running in Development

You need **two terminals**:

**Terminal 1 — Next.js app:**
```bash
npm run dev
```

**Terminal 2 — Agent worker:**
```bash
npm run agent
# equivalent to: bun src/agent/worker.ts
```

**One-time smoke test (verify Photon works):**
```bash
bun scripts/smoke-photon.ts
# Should print: "Message sent successfully"
```

**Checklist before running:**

- [ ] `.env.local` has `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`, `CARETAKER_PHONE`
- [ ] Caretaker's phone is added in Photon dashboard → Users tab
- [ ] Caretaker has accepted the Photon email invite
- [ ] Caretaker has received the welcome iMessage from `+1 (415) 610-6180`
- [ ] `bun` is installed (`bun --version`)
- [ ] Supabase migrations applied (`npx supabase db push`)
- [ ] Seed data inserted (run `supabase/seed.sql` in Supabase SQL editor)
