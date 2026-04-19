---
title: "feat: Knot Transaction Link — Amazon order history on caretaker dashboard"
type: feat
status: active
date: 2026-04-19
---

# Knot Transaction Link — Amazon Order History

## Overview

Add Knot's Transaction Link product to let the caretaker connect the patient's Amazon account and see their real SKU-level order history on the dashboard. This is the only Knot product confirmed working end-to-end on this production account — `transaction_link` session creation succeeds, the SDK can authenticate the user, and the `POST /transactions/sync` endpoint returns real order data.

## Problem Frame

The Knot Shopping product (auto-ordering groceries) is blocked by a Knot account-level restriction on Amazon's `link` config endpoint. Transaction Link is not blocked — it was confirmed enabled in session probing (`link: ENABLED, transaction_link: ENABLED, vault: NO_ACCESS`). For the hackathon demo, Transaction Link delivers a compelling, working Knot integration: the caretaker sees exactly what their loved one has been ordering from Amazon, down to product names, quantities, prices, and dates.

## Requirements Trace

- R1. Caretaker can open a Knot SDK modal to connect the patient's Amazon account for order history retrieval
- R2. After the account is linked, transactions are synced via `POST /transactions/sync` and stored in Supabase
- R3. The caretaker dashboard shows recent Amazon orders with item names, dates, and totals
- R4. Webhook events `NEW_TRANSACTIONS_AVAILABLE` and `UPDATED_TRANSACTIONS_AVAILABLE` trigger a re-sync
- R5. The Patient Settings page has a distinct "View order history" button separate from the shopping link button
- R6. Linked account status is visible in the UI (connected / not connected)

## Scope Boundaries

- No auto-ordering or cart sync in this plan — that remains blocked by Knot Shopping restrictions
- No cursor pagination UI — fetch the first page (default 5, up to 20) and display; `next_cursor` stored but not exposed in UI
- No per-product image rendering — show product names and prices as text
- Knot dev environment `/development/accounts/link` is used in development to link accounts without the SDK; production always uses the SDK flow

## Context & Research

### Relevant Code and Patterns

- `services/worker/knot-client.mjs` — `knotRequest`, `createKnotSession`, `MERCHANTS` — Transaction Link functions add to this file
- `src/app.mjs` — existing Knot routes (`/api/knot/session`, `/api/knot/session/extend`, `/api/knot/webhooks`) — new routes follow the same pattern
- `src/supabase-store.mjs` — existing store pattern for Supabase reads/writes
- `public/patient.js` — existing Knot SDK open pattern (`openKnotSDK`) — Transaction Link button follows the same shape
- `public/dashboard.js` — existing panel rendering — transactions panel appends to this
- `supabase/migrations/003_knot_tables.sql` — existing Knot table precedent; `004_transaction_link.sql` is the next migration

### API Facts (from Knot docs and live session probing)

- Session: `POST /session/create` with `type: "transaction_link"` — confirmed working
- Sync: `POST /transactions/sync` with `external_user_id`, `merchant_id`, optional `cursor` (max 100 per page)
- Accounts: `GET /accounts/get?external_user_id=...&type=transaction_link` — check connection status
- Webhooks: `NEW_TRANSACTIONS_AVAILABLE`, `UPDATED_TRANSACTIONS_AVAILABLE` — trigger re-sync
- Transaction object fields used: `id`, `datetime`, `order_status`, `price.total`, `price.currency`, `products[].name`, `products[].quantity`, `products[].price.unit_price`, `url`
- Amazon merchant ID: 44 (same for both shopping and transaction_link)

### Institutional Learnings

- `docs/solutions/workflow-issues/pm2-worker-stale-ecosystem-config-not-deployed-2026-04-19.md` — deploy both EC2s after any code change

## Key Technical Decisions

