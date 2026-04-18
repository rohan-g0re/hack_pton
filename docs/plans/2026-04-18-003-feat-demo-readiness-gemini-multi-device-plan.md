---
title: "feat: Demo-Readiness — Gemini ER-1.6 Vision, Multi-Device Cameras, Live Caretaker Dashboard, Knot Auto-Reorder"
type: feat
status: active
date: 2026-04-18
deepened: 2026-04-18
origin: docs/brainstorms/2026-04-18-aegis-mvp-requirements.md
supersedes_partial:
  - docs/plans/2026-04-18-001-feat-aegis-mvp-plan.md
---

# feat: Demo-Readiness — Gemini ER-1.6, Multi-Device Cameras, Live Dashboard, Knot Auto-Reorder

> **Target directory:** `aegis/` — all file paths in this plan are relative to the `aegis/` Next.js project root unless otherwise stated.

## Overview

Take the existing Aegis codebase from "partially wired locally" to a **publicly-hosted, multi-device demo** where:

1. One patient profile is created (mock, no auth).
2. Three devices (browser tabs on phones/laptops) each pick a camera role (grocery shelf, medicine table, living area).
3. A caretaker dashboard shows all three feeds live with continuous vision analysis.
4. When groceries are low, the system auto-reorders via Knot using mock grounding data.

This plan **changes two architectural decisions** from plan 001 and **adds** multi-device plumbing and demo hosting:

| Change | From (plan 001) | To (this plan) |
|---|---|---|
| Vision model | GPT-4o (`src/lib/vision.ts`) | **Gemini Robotics-ER 1.6** (`gemini-robotics-er-1.6-preview`) |
| Capture interval | grocery 10min, medical 1min, emergency 30s | **emergency 3s, grocery 60s, medical windowed** (2-5s target during active window) |
| Device model | Single implied device per domain | **Three devices pick a role at onboarding, routed to `/camera/[domain]`** |
| Hosting | Localhost only | **Dual AWS EC2** — Linux EC2 for the Next.js app (vision, dashboard, perception loop, Knot, scheduler) + macOS EC2 (or Mac mini) for the Photon iMessage bridge. ngrok retained as dev/iteration fallback. |
| Grocery grounding | Baseline photo comparison | **Mock expected-inventory JSON** + ER-1.6 item counts + Knot last-order delta |

**Explicitly deferred** (out of scope for this plan):

- Supabase auth + DB — JSON file mocks remain.
- Real multi-patient or caretaker-invites — single patient, single caretaker hardcoded.
- Vercel / serverless deployment — the stateful perception loop (Unit 2a), `scheduler.ts`'s `setInterval`, `globalThis.snapshotStore`, and `data/events.json` disk writes rule out serverless; dual-EC2 is the chosen host.
- LangGraph adoption — deferred; revisit only if conversational-memory requirements (R25-R28) return into scope. The perception loop (Unit 2a) is the right-sized coordinator for this demo.

## Problem Frame

The team has a working local Next.js app (`aegis/`) with vision analysis (GPT-4o), a Knot client, an iMessage integration, a scheduler, and Pencil-designed UI pages (per plan 002). But:

- No two devices can act as distinct cameras today — the URL `/camera/grocery` is shared across any tab that loads it.
- The dashboard doesn't show three concurrent live feeds.
- Gemini Robotics-ER 1.6 is the user's preferred vision model for per-frame object localization and counting, which fits the grocery inventory use case better than free-form GPT-4o prose.
- The grocery auto-reorder loop (vision → Knot last-order delta → Knot checkout) hasn't been wired end-to-end with mock grounding.
- Nothing is deployed anywhere reachable from phones.

See origin: `docs/brainstorms/2026-04-18-aegis-mvp-requirements.md` and `docs/plans/2026-04-18-001-feat-aegis-mvp-plan.md` for the overall system design.

## Requirements Trace

This plan advances the following origin requirements with updated technical approaches:

**Vision & Capture**
- **R1, R2, R3** (three video feeds, periodic snapshots, per-domain frequency) — retuned intervals, multi-device routing (Units 3, 4, 5)
- **R2** specifically — **vision model swap to Gemini Robotics-ER 1.6** (Unit 2); resolves the origin doc's deferred question about vision model choice

**Grocery Reorder**
- **R4, R5, R6, R7, R11, R12** (grocery vision trigger → TransactionLink → Shopping availability → Checkout) — wired end-to-end with mock grounding (Units 1, 6, 7)

**Emergency Alerting**
- **R17, R18, R19, R20** (emergency high-frequency detection → immediate alert) — retuned to 3s interval, confirmed to work with ER-1.6 output shape (Unit 2, 5)

**Demo Reach**
- **Origin Success Criterion**: "Judges can see all three video feeds and corresponding iMessage chats" — addressed by multi-device + live dashboard + public hosting (Units 4, 5, 8)

**Requirements NOT advanced by this plan** (intentional — already covered or deferred):

- R13-R16 Medical TTS + monitoring — largely in place from plan 001; frame-interval retune only (Unit 3)
- R21-R24, R25-R28 Daily summary, conversational memory, Photon iMessage — unchanged from plan 001 (still works as-is on Mac; no-ops on Windows/Linux)

## Scope Boundaries

- **No real auth** — single hardcoded patient, single caretaker. Role selection is a localStorage key (already present per plan 002).
- **No Supabase** — JSON-file mocks stay as the storage layer.
- **Dual-EC2 only, no serverless** — Linux EC2 hosts the Next.js app; macOS EC2 hosts the Photon iMessage bridge. ngrok is retained only as a dev-iteration tunnel, not the production demo path.
- **No real video streaming (WebRTC)** — the caretaker dashboard polls the latest snapshot per domain. Vision already works frame-by-frame; "live" = 2-5s refresh.
- **No pixel-mask segmentation** — Gemini ER-1.6 returns points + bounding boxes + labels; that's sufficient for item counting and emergency detection.
- **No new patient-invite or caretaker-invite flow** — post-demo.
- **No changes to the Pencil-design UI shell** beyond adding the camera-role picker on patient onboarding and finalizing dashboard live tiles. Plan 002's unit list remains authoritative for everything else.

## Context & Research

### Relevant Code and Patterns

**Already in place (retained):**
- `src/lib/vision.ts` — GPT-4o vision wrapper. This file is the swap target for Unit 2.
- `src/lib/knot.ts` — full Knot client: `listMerchants`, `syncTransactions`, `getAllTransactions`, `syncCart`, `checkout`, `createSession`. No changes needed.
- `src/lib/imessage.ts` — Photon `@photon-ai/imessage-kit` wrapper with graceful no-op fallback on non-Mac (already prints `console.log(...)` when SDK is not initialized). Unchanged.
- `src/lib/scheduler.ts` — 30s tick loop for med reminders and daily summary. Continues to work as-is.
- `src/lib/events.ts` — append-only event log in `data/events.json`. Continues as-is.
- `src/app/camera/[domain]/page.tsx` — existing per-domain camera page with `CameraFeed` component; currently hardcodes intervals (grocery 10min, medical 1min, emergency 30s). Interval values are retuned in Unit 3.
- `src/app/api/snapshot/route.ts` and `src/app/api/snapshot/latest/[domain]/route.ts` — snapshot receive + retrieve. Already the right shape for multi-device; a snapshot is keyed by `domain` regardless of which device sent it.
- `src/app/dashboard/page.tsx` + `src/components/CameraPreview.tsx` — already designed per plan 002; dashboard polling of `/api/snapshot/latest/:domain` is the pattern to complete.
- `src/app/onboarding/patient/page.tsx` — exists per plan 002 Unit 11; extended with camera-role picker in Unit 4.
- `data/prescriptions.json`, `data/events.json`, `data/settings.json` — JSON grounding already established.

**AGENTS.md convention (important for implementers):**
> "This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."

Implementers must consult `aegis/node_modules/next/dist/docs/` before writing Next.js code.

### Institutional Learnings

None in `docs/solutions/` (empty directory).

### External References

