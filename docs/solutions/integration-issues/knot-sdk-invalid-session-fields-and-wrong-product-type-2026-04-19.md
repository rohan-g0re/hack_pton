---
title: "Knot Web SDK 'Something went wrong' — invalid session body field and blocked product type"
problem_type: integration_issue
track: bug
severity: high
status: resolved
resolution_type: code_fix
component: payments
module: knot-api-integration
date: 2026-04-19
project: hack-princeton-2026
tags:
  - knot
  - knot-web-sdk
  - session-create
  - invalid-field
  - merchant-ids
  - transaction-link
  - card-switcher
  - api-integration
symptoms:
  - "Knot Web SDK showed 'Something went wrong. Please try again.' for every merchant"
  - "POST /merchants/44/config?type=link&platform=web → 400 Bad Request — Shopping product not enabled for Amazon on this account"
  - "POST /api/knot/session was sending merchant_ids which is not a valid field in the Knot /session/create schema"
  - "onError callback received [object Object] - undefined instead of error strings"
  - "type: card_switcher failed with 400: card_id field required"
  - "type: vault failed with 403: The type is not enabled"
root_cause: >
  Two compounding issues: (1) the session/create body included merchant_ids,
  a field that does not exist in the official Knot API OpenAPI schema —
  only type, external_user_id, card_id, email, phone_number, processor_token,
  and metadata are valid. (2) The Shopping (link) product for Amazon merchant 44
  was not enabled at the merchant-config level for this production Knot account,
  causing the SDK's internal config fetch to return 400.
---

## Problem

Integrating the Knot Web SDK resulted in "Something went wrong. Please try again." for every merchant. The root causes were twofold: the session/create request body included `merchant_ids`, a field that does not exist in the Knot API schema, and the `link` (Shopping) product type was not enabled for the production account's merchants, causing the merchant config endpoint to return 400.

## Symptoms

- Knot SDK modal displayed "Connect your Amazon account to Hack Princeton" then immediately showed "Something went wrong. Please try again."
- `onError` callback received `[object Object] - undefined` instead of plain strings — newer SDK versions pass structured objects, not strings
- Browser console: `POST https://production.knotapi.com/merchants/44/config?type=link&platform=web&minVersion=1.0.6 400 (Bad Request)`
- `AxiosError: Request failed with status code 400` for every merchant config fetch
- Attempting `type: 'vault'` returned `403 NO_ACCESS: The type is not enabled`
- Attempting `type: 'card_switcher'` returned `400: The card_id field is required when type = card_switcher`

## What Didn't Work

1. **Assumed domain allowlisting was the cause** — the Knot dashboard has no domain settings UI; this was a dead end.

2. **Added `merchant_ids` to the session/create body** — this field does not exist in the Knot API OpenAPI schema. Sending it is a schema violation that may cause silent failures or contribute to unexpected behavior.

3. **Switched to `type: 'vault'`** — returned `403 NO_ACCESS` because this product type is not enabled for the account.

4. **Switched to `type: 'card_switcher'`** — returned `400` because this type requires a pre-existing vaulted `card_id` in the request body, which was not available.

5. **Relied only on SDK error modal** — the modal shows "Something went wrong" with no detail. The actual cause was only visible in browser DevTools → Network tab filtering by `knotapi.com`.

## Solution

### Step 1 — Remove `merchant_ids` from the session/create body

The Knot `POST /session/create` endpoint only accepts: `type`, `external_user_id`, `card_id`, `email`, `phone_number`, `processor_token`, `metadata`. Pass merchant selection only through the SDK `open()` call's `merchantIds` parameter.

```javascript
// WRONG — merchant_ids is not a valid field in the Knot schema
const result = await knotRequest('/session/create', {
  type: sessionType,
  external_user_id: externalUserId,
  merchant_ids: [Number(merchantId)],  // ← remove this
  metadata: { patient_id: patientId }
});

// CORRECT — merchant only in SDK open() call
const result = await knotRequest('/session/create', {
  type: sessionType,
  external_user_id: externalUserId,
  metadata: { patient_id: patientId }
});
knotapi.open({ sessionId, clientId, environment, merchantIds: [merchantId], ... });
```