- **Separate session purpose param**: `POST /api/knot/session` accepts a `purpose` field (`"shopping"` vs `"order_history"`). When `purpose === "order_history"`, backend creates `type: "transaction_link"` session regardless of merchant type. This avoids adding another merchant entry to MERCHANTS for the same Amazon ID.
- **Store transactions in Supabase**: Supabase `knot_transactions` table (patient_id, external_user_id, merchant_id, transaction_id, raw JSONB). Idempotent upsert by `transaction_id` so re-syncs don't duplicate rows.
- **Sync in webhook handler, not worker poll**: Transaction Link syncs are event-driven — Knot pushes `NEW_TRANSACTIONS_AVAILABLE` when there's something to fetch. No polling loop needed.
- **Dashboard renders from Supabase, not live Knot API**: `/api/state` includes `knotTransactions` array from Supabase; the dashboard polls every 4s as usual. This avoids direct browser-to-Knot calls and keeps latency predictable.
- **Dev auto-link via `/development/accounts/link`** without `card_switcher` field = Transaction Link mode in sandbox.

## Open Questions

### Resolved During Planning

- **Which merchant ID for Transaction Link?**: Amazon (44) — same as Shopping. The session type differs, not the merchant.
- **Does `/transactions/sync` require prior authentication via SDK?**: Yes — the user must link the account via the `transaction_link` SDK session first. After `AUTHENTICATED` webhook, sync proceeds.
- **Does the existing `knot_webhook_events` table cover Transaction Link webhooks?**: Yes — the idempotency table uses `(event, task_id)` unique constraint. Transaction Link webhooks include a `task_id` field.

### Deferred to Implementation

- Exact Knot response shape for Transaction Link `AUTHENTICATED` webhook — may differ from Shopping `AUTHENTICATED`; verify at runtime and handle `null` task_id gracefully in the idempotency upsert.
- Whether `GET /accounts/get` returns `type: transaction_link` accounts in production — test after first SDK link.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Caretaker clicks "Connect Amazon for order history"
  → POST /api/knot/session { merchantId: 44, purpose: "order_history" }
  → backend: createKnotSession with type="transaction_link"
  → SDK opens, user logs into Amazon
  → Knot sends AUTHENTICATED webhook → /api/knot/webhooks
  → handler marks knot_merchant_accounts connected (type: transaction_link)
  → Knot sends NEW_TRANSACTIONS_AVAILABLE webhook → /api/knot/webhooks
  → handler calls syncTransactionsForUser(externalUserId, merchantId)
    → POST /transactions/sync → Knot returns up to 20 transactions
    → upsert each into knot_transactions by transaction_id
  → dashboard poll hits /api/state → includes knotTransactions[]
  → "Amazon Orders" panel renders with item names, dates, totals