- **Gemini Robotics-ER 1.6** docs: <https://ai.google.dev/gemini-api/docs/robotics-overview>. Model ID: `gemini-robotics-er-1.6-preview`. Output format: JSON with `{"point":[y,x], "label":...}` and `{"box_2d":[ymin,xmin,ymax,xmax], "label":...}` (coords normalized 0-1000). Python SDK: `google-genai` (`from google import genai`). REST endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-robotics-er-1.6-preview:generateContent`. Input accepts images, video frames, and text.
- **Knot Shopping quickstart**: <https://docs.knotapi.com/shopping/quickstart>. Flow: Create Session (backend) → SDK in browser (account link, first time only) → Sync Cart (backend) → Checkout (backend). First-time merchant link requires the SDK widget; after linking, checkout is backend-only. Dev mode exposes a `Link Account` endpoint to bypass the widget for testing.
- **`getUserMedia` and HTTPS**: the browser camera API requires HTTPS (or `localhost`). The Linux EC2 public URL must serve HTTPS (ACM + ALB or Caddy/Let's Encrypt); ngrok handles HTTPS automatically when used as a dev fallback.

## Key Technical Decisions

- **Gemini Robotics-ER 1.6 for all three domains.** It returns structured `{label, bbox/point}` per object, which is a superset of what GPT-4o's prose output gave us. For grocery: count bboxes per label. For medical: **single-frame check at window-close** — ask whether the expected pill/bottle is still present at the pill table; if yes → `meds_taken: false` (alert); if no → `meds_taken: true` (logged, no alert). This is the healthcare-track headline moment and must be rock-solid; before/after diffing is dropped because it required a pre-window baseline that the capture gating could not guarantee. For emergency: ask for labels like `"person_on_floor"`, `"fire"`, `"smoke"` and treat presence + confidence as the trigger. The `GroceryAnalysis` and `EmergencyAnalysis` contracts are preserved; `MedicalAnalysis` is simplified to a single-frame result (see Unit 2).

- **Keep GPT-4o for daily summary.** `generateSummary()` in `vision.ts` is text-in-text-out prose generation, not object localization. Gemini ER-1.6 is the wrong tool. Leave `openai` dep in `package.json`; reuse it only for `generateSummary`.

- **Smart sampling per domain.** Emergency 3s (high signal-to-cost), grocery 60s (inventory changes slowly), medical **one analysis call per reminder window** — not per-frame. The medical camera continues capturing every 10s during the window for the live dashboard feed, but Gemini is called exactly once per window (triggered by `scheduler.ts`'s `checkMedWindow` at window-close) on the latest captured frame. Outside a window, medical capture continues for the dashboard but no Gemini call fires. Rationale: 3 cameras × 2s = 5,400 Gemini calls/hour × 24h is prohibitive on preview tier; per-window medical analysis also neatly avoids the false-positive "hand near pill bottle" failure mode of per-frame diffing.

- **Multi-device via localStorage role selection, not auth.** The patient onboarding page asks "Which camera is this?" and writes `aegis_camera_role=grocery|medical|emergency` to localStorage, then redirects to `/camera/[role]`. Three devices open the same URL, each picks a different role. Zero backend change.

- **Mock grounding files for grocery.** `data/groceries.json` holds expected shelf inventory as `{"items":[{"name":"milk","expected_count":1,"threshold":1},...]}`. The check route compares Gemini's `{"label":"milk","count":0}` against this. If low, it calls Knot `syncTransactions` to find the item in the last order, calls `syncCart` + `checkout`. No Supabase needed.

- **Pre-linked Knot merchant for demo.** Use Knot's dev-mode `Link Account` endpoint once (via a one-off script) to link a test merchant (expected: Walmart or Instacart in dev). After linking, `syncCart` + `checkout` are fully backend-only and the demo never needs the Knot widget. Document this in Unit 7.

- **Live dashboard via snapshot polling, not WebRTC.** Each domain POSTs to `/api/snapshot` at its interval; `/api/snapshot/latest/[domain]` returns the most recent image. Dashboard `<img>` tags poll every 2s. Simple, works everywhere, sidesteps WebRTC complexity.

- **Perception loop as the always-on supervisor.** A 3s heartbeat (`src/lib/perception-loop.ts`, Unit 2a) owns a single typed `globalThis.perceptionState` that consolidates per-domain frame timestamps, last-analyzed timestamps, and the active medical window. Scattered flags — `globalThis.watchingMed`, `globalThis.emergencyLastAnalyzedAt`, `globalThis.groceryLastAnalyzedAt` — collapse into this object. The 30s scheduler tick stays authoritative for prescription-time firing; the perception loop runs alongside at 3s for live perception state. LangGraph was evaluated and deferred (payoff maps to out-of-scope R25-R28). The perception loop also powers an SSE feed (`/api/perception-state?sse=1`) reusing the `/api/medical/tts-stream` precedent so the dashboard can render a live heartbeat.

- **Dual-EC2 public hosting.** The demo deploys to two AWS instances: (1) a **Linux EC2** host running the Next.js app — vision routes, caretaker dashboard, perception loop, Knot integration, `scheduler.ts`'s `setInterval`, `globalThis.snapshotStore`, perception state, and `data/events.json` disk writes all live here because they require a long-lived stateful process; (2) a **macOS EC2** (or Mac mini acting as an EC2-equivalent) running the Photon `@photon-ai/imessage-kit` bridge, since Photon is Mac-only. `src/lib/imessage.ts` becomes a thin HTTPS client that POSTs to the macOS bridge rather than invoking Photon in-process; on non-Mac hosts it continues to no-op gracefully. ngrok is kept only as a dev/iteration fallback for fast local testing — it is not the demo delivery path. Vercel stays out of scope: the stateful loop is incompatible with serverless.

- **Security posture: accepted demo risk.** The Linux EC2 public URL is fully unauthenticated. Anyone with the URL can POST snapshots, read camera frames, and trigger Knot dev-mode checkouts. The macOS bridge is protected by a shared `IMESSAGE_BRIDGE_TOKEN` bearer header and should be locked to the Linux EC2 security-group egress IP at minimum. These constraints are acknowledged and accepted for the 3-minute demo — the URL is shared only with the team and judges during the pitch. Post-demo hardening (edge auth, per-device tokens, rate limits, VPC peering between the two hosts) is out of scope for this plan.

## Open Questions

### Resolved During Planning

- **Vision model choice** (was deferred in origin doc): **Gemini Robotics-ER 1.6** (`gemini-robotics-er-1.6-preview`). Supersedes plan 001's GPT-4o decision for per-frame analysis. GPT-4o is retained only for daily summary text generation.
- **Frame interval per domain** (was deferred): emergency 3s, grocery 60s, medical 10s continuous capture (for live dashboard) with Gemini analysis only at window-close (one call per reminder).
- **Multi-device identity** (was implicit): localStorage-based role selection at patient onboarding. No backend change.
- **How the caretaker sees "live" feeds**: 2s polling of the latest per-domain snapshot + SSE heartbeat from the perception loop (Unit 2a) — no WebRTC.
- **Coordinator for always-on state**: custom 3s perception loop in `src/lib/perception-loop.ts` (Unit 2a). LangGraph is deferred (payoff maps to out-of-scope conversational-memory requirements).
- **Hosting for the demo**: dual AWS EC2 — Linux EC2 for the Next.js app, macOS EC2 for the Photon iMessage bridge. ngrok is a dev-iteration fallback, not the demo path.
- **Pre-linking Knot**: use dev-mode `Link Account` endpoint via a one-off script; document in Unit 7.
- **Grocery grounding without Supabase**: `data/groceries.json` with expected counts + thresholds.

### Deferred to Implementation

- **Exact merchant ID to pre-link** — call `GET /merchants?type=shopping` on the Knot dev environment to enumerate available merchants first.
- **Gemini ER-1.6 prompt exact wording per domain** — start from the shapes in `src/lib/prompts.ts` and iterate during Unit 2 against a few test frames. Requires real frames to tune.
- **Rate-limit behavior of `gemini-robotics-er-1.6-preview`** — not documented. Start conservative (smart sampling above) and back off on 429.
- **Whether `speechSynthesis` works reliably on the specific demo phones** — plan 001 already flagged this. Validate in Unit 10 rehearsal.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant D1 as Device 1 (Grocery Cam)
    participant D2 as Device 2 (Medical Cam)
    participant D3 as Device 3 (Emergency Cam)
    participant Srv as Next.js (aegis/) on Linux EC2
    participant Loop as Perception Loop (3s)
    participant Gem as Gemini ER-1.6
    participant Knot as Knot API
    participant Mac as macOS EC2 (Photon bridge)
    participant Dash as Caretaker Dashboard

    Note over D1,D3: Each device opens /onboarding/patient,<br/>picks a camera role, stored in localStorage,<br/>redirected to /camera/[role]

    loop Per-domain interval (3s / 60s / windowed)
        D1->>Srv: POST /api/snapshot {domain:"grocery", image}
        D2->>Srv: POST /api/snapshot {domain:"medical", image}
        D3->>Srv: POST /api/snapshot {domain:"emergency", image}
        Srv->>Gem: generateContent({model:"gemini-robotics-er-1.6-preview", image, prompt})
        Gem-->>Srv: {labels, bboxes, points}

        alt Grocery: item.count < threshold
            Srv->>Srv: Compare against data/groceries.json
            Srv->>Knot: syncTransactions(merchantId)
            Knot-->>Srv: Past orders
            Srv->>Srv: Intersect low items × last-order SKUs
            Srv->>Knot: syncCart(delta)
            Srv->>Knot: checkout()
            Knot-->>Srv: Order confirmation
            Srv->>Srv: logEvent(grocery_reorder_placed)
        end

        alt Medical: window closed + expected pill still visible
            Srv->>Srv: logEvent(med_missed)
            Srv->>Mac: POST /api/imessage-bridge (medical alert)
            Mac->>Mac: Photon.sendMessage()
        end

        alt Emergency: labels include fall/fire/smoke
            Srv->>Srv: logEvent(emergency_detected)
            Srv->>Mac: POST /api/imessage-bridge (emergency alert)
            Mac->>Mac: Photon.sendMessage()
        end
    end

    loop Every 3s
        Loop->>Loop: tick -- advance perceptionState
        Loop->>Gem: enqueue analyzer calls per domain cadence
        Loop-->>Dash: SSE heartbeat (/api/perception-state?sse=1)
    end

    loop Every 2s
        Dash->>Srv: GET /api/snapshot/latest/grocery
        Dash->>Srv: GET /api/snapshot/latest/medical
        Dash->>Srv: GET /api/snapshot/latest/emergency
        Srv-->>Dash: base64 image + last analysis
    end
```

## Implementation Units

- [ ] **Unit 1: Mock grocery grounding file**

**Goal:** Define the mock expected-inventory grounding the grocery flow compares against.

**Requirements:** R4, R6

**Dependencies:** None

**Files:**
- Create: `data/groceries.json`

**Approach:**
- Schema: `{"items":[{"name":"milk","expected_count":1,"threshold":1,"knot_match_hint":"milk","external_id":null}, {"name":"apple","expected_count":6,"threshold":2,"knot_match_hint":"apple","external_id":null}, ...]}`.
- `threshold` is the "below this count, trigger reorder" value.
- `knot_match_hint` is a loose string used to fuzzy-match an item in the last Knot transaction's product list when `external_id` is not pinned.
- `external_id` is **optional** and initially `null`. After Unit 7 enumerates real Knot merchant products, operators can pin a stable SKU here for reliable matching across future runs. See Unit 6 `groceryMatcher` for matching precedence.
- Start with ~6 items that are plausibly on a shelf for the demo.

**Patterns to follow:**
- Shape of `data/prescriptions.json` (simple JSON array of objects).

**Test scenarios:**
- Test expectation: none — pure config file. Validated by Unit 6 consuming it.

**Verification:** The file parses as JSON; each item has required fields.

---

- [ ] **Unit 2: Replace GPT-4o with Gemini Robotics-ER 1.6 in `vision.ts`**

**Goal:** Swap the per-frame vision backend from OpenAI GPT-4o to Gemini Robotics-ER 1.6, preserving the existing public function signatures and return shapes.

**Requirements:** R2 (supersedes plan 001's GPT-4o decision), R4, R14, R18

**Dependencies:** None

**Files:**
- Modify: `src/lib/vision.ts`
- Modify: `src/lib/prompts.ts` (retune prompts for ER-1.6 output shape)
- Modify: `src/components/CameraFeed.tsx` (set snapshot canvas to 1024px longest-side at JPEG quality 0.8 per the capture-resolution decision below; currently hardcodes 640×480 at 0.7)
- Modify: `aegis/.env.example` (add `GEMINI_API_KEY` and `GEMINI_FALLBACK_MODEL`)
- Modify: `aegis/package.json` (add `@google/genai`; keep `openai` for `generateSummary` only)
- Test: `src/lib/__tests__/vision.test.ts` (new — basic shape assertion with mocked SDK)

**Approach:**
- Add `@google/genai` dependency. Create a client via `new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY})` or equivalent per the SDK.
- Keep the three public exports (`analyzeGrocery`, `analyzeMedical`, `analyzeEmergency`) and return types (`GroceryAnalysis`, `MedicalAnalysis`, `EmergencyAnalysis`) — `analyzeMedical`'s signature changes from `(beforeImage, afterImage)` to `(image, expectedMedication)` (see below); downstream `scheduler.ts#checkMedWindow` and `/api/medical/check` update accordingly. `analyzeGrocery` and `analyzeEmergency` signatures are preserved.
- Internally, each function builds a prompt asking ER-1.6 to return a bbox list with specific labels, then derives the existing return shape:
  - `analyzeGrocery`: ask for all grocery items on the shelf with `{label, box_2d}`. Group by label, compute counts. Produce `low_supply` = any item in `data/groceries.json` where actual count < threshold. Populate `visible_items` from unique labels, `missing_or_low_items` from the delta, `confidence` from the model's confidence field (or average confidence, or heuristic).
  - `analyzeMedical`: **single-frame signature** — `analyzeMedical(image, expectedMedication)`. Ask ER-1.6 to detect pill bottles / blister packs / loose pills at the medicine table in the single frame and report labels. Produce `meds_taken: true` when the expected medication's bottle/pack is **no longer visible** at window-close (interpreted as "the patient picked it up and took it"); `meds_taken: false` when it is still visible (interpreted as "missed"). Populate `changes_detected` with the absent-vs-present delta against the expected medication. This replaces the previous before/after diff, which required a pre-window baseline that the capture gating could not guarantee.
  - `analyzeEmergency`: ask for labels drawn from a fixed vocabulary: `person_on_floor`, `fire`, `smoke`, `person_motionless`, `none`. Produce `emergency`, `type`, `description` accordingly.
