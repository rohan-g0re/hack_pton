---
title: "fix: Knot session proof harness"
type: fix
status: active
date: 2026-04-19
---

# Knot Session Proof Harness

## Overview

Add an executable proof harness for the Knot SDK session fix. The harness should verify the actual app route used by Patient Settings: `POST /api/knot/session` with `{ merchantId: 44, purpose: "order_history" }` must create a Knot `transaction_link` session, must not send `merchant_ids` to `/session/create`, and must return SDK init data that keeps merchant selection in the SDK layer.

## Problem Frame

The code-level fix has a focused unit test, but the user asked to prove the issue is solved. The strongest local proof available without live Knot browser authentication is a route-level smoke test that starts the app, stubs the outbound Knot API call, sends the same request the browser sends, and asserts the captured Knot request body and app response.

## Requirements Trace

- R1. Prove the app route maps order-history sessions to Knot `transaction_link`.
- R2. Prove the server never sends invalid `merchant_ids` in the Knot `/session/create` body.
- R3. Prove the browser entry point requests `purpose: "order_history"`.
- R4. Provide a one-command proof path that works around this Windows environment's `node --test` `spawn EPERM` failure.
- R5. Preserve the existing focused regression test coverage.

## Scope Boundaries

- No live Knot API call, because the proof must be safe and repeatable without consuming credentials or requiring Amazon login.
- No browser automation dependency, because no browser tool is currently installed in this environment.
- No change to the production session behavior beyond proof artifacts unless the harness reveals a defect.

## Context & Research

### Relevant Code and Patterns

- `src/app.mjs` exposes `POST /api/knot/session` and passes session options to `createKnotSession`.
- `services/worker/knot-client.mjs` builds the Knot `/session/create` request body.
- `public/patient.js` launches the Knot SDK and is the browser source of the route payload.
- `tests/knot-checkout.test.mjs` already covers direct `createKnotSession` behavior without live credentials.
- `package.json` uses Node ESM and script-based test commands.

### Institutional Learnings

- `docs/solutions/integration-issues/knot-sdk-invalid-session-fields-and-wrong-product-type-2026-04-19.md` identifies the exact failure: `merchant_ids` is invalid in `/session/create`, and Amazon Shopping `link` config is blocked while `transaction_link` is enabled.
- `docs/solutions/workflow-issues/pm2-worker-stale-ecosystem-config-not-deployed-2026-04-19.md` notes deployment must restart the app after code changes, so local proof does not by itself prove production is updated.

## Key Technical Decisions

- **Route-level proof over unit-only proof:** A route smoke harness catches wiring regressions between `public/patient.js`, `src/app.mjs`, and `services/worker/knot-client.mjs`.
- **Stub outbound Knot fetch:** Capturing the app's outbound request proves payload shape without requiring Knot credentials or network.
- **Use a script instead of `node --test`:** This environment blocks Node test runner child process spawning with `spawn EPERM`, while plain `node` scripts run successfully.
- **Keep the script in `scripts/`:** The repo already stores operational and verification scripts there.

## Open Questions

### Resolved During Planning

- **Can local proof cover live SDK modal success?** No. It can prove the app will request the unblocked `transaction_link` session and valid body shape. Live SDK success still needs deployed credentials and browser authentication.

### Deferred to Implementation

- Whether to add an npm script alias depends on the final command shape. If the script is useful enough, expose it through `package.json`.

## Implementation Units

- [x] **Unit 1: Executable route proof**

**Goal:** Create a script that starts the app route, stubs Knot, and asserts the fixed session payload end to end.

**Requirements:** R1, R2, R4

**Dependencies:** None

**Files:**
- Create: `scripts/prove-knot-session.mjs`

**Approach:**
- Set fake Supabase and Knot env vars so `createApp()` can boot without real services.
- Replace `global.fetch` with a stub for outbound Knot API calls while using Node's original fetch for the local app request.
- Start the HTTP server on an ephemeral port.
- Send `POST /api/knot/session` with `{ merchantId: 44, purpose: "order_history" }`.
- Capture the outbound Knot `/session/create` request body.
- Assert the app response has `sessionType: "transaction_link"` and `merchantIds: [44]`.
- Assert the outbound Knot body has `type: "transaction_link"`, `external_user_id`, metadata flow `order_history`, and no `merchant_ids`.
- Restore env and fetch after completion.