```

## Implementation Units

- [ ] **Unit 1: Transaction Link Supabase migration**

**Goal:** Create `knot_transactions` table to store synced Amazon order history

**Requirements:** R2, R3

**Dependencies:** None

**Files:**
- Create: `supabase/migrations/004_transaction_link.sql`

**Approach:**
- Table columns: `id` (uuid pk), `patient_id` (fk patients), `external_user_id` (text), `merchant_id` (int), `transaction_id` (text, unique), `merchant_name` (text), `datetime` (timestamptz), `order_status` (text), `total` (numeric), `currency` (text default 'USD'), `products` (jsonb), `raw` (jsonb), `created_at` (timestamptz)
- Unique constraint on `transaction_id` for idempotent upsert
- Run in Supabase SQL editor — same process as migrations 002 and 003

**Test scenarios:**
- Test expectation: none — DDL migration, no behavioral logic

**Verification:** `knot_transactions` table visible in Supabase; `transaction_id` unique index present

---

- [ ] **Unit 2: Backend — Transaction Link session type and sync function**

**Goal:** Add `transaction_link` session creation and `POST /transactions/sync` call to `knot-client.mjs`

**Requirements:** R1, R2, R4

**Dependencies:** None (parallel with Unit 1)

**Files:**
- Modify: `services/worker/knot-client.mjs`

**Approach:**
- Update `createKnotSession` to accept `purpose` param: when `purpose === "order_history"`, override `sessionType` to `"transaction_link"` regardless of merchant type
- Add `syncTransactions({ externalUserId, merchantId, cursor, limit = 20 })` function — calls `POST /transactions/sync`, returns `{ transactions, next_cursor }`
- Add `getLinkedAccounts({ externalUserId, type = "transaction_link" })` — calls `GET /accounts/get` to check connection status
- Follow existing `knotRequest` pattern (Basic auth, `Knot-Version: 2.0`, error handling)

**Patterns to follow:**
- `knotRequest` in `services/worker/knot-client.mjs`
- `syncKnotCart` for request body shape conventions

**Test scenarios:**
- Happy path: `createKnotSession` with `purpose: "order_history"` → session body has `type: "transaction_link"`
- Happy path: `syncTransactions` with valid `externalUserId` and `merchantId` → returns array of transactions
- Edge case: `syncTransactions` with `cursor` → passes cursor in request body
- Error path: Knot returns non-2xx → throws with structured error message including Knot error code

**Verification:** `createKnotSession({ purpose: "order_history" })` creates a session without 403; `syncTransactions` can be called and returns data when account is linked

---

- [ ] **Unit 3: Backend — session endpoint and Transaction Link webhook handlers**

**Goal:** Extend `/api/knot/session` to accept `purpose` field; add `NEW_TRANSACTIONS_AVAILABLE` and `UPDATED_TRANSACTIONS_AVAILABLE` webhook handlers; expose `GET /api/knot/transactions` for dashboard polling

**Requirements:** R1, R2, R4, R6

**Dependencies:** Unit 2

**Files:**
- Modify: `src/app.mjs`
- Modify: `services/worker/knot-checkout.mjs` (or new `services/worker/knot-transactions.mjs`)

**Approach:**
- `/api/knot/session`: pass `body.purpose` through to `createKnotSession`; session response already includes `sessionType`
- `/api/knot/webhooks`: add cases for `NEW_TRANSACTIONS_AVAILABLE` and `UPDATED_TRANSACTIONS_AVAILABLE` — both call `syncAndStoreTransactions(sb, payload)` which calls `syncTransactions`, then upserts rows into `knot_transactions`
- New route `GET /api/knot/transactions?limit=20` — queries `knot_transactions` for the seed patient, ordered by `datetime desc`, returns array
- `syncAndStoreTransactions`: extract `external_user_id` and `merchant_id` from webhook payload; call `syncTransactions`; upsert each transaction by `transaction_id` into Supabase; handle `next_cursor` for completeness (one additional fetch if cursor present)
- Also handle `AUTHENTICATED` for `transaction_link` type: mark `knot_merchant_accounts` connected with `type: transaction_link` (distinguish from shopping connections by adding a `product_type` column or using a separate record)

**Patterns to follow:**
- Existing webhook handlers in `src/app.mjs` (idempotency upsert before processing)
- `handleMerchantAuthenticated` in `services/worker/knot-checkout.mjs`

**Test scenarios:**
- Happy path: `NEW_TRANSACTIONS_AVAILABLE` webhook with valid `external_user_id` and `merchant_id` → `syncAndStoreTransactions` called → rows in `knot_transactions`
- Idempotency: same `NEW_TRANSACTIONS_AVAILABLE` webhook delivered twice → no duplicate `knot_transactions` rows (upsert by `transaction_id`)
- Edge case: webhook payload missing `task_id` → webhook event stored with null `task_id`; still processes
- Error path: `syncTransactions` call to Knot fails (network) → webhook returns 200 after storing payload; error logged but not re-thrown (Knot will retry)
- Happy path: `GET /api/knot/transactions?limit=5` → returns up to 5 most recent transactions ordered by date desc

**Verification:** After manually triggering a webhook with test payload, `knot_transactions` has a new row; `GET /api/knot/transactions` returns it

---

- [ ] **Unit 4: Extend `/api/state` with transaction history**

**Goal:** Include recent Amazon transactions in the `/api/state` response so the dashboard can render them without a separate fetch

**Requirements:** R3

**Dependencies:** Unit 1, Unit 3

**Files:**
- Modify: `src/supabase-store.mjs`

**Approach:**
- In `listState()`, add a query for `knot_transactions` ordered by `datetime desc`, limit 10
- Map to a simplified shape: `{ id, merchantName, datetime, orderStatus, total, currency, products: [{name, quantity, unitPrice}] }`
- Return under `state.knotTransactions` key
- Return empty array if no transactions exist (not an error)

**Patterns to follow:**
- Existing `listState` queries in `src/supabase-store.mjs` (same Supabase client, same `.select().eq().order().limit()` pattern)

**Test scenarios:**
- Happy path: `knot_transactions` has 3 rows → `state.knotTransactions` returns 3 items with expected fields
- Edge case: `knot_transactions` is empty → `state.knotTransactions` returns `[]`, no error thrown
- Edge case: `products` column is null (old row) → mapped to `[]`

**Verification:** `curl https://okaytoday.health/api/state | node -e "...console.log(data.knotTransactions)"` returns array after a transaction is synced