- `generateSummary` is unchanged — still uses `openai` + `gpt-4o`.
- Keep model ID in a constant at top of file: `const GEMINI_MODEL = "gemini-robotics-er-1.6-preview"`.
- **Force strict JSON output**: pass `responseMimeType: "application/json"` and a `responseSchema` on every call. Do not rely on prose prompting alone — the preview model is documented to occasionally wrap responses in markdown fences or prose preamble.
- **Tolerant parser**: wrap `JSON.parse` in a helper that (a) strips ```json ... ``` fences, (b) extracts the outermost balanced `{...}` if prose prefix/suffix leaks through, (c) returns neutral defaults on final failure. Log and count parse failures — if frequency grows, escalate via the fallback model path below.
- **Capture resolution**: standardize on **1024px longest-side JPEG at quality ~80** (~150-250 KB). Document this in `CameraFeed.tsx`'s snapshot step. Sub-1024 frames hurt small-object detection (pills, labels); oversize inflates tokens and latency.
- **Same-family fallback**: `gemini-2.5-pro` is the primary fallback (same SDK, same prompt shape, same normalized 0-1000 coords). `GEMINI_FALLBACK_MODEL` is an env var that holds the **model ID string** to swap in on primary failure (e.g. `GEMINI_FALLBACK_MODEL=gemini-2.5-pro`); empty means no fallback. GPT-4o is a tertiary fallback only (different SDK, different coordinate convention, higher switch cost). **Before trusting the fallback, run a one-shot parity check** (send the same prompt + test image to both models; confirm `box_2d` emits at 0-1000 normalized scale from `gemini-2.5-pro`); record the result in the test fixture. If parity fails, demote to log-only.
- Parse failures (malformed JSON, API errors, fallback exhausted) return the same empty/neutral objects the current code returns. Do not throw.

**Execution note:** Characterization-first — before editing, capture the current GPT-4o call shape and output structure in a small test fixture, then replace. The goal is that downstream check routes see an identical contract.

**Patterns to follow:**
- Existing `callVision()` helper structure in `src/lib/vision.ts` — keep a private helper that centralizes the Gemini call.
- JSON-output-mode pattern: the prompt should end with an explicit "Return only valid JSON matching this schema: { ... }" clause.