### Step 2 — Probe which session types are enabled

Run this against your production credentials before committing to a session type:

```javascript
const auth = Buffer.from('clientId:clientSecret').toString('base64');
const types = ['link', 'card_switcher', 'transaction_link', 'vault'];
Promise.all(types.map(type =>
  fetch('https://production.knotapi.com/session/create', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/json',
      'Knot-Version': '2.0'
    },
    body: JSON.stringify({ type, external_user_id: 'test-probe-001' })
  }).then(r => r.json()).then(d => ({ type, status: d.session ? 'ENABLED' : d.error_message }))
)).then(results => results.forEach(r => console.log(r.type + ':', r.status)));

// Results for this account:
// link:             ENABLED (session created, but Shopping product for merchant 44 blocked → 400 on config)
// card_switcher:    "The card_id field is required" (ENABLED but needs card_id in session body)
// transaction_link: ENABLED (session created successfully, end-to-end working)
// vault:            "The type is not enabled" (NO_ACCESS)
```

### Step 3 — Use `transaction_link` when Shopping is blocked

`transaction_link` allows connecting a merchant account (Amazon) to retrieve SKU-level order history. It bypasses the Shopping product restriction and works end-to-end when `link` (Shopping) is blocked at the merchant config level. The session create body and SDK open call are identical in shape — only the `type` field changes.

### Step 4 — Fix `onError` to handle object arguments

Newer Knot SDK versions pass structured objects rather than plain strings to `onError`:

```javascript
onError: (code, desc) => {
  const codeStr = typeof code === 'object' ? JSON.stringify(code) : String(code ?? '');
  const descStr = typeof desc === 'object' ? JSON.stringify(desc) : String(desc ?? '');
  console.error('Knot onError:', code, desc);
  hint.textContent = `Knot error: ${codeStr}${descStr ? ' — ' + descStr : ''}`;
},
```

## Why This Works

The Knot API enforces strict schema validation on the session/create body. `merchant_ids` is not an accepted field; including it is invalid. Merchant selection belongs entirely in the SDK layer (`open()` call), not in the server-side session body — the session is a capability grant, not a merchant filter.

The "Something went wrong" modal originates from the SDK's internal call to `merchants/{id}/config?type=link`, which returns 400 when the Shopping (`link`) product is not enabled at the merchant level for the account. Switching to `transaction_link` bypasses this restriction because it uses a different product family entirely. The `onError` type mismatch is a SDK version incompatibility — defensive coercion handles both old (string) and new (object) callback signatures.

## Prevention

1. **Always validate request body fields against the official Knot OpenAPI schema** before integration — do not infer field names from SDK examples or other APIs. The schema is at: `POST /session/create` only accepts `type`, `external_user_id`, `card_id`, `email`, `phone_number`, `processor_token`, `metadata`.

2. **Run the session-type probe script at the start of any Knot integration** to enumerate which product types (`link`, `transaction_link`, `vault`, `card_switcher`) are actually enabled for the account — do not assume from documentation.

3. **When the Knot SDK shows "something went wrong", open Browser DevTools → Network tab** and filter by `knotapi.com` to identify the exact failing request and HTTP status before guessing at causes. The modal shows nothing useful; the DevTools do.

4. **Write `onError` handlers defensively** — always coerce both arguments with `typeof x === 'object' ? JSON.stringify(x) : String(x ?? '')` to handle SDK version differences.

5. **`card_switcher` is a distinct product** requiring a pre-vaulted `card_id` in the session body — it is not interchangeable with `vault` type and cannot be used for initial card capture.

6. **`transaction_link` is a working fallback** when Shopping (`link`) is blocked for a specific merchant — it gives access to order history without needing the Shopping product to be enabled.

## Related

- `docs/KNOT_API_INTEGRATION.md` — SDK error codes table, session create field requirements, `onError` handler pattern
- `docs/plans/2026-04-19-013-feat-knot-transaction-link-plan.md` — implementation plan that uses `transaction_link` as the working Knot product