---

- [ ] **Unit 5: Patient Settings UI — "Connect Amazon for order history" button**

**Goal:** Add a distinct SDK launch button for Transaction Link on the Patient Settings page, separate from the shopping link

**Requirements:** R1, R5, R6

**Dependencies:** Unit 2, Unit 3

**Files:**
- Modify: `public/patient.html`
- Modify: `public/patient.js`

**Approach:**
- In `patient.html`, add a new section "Amazon order history" with a "Connect Amazon account" button and a status indicator (`#txlink-status`, `#txlink-hint`)
- In `patient.js`, add `openTransactionLinkSDK()` that calls `POST /api/knot/session` with `{ merchantId: 44, purpose: "order_history" }`, then opens the Knot SDK with the returned `sessionId`
- Use same SDK open pattern as `openKnotSDK` (existing function) — same error handling, same REFRESH_SESSION_REQUEST handler
- Show connection status: query `GET /api/knot/transactions?limit=1` on page load; if returns data, show "Connected — last order [date]"; otherwise show "Not connected"
- `onSuccess` callback: show "Amazon account linked! Order history will appear on dashboard within seconds."

**Patterns to follow:**
- `openKnotSDK` in `public/patient.js` — exact same SDK open pattern
- Existing `hint` / `link-btn` pattern in the Knot section

**Test scenarios:**
- Happy path: user clicks "Connect Amazon account" → session created → SDK opens → `onSuccess` fires → hint updates to "connected"
- Error path: session creation fails (Knot 500) → `onError` fires → hint shows error message with raw Knot error code
- Edge case: SDK closed without linking → `onExit` fires → hint cleared or shows "Closed without linking"
- Happy path: page loads with existing transactions → status shows "Connected — last order [formatted date]"

**Verification:** Button visible on `/dashboard/patient`; clicking opens Knot SDK modal with Amazon logo; `onSuccess` updates hint text

---

- [ ] **Unit 6: Dashboard — Amazon Orders panel**

**Goal:** Render a "Recent Amazon orders" panel on the caretaker dashboard showing the patient's order history

**Requirements:** R3

**Dependencies:** Unit 4

**Files:**
- Modify: `public/dashboard.html`
- Modify: `public/dashboard.js`