**Test scenarios:**
- Happy path: `analyzeGrocery` called with a known test image (mocked SDK response) returns `low_supply:true` when an expected item has zero bboxes.
- Happy path: `analyzeEmergency` returns `{emergency:true, type:"fall"}` when SDK response contains `person_on_floor`.
- Happy path: `analyzeMedical(frame, "Metformin 500mg")` returns `{meds_taken:true}` when the frame's bbox list does NOT include a Metformin bottle label; returns `{meds_taken:false}` when it does.
- Edge case: SDK returns malformed JSON — function returns the existing neutral defaults without throwing.
- Edge case: SDK throws (network, auth) — function returns neutral defaults and logs.
- Edge case: `GEMINI_API_KEY` missing — function returns neutral defaults and logs once (no per-call spam).

**Verification:** All three check routes (`/api/grocery/check`, `/api/medical/check`, `/api/emergency/check`) work end-to-end with real image POSTs without code changes to the routes themselves. `generateSummary` still works.

---

- [ ] **Unit 2a: Perception loop — always-on supervisor + consolidated state**

**Goal:** Add a 3s heartbeat loop that ticks independently of the 30s scheduler, owns a single typed `perceptionState` object consolidating scattered `globalThis.*` flags, and exposes a JSON + SSE endpoint so the dashboard can render a live heartbeat. This delivers the "always-on feel" and an explicit state space that the downstream grocery/medical/emergency units consume.

**Requirements:** R2, R3, R17 (always-on live perception); supports R4, R14, R18 by consolidating state the downstream units read

**Dependencies:** Unit 2 (the loop invokes `lib/vision.ts` exports directly)

**Files:**
- Create: `src/lib/perception-loop.ts` (~100-150 lines)
- Create: `src/app/api/perception-state/route.ts` (JSON GET, optional `?sse=1` streaming)
- Modify: `src/lib/scheduler.ts` (replace direct `globalThis.watchingMed` reads with `setActiveMedWindow` / `getPerceptionState().medical.activeWindow`; call `startPerceptionLoop()` from `startScheduler()`; `checkMedWindow` fires the single-frame medical analysis by reading `perceptionState.medical.lastFrameAt` instead of a before/after pair)
- Modify: `src/app/api/snapshot/route.ts` (remove server-side throttles `EMERGENCY_ANALYZE_INTERVAL_MS` / `GROCERY_ANALYZE_INTERVAL_MS` and their `globalThis.emergencyLastAnalyzedAt` / `globalThis.groceryLastAnalyzedAt` guards — these move into `perceptionState`; keep `snapshotStore` as the image-bytes store and write `{image, capturedAt}` on each POST, plus update `perceptionState[domain].lastFrameAt`)

**Approach:**
- Typed state shape:
  ```ts
  interface PerceptionState {
    meta: { startedAt: number; lastTickAt: number; tickCount: number };
    emergency: { lastFrameAt: number | null; lastAnalyzedAt: number | null; lastResult: EmergencyAnalysis | null };
    medical:   { lastFrameAt: number | null; activeWindow: { medication: string; triggeredAt: number } | null; lastResult: MedicalAnalysis | null };
    grocery:   { lastFrameAt: number | null; lastAnalyzedAt: number | null; lastResult: GroceryAnalysis | null };
  }
  ```
- `setInterval(tick, 3000)` with `.unref()` following `src/lib/scheduler.ts:198-204`.
- Idempotent `startPerceptionLoop()` guarded by `typeof globalThis.perceptionLoopStarted === "undefined"` (the `src/lib/scheduler.ts:18-28` pattern).
- Each tick: (i) advance `meta.lastTickAt` + `tickCount`, (ii) check per-domain cadence thresholds (emergency 3s, grocery 60s, medical only when `activeWindow` has just closed), (iii) *enqueue* analyzer calls via `lib/vision.ts` exports without blocking the tick itself — analyzer calls are `void`-awaited.
- Exports: `startPerceptionLoop()`, `getPerceptionState()`, `setActiveMedWindow(medication, triggeredAt)`, `clearActiveMedWindow()`.
- Medical single-frame analysis fires exactly once per `activeWindow` close (replacing the prior before/after diffing in `checkMedWindow`). The loop reads `perceptionState.medical.lastFrameAt` (latest captured frame referenced from `snapshotStore`) and passes it to `analyzeMedical(image, expectedMedication)`.
- `/api/perception-state`:
  - `GET` returns `getPerceptionState()` as JSON for dashboard polling.
  - `GET ?sse=1` streams ticks using the `/api/medical/tts-stream` event-source shape so the dashboard renders a live heartbeat without polling.
- `snapshotStore` continues to own image bytes; `perceptionState` only holds timestamps + analysis-result references.
- The perception loop and the 30s scheduler tick coexist: scheduler owns prescription-time reminder firing, perception loop owns per-frame/analysis cadence.

**Execution note:** Characterization-first — before modifying `scheduler.ts#checkMedWindow`, capture its current before/after-diff behavior in a small test fixture, then replace with the single-frame flow driven by `perceptionState.medical.activeWindow`.

**Patterns to follow:**
- `src/lib/scheduler.ts:18-28` — `typeof globalThis.X === "undefined"` idempotent-init guard. Use verbatim for `perceptionLoopStarted` and `perceptionState`.
- `src/lib/scheduler.ts:198-204` — `setInterval` + `.unref()` pattern so the loop does not keep the process alive on shutdown.
- `src/app/api/medical/tts-stream` (referenced from `src/app/camera/[domain]/page.tsx:39-53`) — SSE precedent; `/api/perception-state?sse=1` reuses this event-source shape.
- `src/lib/vision.ts` exports from Unit 2 (`analyzeEmergency`, `analyzeMedical(image, expectedMedication)`, `analyzeGrocery`) — the tick calls these directly, no new adapter layer.

**Test scenarios:**
- Happy path: `startPerceptionLoop()` called twice → second call is a no-op (`perceptionLoopStarted` guard).
- Happy path: After a `POST /api/snapshot` for `emergency`, `getPerceptionState().emergency.lastFrameAt` is set within ~1 tick (≤3s).
- Happy path: Medical single-frame analysis fires exactly once per `activeWindow` close, and `activeWindow` returns to `null` afterward.
- Happy path: `GET /api/perception-state` returns a JSON body where `meta.tickCount` increments across two sequential requests 4s apart.
- Integration: Dashboard subscribed to `/api/perception-state?sse=1` receives ticks continuously; refresh rate matches the 3s heartbeat.
- Edge case: Dev server restarts cleanly — no stuck intervals (validates `.unref()` + idempotent guard).

**Verification:**
1. `npm run dev` — log `[AEGIS] Perception loop started` appears exactly once.
2. Open `/camera/grocery`, `/camera/medical`, `/camera/emergency` and let them run 60s.
3. `curl http://localhost:3000/api/perception-state | jq` twice, 4s apart → `meta.tickCount` increments, all three domains show non-null `lastFrameAt`.
4. Trigger a med reminder → `perceptionState.medical.activeWindow` populates; at window-close a single `analyzeMedical` log line fires (not two).
5. Dashboard tile shows "last tick N s ago" updating via SSE.
6. `grep -rn "globalThis\." src/` — only remaining matches are scheduler guards (`schedulerStarted`, `dailySummaryTriggeredDate`, `medRemindersTriggeredToday`), the new `perceptionLoopStarted` + `perceptionState`, `snapshotStore`, and the grocery dedup `groceryReorderLastAt` (Unit 6). No stray `emergencyLastAnalyzedAt` / `groceryLastAnalyzedAt` / `watchingMed` leftovers.

---

- [ ] **Unit 3: Retune per-domain capture intervals**

**Goal:** Update the camera page's per-domain sampling intervals to match the new smart-sampling decision, and make medical capture window-driven.

**Requirements:** R2, R3, R17

**Dependencies:** Unit 2 (so the new intervals actually hit Gemini, not GPT-4o), Unit 2a (perception loop owns the gating flag for medical capture and the consolidated cadence state)

**Files:**
- Modify: `src/app/camera/[domain]/page.tsx` (adjust `INTERVALS` constant; subscribe to perception-state SSE for medical gating)
- Modify: `src/components/CameraFeed.tsx` if it owns interval logic
- Modify: `src/lib/scheduler.ts` coordinates medical windowing with Unit 2a via `setActiveMedWindow` / `clearActiveMedWindow`