**Execution note:** Add the script and run it before any broader cleanup; the proof must fail fast if the route wiring is broken.

**Patterns to follow:**
- Environment restore pattern in `tests/knot-checkout.test.mjs`.
- HTTP server startup pattern in `tests/app.test.mjs`.
- Node ESM script style in `scripts/seed-supabase.mjs`.

**Test scenarios:**
- Happy path: order-history route request returns SDK init with `sessionType: "transaction_link"`.
- Integration: outbound Knot request uses `/session/create` and contains `type: "transaction_link"`.
- Edge case: outbound Knot request body does not include `merchant_ids`, while app response still returns `merchantIds` for SDK `open()`.
- Error path: assertion failure exits non-zero with a clear message.

**Verification:**
- `node scripts/prove-knot-session.mjs` prints a concise pass message and exits 0.

---

- [x] **Unit 2: Browser payload proof**

**Goal:** Prove the Patient Settings JavaScript still sends `purpose: "order_history"` to the session route.

**Requirements:** R3

**Dependencies:** Unit 1

**Files:**
- Modify: `scripts/prove-knot-session.mjs`

**Approach:**
- Read `public/patient.js`.
- Assert the route payload includes `purpose: "order_history"`.
- Assert the UI text reflects order history rather than Shopping for the existing merchant list.

**Patterns to follow:**
- Keep this static check small and targeted; do not build a custom parser for one string-level proof.

**Test scenarios:**
- Happy path: `public/patient.js` contains the fixed route payload.
- Error path: removing the payload purpose causes the proof script to fail.

**Verification:**
- The same proof command covers both route and browser payload assertions.

---

- [x] **Unit 3: Command alias and final verification**

**Goal:** Make the proof discoverable and rerun all feasible checks.

**Requirements:** R4, R5

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `package.json`

**Approach:**
- Add an npm script such as `prove:knot` if the final command is stable.
- Run the proof harness.
- Run `node tests/knot-checkout.test.mjs`.
- Run syntax checks for touched JavaScript files.
- Re-run `npm.cmd test` to document whether the Windows `spawn EPERM` limitation still blocks the full suite.

**Patterns to follow:**
- Existing `package.json` script naming style.

**Test scenarios:**
- Happy path: npm alias runs the proof script.
- Regression: existing focused Knot test still passes.

**Verification:**
- Local output includes route-level proof success and focused regression success.

## System-Wide Impact

- **Interaction graph:** Browser `public/patient.js` -> `POST /api/knot/session` -> `src/app.mjs` -> `createKnotSession` -> outbound Knot `/session/create`.
- **Error propagation:** The proof harness should fail locally on assertion errors, not hide route wiring or payload mismatches.
- **State lifecycle risks:** None; the script uses fake env vars, stubs external fetch, and does not write Supabase data.
- **API surface parity:** The app response intentionally keeps `merchantIds` for SDK `open()` while the server-side Knot body omits `merchant_ids`.
- **Integration coverage:** The harness covers the route and client payload. It does not cover live Knot SDK modal rendering or Amazon authentication.
- **Unchanged invariants:** Production app behavior remains `transaction_link` for order history and default `link` for unspecified shopping sessions.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The proof stubs Knot, so it cannot catch live account disablement | State that live confirmation still requires deploy and browser login |
| `createApp()` requires Supabase env | Use fake env values and avoid routes that call Supabase |
| Global `fetch` stubbing can leak between checks | Restore `global.fetch` in `finally` |
| Full test suite remains blocked by `spawn EPERM` | Provide a plain-node proof command and focused test command |

## Documentation / Operational Notes

- This proves the local code path. Production remains unproven until the updated app is deployed/restarted and the Amazon order-history SDK flow is clicked.
- If deployment is the next step, follow the EC2 deployment learning in `docs/solutions/workflow-issues/pm2-worker-stale-ecosystem-config-not-deployed-2026-04-19.md`.

## Sources & References

- Related solution: `docs/solutions/integration-issues/knot-sdk-invalid-session-fields-and-wrong-product-type-2026-04-19.md`
- Related plan: `docs/plans/2026-04-19-013-feat-knot-transaction-link-plan.md`
- Related code: `src/app.mjs`
- Related code: `services/worker/knot-client.mjs`
- Related code: `public/patient.js`
- Related test: `tests/knot-checkout.test.mjs`