**Approach:**
- In `dashboard.html`, add a new `<section class="panel wide">` with id `amazon-orders-panel` after the events feed; initially hidden if no transactions
- In `dashboard.js`, in `loadState()`, check `data.knotTransactions`; if non-empty, render and show the panel
- Each transaction row shows: order date (formatted local), status pill (COMPLETED green / SHIPPED yellow / ORDERED blue), items list (product names + quantities), and total price
- If `knotTransactions` is empty, show a muted "No Amazon orders on file — connect the patient's Amazon account from Patient Settings" message
- Render using `escapeHtml` for all dynamic content (same pattern as existing event list rendering)

**Patterns to follow:**
- `renderEventFeed` in `public/dashboard.js` — same `.map()` → `innerHTML` pattern
- Existing panel HTML structure in `public/dashboard.html`
- `escapeHtml` from `public/common.js`

**Test scenarios:**
- Happy path: `state.knotTransactions` has 3 items → panel visible with 3 rows, each showing date, status, items, total
- Edge case: `state.knotTransactions` is empty → panel shows "no orders" message
- Edge case: transaction `products` is empty array → row shows "No items listed"
- Edge case: `total` is null → shows "$—" or "N/A"
- Happy path: order status "COMPLETED" → green status pill; "SHIPPED" → yellow; "ORDERED" → blue

**Verification:** After linking Amazon and syncing transactions, dashboard shows "Recent Amazon orders" panel with real order data; `escapeHtml` applied to all product names

## System-Wide Impact

- **Interaction graph:** `NEW_TRANSACTIONS_AVAILABLE` webhook → `syncAndStoreTransactions` → Supabase `knot_transactions` upsert → dashboard next poll returns updated `knotTransactions`
- **Error propagation:** Webhook handler always returns 200 after storing the event payload — sync errors are logged but don't cause Knot retries on the webhook. Failed syncs leave `knot_transactions` with stale data; next webhook will re-sync.
- **State lifecycle risks:** `transaction_id` unique constraint prevents duplicates on re-sync. `knotTransactions` in `/api/state` is read-only append; no mutation risk.
- **API surface parity:** `/api/state` gains a new `knotTransactions` field — existing clients that don't use it are unaffected (new field in JSON response)
- **Integration coverage:** The critical cross-layer chain is: Knot webhook → web server handler → `syncTransactions` Knot API call → Supabase upsert → `listState` query → dashboard render. No unit test can cover the full chain; verify manually after linking.
- **Unchanged invariants:** Existing Shopping Knot routes (`/api/knot/session` with default purpose, `/api/knot/webhooks` shopping handlers, `knot_merchant_accounts`) are unchanged. `listState` additions are additive only.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Knot `AUTHENTICATED` webhook for `transaction_link` may not include `task_id` | Fallback idempotency key: hash of `(event, external_user_id, merchant_id, datetime bucket)` |
| `NEW_TRANSACTIONS_AVAILABLE` may not fire immediately after linking | Manual sync endpoint `POST /api/knot/transactions/sync` as fallback for testing |
| `GET /accounts/get` may not distinguish transaction_link vs shopping accounts | Derive connection status from `knot_transactions` table (if rows exist, account is connected) |
| Amazon account linking fails in production (same Shopping 400 pattern) | Test with dev environment first; report to Knot founder if blocked |

## Documentation / Operational Notes

- Run `supabase/migrations/004_transaction_link.sql` in Supabase SQL Editor before deploying
- After deploying, test by: opening Patient Settings → Connect Amazon → authenticate → check worker logs for `syncAndStoreTransactions` → verify dashboard shows orders
- Knot production webhook URL must be configured: `https://okaytoday.health/api/knot/webhooks` (already set in development; production webhook section may need the same URL added)

## Sources & References

- Knot Transaction Link docs: https://docs.knotapi.com/link/retrieving-and-listing-merchants
- Knot `POST /transactions/sync` schema: reviewed in session
- Knot `GET /accounts/get` schema: `connection.status`, `lifecycle.status`
- Session create schema (confirmed): only `type` + `external_user_id` required
- Related code: `services/worker/knot-client.mjs`, `services/worker/knot-checkout.mjs`, `src/app.mjs`