**Approach:**
- Set `INTERVALS = { grocery: 60 * 1000, medical: 10 * 1000, emergency: 3 * 1000 }` in the camera page.
- For medical, derive the gating flag from `perceptionState.medical.activeWindow` (set by `scheduler.ts`'s `fireReminder` via `setActiveMedWindow`, cleared at window-close). The camera page subscribes to `/api/perception-state?sse=1` (Unit 2a) to flip capture on/off. Simpler fallback: capture every 10s but skip server-side analysis in `/api/medical/check` when `activeWindow` is null.
- Update the displayed "Next analysis in X min" copy in the camera UI to reflect the new cadence (seconds not minutes).

**Patterns to follow:**
- The existing `INTERVALS` constant in `src/app/camera/[domain]/page.tsx`.
- `perceptionState.medical.activeWindow` (Unit 2a) replaces the prior `globalThis.watchingMed` flag; it is the single source of truth for whether medical capture/analysis should run.

**Test scenarios:**
- Happy path: `/camera/emergency` POSTs a snapshot ~every 3s.
- Happy path: `/camera/grocery` POSTs a snapshot ~every 60s.
- Happy path: `/camera/medical` POSTs during an active med window, not outside it.
- Edge case: User reloads the camera page mid-window — capture resumes immediately.

**Verification:** Network tab on each camera device shows POSTs at the expected cadence. Scheduler logs confirm medical gating.

---

- [ ] **Unit 4: Patient onboarding — "Which camera is this?" picker**

**Goal:** Extend the patient onboarding page so a device can be assigned to one of three camera roles, then be routed to the matching camera URL.

**Requirements:** R1 (multi-device plumbing)

**Dependencies:** None (`/onboarding/patient` already exists per plan 002 Unit 11)

**Files:**
- Modify: `src/app/onboarding/patient/page.tsx`

**Approach:**
- After the existing "name" input step, add a second step: three tiles (Grocery Shelf / Medicine Table / Living Area) with domain-color borders matching `--grocery/--medical/--emergency`.
- On selection, write `localStorage.setItem("aegis_camera_role", role)` and `router.push(`/camera/${role}`)`.
- If localStorage already has `aegis_camera_role` on page load, skip the picker and route straight to `/camera/[role]`. This makes "reload survives" the default behavior.
- Add a small "Change camera role" link on the camera page footer that clears localStorage and routes back to `/onboarding/patient`.

**Patterns to follow:**
- localStorage-based role pattern from plan 002 Unit 3 (`aegis_role` for caretaker vs patient).
- Tailwind domain-color usage in the existing dashboard (`--grocery`, `--medical`, `--emergency` CSS variables).

**Test scenarios:**
- Happy path: New browser tab → `/onboarding/patient` → enters name → sees 3 camera picker tiles → clicks "Medicine Table" → lands on `/camera/medical`.
- Happy path: Same device reloads → automatically lands on `/camera/medical` (picker skipped).
- Happy path: Three different browser tabs pick three different roles → each lands on its distinct `/camera/*` page; each POSTs snapshots tagged with its domain.
- Edge case: localStorage disabled (incognito with storage blocked) → picker falls through to a session-scoped state; documented in the alert banner.
- Edge case: User clicks "Change camera role" → localStorage cleared, back at picker.

**Verification:** Three phones/tabs on three distinct domains successfully POST to `/api/snapshot` concurrently for 60+ seconds without cross-contamination.

---

- [ ] **Unit 5: Live caretaker dashboard — three streaming tiles**

**Goal:** The dashboard shows three live camera tiles polling the latest snapshot per domain at 2s cadence, overlaying the latest analysis status per tile.

**Requirements:** R1 (display), origin success criterion "judges can see all three video feeds"

**Dependencies:** Unit 2 (analysis returns new shape), Unit 2a (dashboard heartbeat + consolidated perception state for tile overlays), Unit 3 (captures happen), Unit 4 (three devices actually posting)

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/CameraPreview.tsx`

**Approach:**
- Dashboard renders three `CameraPreview` components, one per domain.
- Each `CameraPreview` polls `GET /api/snapshot/latest/[domain]` every 2s and renders the returned base64 as an `<img>`.
- Overlay per tile: domain-colored dot, domain name, last-capture timestamp, latest analysis summary string (e.g. "Low: milk, bread" / "All clear" / "Missed at 12:04").
- If a tile hasn't received a snapshot in >30s, show "Camera offline" state (muted).
- Use `--grocery/--medical/--emergency` border colors consistent with plan 002 design tokens.
- The analysis summary comes from the most recent event for that domain (use existing `GET /api/events?domain=X&limit=1`) OR extend `/api/snapshot/latest/[domain]` to include the last analysis result. Either is acceptable; prefer the latter to avoid an extra request.

**Patterns to follow:**
- Existing polling pattern in plan 002 Unit 5 description.
- Existing `CameraPreview.tsx` component structure.

**Test scenarios:**
- Happy path: Open `/dashboard` while three cameras are posting — three tiles update with fresh frames within 2s each.
- Happy path: One camera goes offline → its tile flips to "Camera offline" after 30s (this threshold is defined by Unit 5; Unit 9 rehearsal should confirm the 30s flip occurs on "Unplug one camera" failure-mode test).
- Happy path: Emergency camera detects a fall → emergency tile's overlay flips to the alert state and background tint changes.
- Edge case: Dashboard opens before any camera has posted → all three tiles show "Waiting for feed..." placeholder.
- Edge case: Two dashboard tabs open simultaneously — both update independently without 429-ing the snapshot endpoint.

**Verification:** With three devices POSTing and dashboard open, judges see three smoothly-refreshing tiles with analysis overlays. No more than 2s delay from capture to tile update.

---

- [ ] **Unit 6: Grocery auto-reorder pipeline with mock grounding**

**Goal:** Wire the full grocery flow end-to-end: Gemini analysis → compare vs `data/groceries.json` → find delta items in last Knot order → Knot `syncCart` → `checkout` → log + (optional) iMessage notice.

**Requirements:** R4, R5, R6, R7, R11, R12

**Dependencies:** Unit 1 (grounding file), Unit 2 (Gemini vision), Unit 2a (perception state for grocery cadence tracking + observability), Unit 7 (pre-linked merchant)

**Files:**
- Modify: `src/app/api/grocery/check/route.ts`
- Modify: `src/app/api/grocery/checkout/route.ts`
- Create: `src/lib/groceryMatcher.ts` (fuzzy match Gemini labels × grounding items × Knot last-order products)

**Approach:**
- `/api/grocery/check` flow:
  1. Receive snapshot → call `analyzeGrocery`.
  2. Read `data/groceries.json`.
  3. For each grounding item, compare `expected_count` vs observed count for that label. Any item with `observed < threshold` is "low".
  4. If any low: call `getAllTransactions(merchantId)` on Knot (existing function in `src/lib/knot.ts`). `merchantId` comes from `process.env.KNOT_MERCHANT_ID` — the pre-linked merchant from Unit 7. **Remove** the current regex-based merchant selection in `/api/grocery/check/route.ts` (`/walmart|target|costco|amazon|doordash|whole foods/i`) and the `globalThis.currentGroceryMerchantId` cache; the env var is now the single source of truth.
  5. Take the most recent transaction. For each low grounding item, fuzzy-match its `knot_match_hint` against `transaction.products[*].name`. Record hits with `external_id` and `quantity`.
  6. If hits ≥ 1: form a cart array `[{external_id, quantity}, ...]`.
  7. Log event `grocery_low_detected` with the cart preview, then call `syncCart(merchantId, cart)` and `checkout(merchantId)`.
  8. Log `grocery_reorder_placed` with the Knot response's order details.
  9. Optionally fire `sendGroceryMessage(...)` — already no-ops gracefully on non-Mac.
- `groceryMatcher.ts` contains pure functions:
  - `findLowItems(analysis, grounding) -> LowItem[]`
  - `matchToLastOrder(lowItems, transactions) -> CartItem[]`
  - Unit-testable, no network.
- The pipeline is fully synchronous within the check route. No HITL step for demo (user acknowledged no auth/no caretaker approval). Document this simplification explicitly.
- **Duplicate suppression** (follow repo pattern): use `globalThis.groceryReorderLastAt: Map<string, number>` keyed by matched `external_id` (or normalized hint when `external_id` is absent). Initialize with the `typeof globalThis.X === "undefined"` guard pattern established in `src/lib/scheduler.ts` lines 18-28 (`schedulerStarted`, `watchingMed`, `dailySummaryTriggeredDate`, `medRemindersTriggeredToday`). If `Date.now() - lastAt < 10 * 60 * 1000`: **skip the Knot `syncCart`+`checkout` calls only**; still run vision analysis and still log a `grocery_low_detected_suppressed` event so the suppression is observable on the dashboard. **Do not** use `getEventsForDate` for hot-path dedup — it's a disk read and the wrong pattern for this.
- **Matching precedence inside `groceryMatcher.ts`**:
  1. If the grocery grounding item has a non-null `external_id` AND a Knot transaction product has a matching `external_id`, match by exact equality. This is stable across product renames.
  2. Otherwise, normalize both sides (lowercase, strip punctuation, collapse whitespace) and match if `normalizedProductName.includes(normalizedHint)` OR `normalizedProductBrand.includes(normalizedHint)`. The `brand?` field on `KnotTransaction.products[]` is useful — e.g., hint `"organic valley"` hits brand, `"whole milk"` hits name.
  3. When an item falls through without a match, emit `grocery_low_unmatched` so operators can pin its `external_id` in `data/groceries.json` — the canonical source for candidate `external_id` values is `data/knot-merchants.json` (merchant metadata) plus the sample-transaction product dump Unit 7 prints to console; operators copy SKU IDs from either into `data/groceries.json`.

**Patterns to follow:**
- Existing Knot client functions in `src/lib/knot.ts` (no changes to `knot.ts` itself). `KnotTransaction.products[]` shape (`{name, brand?, quantity?, price?, external_id?}`) is defined at `src/lib/knot.ts:47-60`.
- Existing event logging pattern from `src/lib/events.ts`.
- Dedup pattern from `src/lib/scheduler.ts:18-28` (`globalThis.*` with `typeof === "undefined"` guards).

**Test scenarios:**
- Happy path: Snapshot shows milk=0 apple=2 (grounding says milk threshold=1 apple threshold=2) → milk is low → matched to last order's "Organic Milk" → cart `[{external_id:"...", qty:1}]` → Knot responds 200 → `grocery_reorder_placed` logged with order ID.
- Happy path: Everything stocked → no event logged, no Knot call.
- Edge case: Low item has no match in any past order — event `grocery_low_unmatched` logged, no checkout.
- Edge case: Knot `syncCart` returns an error — event `grocery_reorder_failed` logged, no `checkout` call.
- Edge case: Two "low" events within 10min — second is suppressed.
- Integration (cross-module): The check route integrates Gemini (Unit 2) + grounding (Unit 1) + Knot (`knot.ts`) + events (`events.ts`). Test with a recorded snapshot that is known to be "low" and a pre-recorded Knot dev response.

**Verification:** With one pre-linked dev merchant and a deliberately-empty shelf snapshot, the full flow triggers and the Knot dev dashboard shows a placed order.

---

- [ ] **Unit 7: Pre-link a Knot dev merchant for demo**

**Goal:** Enable fully backend-only Knot checkout during the demo by pre-linking a dev-mode merchant account, so Unit 6 needs no user interaction.

**Requirements:** R7, R11 (operational prerequisite)

**Dependencies:** Knot dev credentials in `.env.local`

**Files:**
- Create: `aegis/scripts/prelink-knot.mjs` (native Node ESM script, no new dependencies)
- Create: `aegis/data/knot-merchants.json` (enumeration output — canonical reference for operators pinning `external_id` values in `data/groceries.json`)
- Modify: `aegis/package.json` (add `"prelink:knot": "node scripts/prelink-knot.mjs"` under `scripts`)
- Modify: `aegis/.env.example` (add `KNOT_MERCHANT_ID` with comment; also ensure `KNOT_CLIENT_ID`, `KNOT_SECRET`, `KNOT_BASE_URL`, `KNOT_EXTERNAL_USER_ID` are documented — the prelink script reads all of these for its basic-auth call against the Knot dev environment)

**Approach:**
- Script steps (runs via `npm run prelink:knot`):
  1. Call `GET https://development.knotapi.com/merchants?type=shopping` with basic auth. Write the result to `aegis/data/knot-merchants.json` and print a numbered list.
  2. Prompt for a merchant ID (or take it as a CLI arg: `npm run prelink:knot -- --merchant=84`).
  3. Call the dev-mode `Link Account` endpoint (per Knot dev docs) with the hardcoded `KNOT_EXTERNAL_USER_ID` from env. Print the response.
  4. Immediately call `syncTransactions(merchantId)` to confirm the link has transactions available for Unit 6's "last order" lookup. Write a sample transaction's product list to console so operators can copy `external_id` values into `data/groceries.json`.
- Save the chosen merchant ID to `KNOT_MERCHANT_ID` in `.env.local` (instruct the user; don't auto-write).
- The Unit 6 check route reads `process.env.KNOT_MERCHANT_ID` (new env var) for its Knot calls.
- **If enumeration surfaces unexpected merchants or product shapes**, append a dated bullet under the plan's `Open Questions → Deferred to Implementation` section in a follow-up commit — not as part of Unit 7's acceptance. `data/knot-merchants.json` is the durable source of truth; the plan document does not need to mirror it.

**Patterns to follow:**
- Existing `src/lib/knot.ts` calling conventions for basic auth (`Authorization: Basic base64(client_id:secret)`).
- Native Node ESM (`.mjs`): `import { readFile, writeFile } from "node:fs/promises"`, top-level `await`, `process.argv` parsing. No `tsx`/`ts-node` dependency — none is in `aegis/package.json` today.
- The script calls Knot directly via `fetch` rather than importing `src/lib/knot.ts` (avoids needing a TS runner for a one-shot utility).

**Test scenarios:**
- Happy path: Script runs → lists ≥1 merchant → user picks one → link succeeds → test `syncTransactions` returns ≥1 past transaction.
- Error path: `KNOT_CLIENT_ID`/`KNOT_SECRET` missing → script exits with clear message.
- Error path: No merchants of type `shopping` in dev → script reports this explicitly (handle the case where the hackathon sponsor hasn't whitelisted the org yet).

**Verification:** `.env.local` contains `KNOT_MERCHANT_ID=<valid-id>`, and `src/lib/knot.ts`'s `syncTransactions` returns past orders for that merchant.

---

- [ ] **Unit 8: Dual-EC2 public hosting (Linux app + macOS Photon bridge) with ngrok dev fallback**

**Goal:** Deploy the demo to two AWS EC2 instances — Linux for the Next.js app, macOS for the Photon iMessage bridge — so three phones on public networks can reach the Next.js app over HTTPS, camera access works (HTTPS requirement of `getUserMedia`), and iMessage alerts fire through a stable Mac host rather than a teammate's laptop. Retain ngrok as a dev-iteration fallback.

**Requirements:** R1 (multi-device reach), R19 (emergency alerting via iMessage), R21 (daily summary iMessage), origin success criterion "judges can see"

**Dependencies:** Unit 4 (multi-device code), Unit 5 (dashboard), Unit 2a (perception loop — runs on the Linux host as part of the Next.js app lifecycle)

**Files:**
- Create: `scripts/dev-tunnel.sh` and/or `scripts/dev-tunnel.cmd` (thin wrapper — ngrok fallback only)
- Create: `deploy/linux-ec2.md` (runbook: AMI choice, Node 24 install, `pm2`/`systemd` unit, Caddy/Let's Encrypt HTTPS, env var layout)
- Create: `deploy/macos-ec2.md` (runbook: Mac1/Mac2 EC2 choice, Photon install, bridge-server setup, inbound HTTPS from Linux EC2, iMessage permissions)
- Create: `aegis/src/app/api/imessage-bridge/route.ts` (HTTPS endpoint on the macOS host that receives `{chatId, text}` and calls Photon directly — only wired when running on macOS)
- Modify: `aegis/src/lib/imessage.ts` (on Linux: becomes an HTTPS client that POSTs to `process.env.IMESSAGE_BRIDGE_URL`; on macOS: keeps calling Photon in-process; on other OSes: no-ops as before)
- Modify: `aegis/README.md` with a "Run the demo" section (this is the one exception to the no-README-edit default — README is already a create-next-app placeholder)
- Modify: `aegis/.env.example` (add `IMESSAGE_BRIDGE_URL`, `IMESSAGE_BRIDGE_TOKEN`, `AEGIS_PUBLIC_URL`)

**Approach:**
- **Linux EC2 (app host):** t3.medium or larger, Amazon Linux / Ubuntu 22.04, Node 24 via `nvm`. Next.js runs under `pm2` or `systemd`. Caddy (recommended) terminates TLS using Let's Encrypt against a subdomain pointed at the instance's Elastic IP. All stateful pieces live here: `scheduler.ts` intervals, `globalThis.snapshotStore`, `globalThis.perceptionState` (Unit 2a), `data/events.json` / `data/groceries.json` / `data/prescriptions.json` disk writes, Knot integration.
- **macOS EC2 (Photon bridge):** AWS `mac1.metal` or `mac2.metal` (or equivalently a Mac mini reachable over the internet if the team already has one racked — the code path is identical). Runs a tiny HTTPS service (can be the same Next.js codebase, but only the `/api/imessage-bridge` route is exposed; the rest of the app idles) that accepts `POST {chatId, text}` requests authenticated with `IMESSAGE_BRIDGE_TOKEN` and invokes Photon's `sendMessage`. iMessage must be signed in as the demo account and Full Disk Access granted.
- **Bridge client in `imessage.ts`:** existing `sendGroceryMessage` / `sendMedicalAlert` / `sendEmergencyAlert` / `sendDailySummary` / `setGroceryReplyHandler` keep their signatures. Under the hood: if `process.platform === "darwin"` AND Photon is initialized → call Photon directly (pre-existing code path, used by the macOS bridge itself). Otherwise if `IMESSAGE_BRIDGE_URL` is set → `fetch(bridge, {method:"POST", headers:{Authorization:\`Bearer ${token}\`}, body: JSON.stringify({chatId, text})})`. Otherwise → log + no-op (preserves current cross-platform dev ergonomics).
- **Reply handler caveat:** `setGroceryReplyHandler` (used by `scheduler.ts`:186 to react to caretaker SMS responses) only fires on the host actually running Photon. In the dual-EC2 topology, the macOS host must itself run the full Next.js app (or the bridge must publish reply events back to Linux via a webhook/polling channel). Document the simplest path: run Next.js on the macOS host too, but expose only `/api/imessage-bridge` externally; the reply handler calls back into the Linux host's `/api/grocery/cart` via `AEGIS_ORIGIN`.
- **ngrok fallback (dev only):** `dev-tunnel` script starts `npm run dev` + `ngrok http 3000` locally for rapid iteration before the EC2 hosts are provisioned, or for feature work on a laptop. Documented as dev-only — the demo runs from the EC2 pair.
- **HTTPS requirement:** `getUserMedia` mandates HTTPS on non-localhost. Caddy on Linux EC2 handles Let's Encrypt; the bridge uses a self-signed cert or a second Let's Encrypt record; ngrok serves HTTPS automatically.
- `AEGIS_ORIGIN` env var on the Linux host points at its own public URL so `scheduler.ts`'s `fetch(${origin}/api/medical/remind)` resolves. The scheduler may still use `http://localhost:3000` for intra-process calls — those remain localhost-only.

**Patterns to follow:**
- Existing scripts in `aegis/package.json`.
- AGENTS.md guidance — consult `aegis/node_modules/next/dist/docs/` before touching Next.js config for deployment.
- Existing `imessage.ts` graceful-no-op pattern — preserve it as the third code path when neither Photon nor bridge URL is available.

**Test scenarios:**
- Happy path: Linux EC2 serves HTTPS at its public hostname → three phones on different networks complete patient onboarding with distinct roles → snapshots appear on the caretaker dashboard within 5s.
- Happy path: Trigger a test iMessage via the scheduler's demo control on Linux → request hits the macOS bridge → Photon sends the message → caretaker's phone receives it.
- Happy path: Run `scripts/dev-tunnel` locally on a laptop → ngrok URL printed → smoke test passes end-to-end before EC2 is provisioned.
- Edge case: macOS bridge unreachable (bridge host down) → `imessage.ts` logs the failure and does NOT throw; vision pipeline continues unaffected.
- Edge case: Linux host restarts mid-demo → `pm2` / `systemd` relaunches the process; perception loop + scheduler re-initialize cleanly; in-memory state (`snapshotStore`, `perceptionState`) is lost but rebuilds within one cadence cycle.
- Edge case: `IMESSAGE_BRIDGE_URL` unset on the Linux host → `imessage.ts` falls through to the existing no-op path; non-iMessage features stay functional.

**Verification:** A teammate on a different network opens the Linux EC2 public URL on their phone, picks a camera role, snapshots show up on the caretaker dashboard within 5s, and a scripted test alert lands in the caretaker's iMessage thread via the macOS bridge.

---

- [ ] **Unit 9: Demo rehearsal and hardening**

**Goal:** End-to-end rehearsal of the 3-minute demo script. Catch cross-unit integration issues, add fallbacks.

**Requirements:** All success criteria

**Dependencies:** All prior units

**Files:** Any file as needed for bug fixes

**Approach:**
- Run the full demo 3 times against the Linux EC2 public URL (ngrok only if EC2 is unavailable):
  1. Open the Linux EC2 URL on 3 phones → each picks a camera role → each lands on its `/camera/*` page with live feed.
  2. Caretaker opens `/dashboard` on a laptop → sees 3 live tiles updating every 2s, plus the perception-loop heartbeat (Unit 2a) showing "last tick N s ago".
  3. Deliberately deplete a grocery item in front of the grocery cam → within 60s, grocery reorder fires → Knot dashboard shows the order → caretaker dashboard overlay reflects it.
  4. Miss a scheduled medication window → after window expires, single-frame medical analysis runs once, `med_missed` event shows on dashboard, iMessage alert dispatches via the macOS bridge.
  5. Simulate a fall in front of emergency cam → within 3-6s, emergency alert event shows on dashboard and iMessage alert dispatches via the macOS bridge.
- Add dashboard-level fallback triggers (a hidden "simulate grocery low" / "simulate emergency" button) so the demo never has to rely on Gemini cooperating on stage. These are OK to keep in production for this hackathon build — they're clearly labeled dev controls.
- Test failure modes:
  - Unplug one camera mid-demo — dashboard tile goes "offline", others keep working.
  - macOS bridge host unreachable mid-demo — iMessage path logs + no-ops; vision + dashboard keep running.
  - Linux host process restart — `pm2`/`systemd` respawns, perception loop re-initializes within one 3s tick, snapshots resume.

**Test expectation:** none — manual integration rehearsal

**Verification:** The full 3-minute demo runs end-to-end three consecutive times without intervention.

## System-Wide Impact

- **Interaction graph:**
  - Camera pages (N devices) → `POST /api/snapshot` → domain check route → `src/lib/vision.ts` (now Gemini) → `src/lib/knot.ts` (for grocery) → `src/lib/events.ts` → `src/lib/imessage.ts` (HTTPS client on Linux → macOS bridge; direct Photon on the Mac host; no-op elsewhere).
  - Caretaker dashboard → `GET /api/snapshot/latest/[domain]` + `GET /api/events` (polling every 2s) + `GET /api/perception-state?sse=1` (live heartbeat from Unit 2a).
  - Perception loop (`src/lib/perception-loop.ts`, Unit 2a) ticks every 3s, owns `globalThis.perceptionState`, and coordinates per-domain analyzer calls.
  - Scheduler (`src/lib/scheduler.ts`) continues to drive med reminders independently at 30s cadence; medical capture + analysis is gated by `perceptionState.medical.activeWindow` (Unit 2a).
- **Error propagation:**
  - Gemini API failures return neutral analysis objects — no false alerts. `confidence < 0.7` gate stays in the existing code path (plan 001 Unit 6).
  - Knot API failures log `grocery_reorder_failed` and do NOT retry in the same cycle.
  - Duplicate suppression (10min) prevents event storms if Gemini flips low/not-low frame to frame.
- **State lifecycle risks:**
  - `data/events.json` grows unbounded — fine for a 24h demo, clean up before each rehearsal.
  - `globalThis.snapshotStore` (image bytes) and `globalThis.perceptionState` (timestamps + last-analysis references, Unit 2a) are per-process memory on the Linux EC2 host — restart = lose state — acceptable. `perceptionState` references image bytes in `snapshotStore` rather than owning them.
  - localStorage on a patient device persists `aegis_camera_role` across reloads — intentional. Clearing browser storage resets the device.
- **API surface parity:** None of `/api/snapshot`, `/api/snapshot/latest/[domain]`, `/api/events`, `/api/grocery/*` signatures change. The vision.ts public signature does not change. Downstream code is unaware of the Gemini swap.
- **Integration coverage:** Unit 6 is the critical integration seam (Gemini × grounding × Knot × events). Unit 9 rehearsal is the primary verification.
- **Unchanged invariants:**
  - Elder-facing interface is unchanged (camera pages + optional med TTS).
  - iMessage contracts and chat routing unchanged.
  - The `CameraFeed.tsx` getUserMedia capture pattern unchanged.
  - Daily summary path unchanged (still GPT-4o text-in-text-out).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `gemini-robotics-er-1.6-preview` rate limits are not publicly documented; free-tier RPD (~250/day for preview models) would be exhausted within minutes at the plan's ~25-33 RPM smart-sampling rate. | Verify the demo account's actual RPM/TPM/RPD in the AI Studio dashboard ≥24h pre-demo. Ensure billing is on Tier 1 paid. Pre-warm a second keyed project as spillover. Cap client-side RPM per camera stream as a safety net. |
| Model is explicitly flagged preview by Google: *"APIs and capabilities may change, and it may not be suitable for production-critical applications without thorough testing."* Endpoint, schema, or model ID could change without notice. | Pin `@google/genai` SDK version in `package.json`. Record a canned response fixture for offline demo fallback. Monitor the Gemini changelog the week of the demo. Keep `gemini-2.5-pro` wired as a same-family fallback (see Unit 2 `GEMINI_FALLBACK_MODEL`). |
| Structured JSON output is not guaranteed strict for the preview model — responses may wrap in markdown fences or prose preamble, breaking Unit 2's parser. | Always set `responseMimeType: "application/json"` + `responseSchema` on every call (Unit 2). Wrap parsing in a tolerant extractor that strips ```json fences and finds the outermost balanced `{...}`. Log parse-failure count as a demo health metric. |
| Camera capture resolution is unspecified → oversized frames inflate token cost and latency; undersized frames hurt small-object (pill bottles, label text) detection. | Standardize on **1024px longest-side JPEG at quality ~80** (~150-250 KB). Document in `CameraFeed.tsx` and Unit 2. A/B against 768px for latency if 1024 hits rate limits. |
| No same-family fallback is named → if Gemini ER-1.6 is down mid-demo, swapping to GPT-4o requires a different SDK, prompt format, and coordinate convention. | `gemini-2.5-pro` is the primary fallback (same SDK, same prompt, same 0-1000 normalized coords). GPT-4o remains tertiary only. Controlled via `GEMINI_FALLBACK_MODEL` env var. |
| Gemini ER-1.6 may miscount small/occluded items on a real shelf | Dashboard includes simulate-low dev button (Unit 9). Start with 3-4 very distinct items on the demo shelf, not a cluttered pantry. 1024px capture (above) helps. |
| Knot dev mode may lack a linkable merchant during the hackathon | Unit 7 script enumerates merchants first and writes `data/knot-merchants.json` for reference. If none available, degrade grocery flow to "log what would have been ordered" and show the delta on dashboard — still demo-worthy. |
| ngrok free-tier URL rotates on restart (fallback path only) | Not the demo path — demo runs from Linux EC2 with a stable DNS name + Caddy TLS. ngrok is only for laptop iteration before EC2 is provisioned. |
| macOS EC2 (`mac1.metal` / `mac2.metal`) has a 24-hour minimum allocation and limited regional availability | Provision the Mac host ≥48h before the demo; confirm region availability in advance. If blocked, fall back to a team-member's Mac mini exposed via Tailscale or a reserved ngrok subdomain; the `imessage.ts` bridge-client code path is identical. |
| Photon bridge unreachable during a live alert | `imessage.ts` logs and no-ops on bridge failure rather than throwing — vision pipeline continues unaffected; dashboard still shows the event row. Caretaker alerting is degraded but demo does not crash. |
| Perception loop (`src/lib/perception-loop.ts`, Unit 2a) runs as an in-process `setInterval` on the Linux host | Validated by Unit 2a's restart test (`.unref()` + idempotent guard). If the process crashes, `pm2`/`systemd` respawns; in-memory state rebuilds within one 3s tick. Not deployable to Vercel — already out of scope per Key Technical Decisions. |
| `getUserMedia` on demo phones asks for permission every page load | Acceptable for demo; all three teammates pre-approve during setup. Add a "Tap to start camera" intro screen if browsers block auto-start. |
| Dashboard polling every 2s × 3 tiles × many open dashboards = server load | For a hackathon demo with <3 dashboards, irrelevant. Post-demo: switch to SSE or WebSocket. |
| Next.js 16 breaking changes vs implementer training data | `aegis/AGENTS.md` already mandates consulting `aegis/node_modules/next/dist/docs/` before writing code. Enforce in Unit 2 and 5 especially. |
| `@google/genai` SDK API may have moved between training data and reality | Implementer must read the SDK README before coding Unit 2. Do not rely on memorized API shape. |

## Documentation / Operational Notes

- Update `aegis/README.md` with a "Run the demo" section covering: env vars (`GEMINI_API_KEY`, `GEMINI_FALLBACK_MODEL`, `KNOT_*`, `KNOT_MERCHANT_ID`, `IMESSAGE_BRIDGE_URL`, `IMESSAGE_BRIDGE_TOKEN`, `AEGIS_PUBLIC_URL`), `scripts/prelink-knot.mjs` run order, Linux + macOS EC2 deployment runbooks (`deploy/linux-ec2.md`, `deploy/macos-ec2.md`), `scripts/dev-tunnel` for local fallback, three-device onboarding steps.
- Add a `.env.example` update with the new `GEMINI_API_KEY`, `GEMINI_FALLBACK_MODEL`, `KNOT_MERCHANT_ID`, and `IMESSAGE_BRIDGE_URL` / `IMESSAGE_BRIDGE_TOKEN` / `AEGIS_PUBLIC_URL` keys.
- Post-demo follow-up plan (not in scope here): Supabase migration from JSON files, SSE/WebSocket dashboard streaming to replace 2s polling, edge auth / per-device tokens / rate limits on the public EC2 endpoints, LangGraph adoption (revisit only if conversational-memory requirements R25-R28 return into scope), multi-patient and caretaker-invite flows.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-18-aegis-mvp-requirements.md](../brainstorms/2026-04-18-aegis-mvp-requirements.md)
- **Partially superseded by this plan:** [docs/plans/2026-04-18-001-feat-aegis-mvp-plan.md](2026-04-18-001-feat-aegis-mvp-plan.md) (GPT-4o decision, capture intervals)
- **Concurrent (UI):** [docs/plans/2026-04-18-002-feat-aegis-frontend-rebuild.md](2026-04-18-002-feat-aegis-frontend-rebuild.md)
- **UI→backend gap notes:** [docs/ui-backend-changes-needed.md](../ui-backend-changes-needed.md)
- **Gemini Robotics ER 1.6:** <https://ai.google.dev/gemini-api/docs/robotics-overview>
- **Knot Shopping quickstart:** <https://docs.knotapi.com/shopping/quickstart>
- **Knot TransactionLink:** <https://docs.knotapi.com/transaction-link/use-cases>
- **Photon iMessage kit:** `@photon-ai/imessage-kit` — Mac-only; runs on the macOS EC2 bridge in this plan.
- **AWS EC2 Mac instances:** <https://aws.amazon.com/ec2/instance-types/mac/> (`mac1.metal` / `mac2.metal`) — host for the Photon bridge.
- **Next.js 16 note:** see `aegis/AGENTS.md` — implementers must read `aegis/node_modules/next/dist/docs/` before writing Next.js code
- **Key existing code (unchanged unless noted):** `aegis/src/lib/vision.ts` (Unit 2 rewrites internals), `aegis/src/lib/knot.ts`, `aegis/src/lib/imessage.ts`, `aegis/src/lib/scheduler.ts`, `aegis/src/lib/events.ts`, `aegis/src/app/camera/[domain]/page.tsx`, `aegis/src/app/dashboard/page.tsx`, `aegis/src/components/CameraFeed.tsx`, `aegis/src/components/CameraPreview.tsx`, `aegis/src/app/api/snapshot/route.ts`, `aegis/src/app/api/snapshot/latest/[domain]/route.ts`
