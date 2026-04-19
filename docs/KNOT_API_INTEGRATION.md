# Knot API Integration Documentation

Created: 2026-04-19

This is the single handoff document for using Knot in this repo. It consolidates the Knot docs we reviewed and translates them into the Caretaker app use case: Gemini detects low pantry inventory, the caretaker approves a replenishment proposal, and Knot adds products to the patient's linked merchant cart and checks out through the merchant account.

This document is intentionally implementation-oriented. It includes the conceptual model, endpoint contracts, Web SDK usage, webhook lifecycle, testing strategy, and code snippets that should guide the later implementation.

## Sources Read

- Knot docs index: https://docs.knotapi.com/llms.txt
- Authentication: https://docs.knotapi.com/api-reference/authentication
- Versioning: https://docs.knotapi.com/api-reference/versioning
- Web SDK: https://docs.knotapi.com/sdk/web
- Vaulting quickstart: https://docs.knotapi.com/vaulting/quickstart
- Shopping quickstart: https://docs.knotapi.com/shopping/quickstart
- Shopping testing: https://docs.knotapi.com/shopping/testing
- Create Session: https://docs.knotapi.com/api-reference/sessions/create-session
- Extend Session: https://docs.knotapi.com/api-reference/sessions/extend-session
- Development Link Account: https://docs.knotapi.com/api-reference/development/link-account
- List Merchants: https://docs.knotapi.com/api-reference/merchants/list-merchants
- Sync Cart: https://docs.knotapi.com/api-reference/products/shopping/sync-cart
- Checkout: https://docs.knotapi.com/api-reference/products/shopping/checkout
- Webhooks: https://docs.knotapi.com/webhooks
- Authenticated webhook: https://docs.knotapi.com/link/webhook-events/authenticated
- Shopping webhook events:
  - https://docs.knotapi.com/shopping/webhook-events/sync-cart-succeeded
  - https://docs.knotapi.com/shopping/webhook-events/sync-cart-failed
  - https://docs.knotapi.com/shopping/webhook-events/checkout-succeeded
  - https://docs.knotapi.com/shopping/webhook-events/checkout-failed

No official deprecation or sunset warning was found in the pages reviewed. Knot does have API versioning. We should send `Knot-Version: 2.0` explicitly on backend API requests instead of relying on defaults.

## Executive Summary

Knot Shopping is not a synchronous "place order" endpoint.

The correct Shopping flow is:

1. A user links an existing merchant account, such as Walmart, through the Knot SDK or a development-only bypass endpoint.
2. Our backend calls `POST /cart` with `external_user_id`, `merchant_id`, and product `external_id` values.
3. Knot asynchronously updates the user's merchant cart.
4. Our backend receives `SYNC_CART_SUCCEEDED` or `SYNC_CART_FAILED`.
5. Our backend calls `POST /cart/checkout`.
6. Knot asynchronously checks out the merchant cart.
7. Our backend receives `CHECKOUT_SUCCEEDED` or `CHECKOUT_FAILED`.
8. For successful checkout, we fetch transaction details and update the Caretaker dashboard.

For this app, "approve proposal" should not immediately mark the order as completed. It should create a local checkout workflow in a pending state, ask Knot to sync the cart, and only mark success when the relevant webhook arrives.

## Product Boundaries

Knot has multiple products. The ones relevant to this app are:

| Knot area | What it does | How it applies here |
| --- | --- | --- |
| Web SDK | Lets a user authenticate into a merchant account without leaving our app. | Caretaker or patient links the patient's Walmart or grocery account. |
| Shopping | Adds products to a linked merchant cart and checks out. | Pantry replenishment after Gemini creates a proposal and caretaker approves it. |
| Vaulting | Vaults a digital wallet to a merchant account, and in unified flow may also do card switching. | Useful for payment setup if the product requires a merchant payment method before checkout. |
| List Merchants | Returns Knot-supported merchants for a product. | We discover supported Shopping merchants instead of hardcoding merchant names. |
| Webhooks | Reports async lifecycle events. | Our source of truth for whether linking, cart sync, vaulting, and checkout succeeded. |
| Development Link Account | Bypasses the SDK in development. | Lets us test worker/cart/checkout flow without browser SDK setup. |

## Our Use Case Model

### Actors

- **Caretaker:** approves purchase proposals and configures patient/merchant/payment setup.
- **Patient:** the person whose pantry and medications are monitored.
- **Nanny camera:** captures pantry snapshots.
- **Gemini worker:** turns snapshots into pantry analysis.
- **Knot:** links the patient's merchant account, syncs a cart, and checks out.
- **Supabase:** stores proposals, merchant account status, cart/checkout state, events, and webhook records.

### Data Flow

```text
Camera snapshot
  -> Supabase snapshots row
  -> Gemini pantry worker
  -> purchase_proposals row
  -> Caretaker approves
  -> local Knot workflow row: pending_cart_sync
  -> Knot POST /cart
  -> SYNC_CART_SUCCEEDED webhook
  -> local Knot workflow row: cart_synced
  -> Knot POST /cart/checkout
  -> CHECKOUT_SUCCEEDED webhook
  -> local checkout row: success
  -> dashboard event + order confirmation details
```

### What Knot Does Not Do For Us

- It does not create merchants. Knot has pre-integrated merchants.
- It does not take arbitrary product names like "milk" and magically choose a SKU. Shopping `Sync Cart` requires merchant product `external_id` values.
- It does not make checkout synchronous. `202` means Knot accepted the request for processing.
- It does not remove the need for local state. We still need to track pending, succeeded, failed, retryable, and disconnected states.

## Environment And Credentials

Knot API requests use HTTP Basic auth where:

- username = `client_id`
- password = `secret`

These values differ between development and production.

Recommended environment variables:

```bash
KNOT_ENVIRONMENT=development
KNOT_API_BASE=https://development.knotapi.com
KNOT_CLIENT_ID=
KNOT_CLIENT_SECRET=
KNOT_WEBHOOK_SECRET=
KNOT_WEB_CLIENT_ID=
KNOT_DEFAULT_SHOPPING_MERCHANT_ID=45
```

Notes:

- `KNOT_CLIENT_SECRET` must never go to the browser.
- `KNOT_WEB_CLIENT_ID` may be sent to the browser because the SDK requires a client ID.
- Keep development and production credentials separate.
- Use `https://development.knotapi.com` for development and `https://production.knotapi.com` for production.
- Include `Knot-Version: 2.0` on server-to-server API calls.

## Core Backend Helper Snippets

These snippets are authored for our Node runtime. They are not copied directly from the Knot docs.

### Basic Auth Header

```js
function knotBasicAuthHeader() {
  const clientId = process.env.KNOT_CLIENT_ID;
  const secret = process.env.KNOT_CLIENT_SECRET;

  if (!clientId || !secret) {
    throw new Error("Knot credentials are missing. Set KNOT_CLIENT_ID and KNOT_CLIENT_SECRET.");
  }

  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
}
```

### API Base URL

```js
function knotBaseUrl() {
  if (process.env.KNOT_API_BASE) return process.env.KNOT_API_BASE.replace(/\/$/, "");

  const environment = process.env.KNOT_ENVIRONMENT || "development";
  if (environment === "production") return "https://production.knotapi.com";
  return "https://development.knotapi.com";
}
```

### Shared Fetch Wrapper

```js
async function knotRequest(path, body, { timeoutMs = 30_000 } = {}) {
  const response = await fetch(`${knotBaseUrl()}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Authorization": knotBasicAuthHeader(),
      "Content-Type": "application/json",
      "Knot-Version": "2.0"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.error_message || data?.message || text || "Unknown Knot error";
    const code = data?.error_code || response.status;
    throw new Error(`Knot API ${code}: ${message}`);
  }

  return data;
}
```

## API Authentication And Versioning

### Required Headers

```http
Authorization: Basic <base64(client_id:secret)>
Content-Type: application/json
Knot-Version: 2.0
```

### What Can Change Without Breaking Us

Knot considers these kinds of changes backwards compatible:

- New endpoints
- New optional request fields
- New response fields
- New enum values
- New webhook events
- New webhook payload fields
- Changed human-readable strings

Implementation implication: webhook and response handlers should ignore unknown fields and unknown event types safely. Do not switch exhaustively in a way that throws on new events.

## Merchant Discovery

Before presenting merchants or hardcoding merchant IDs, call `POST /merchant/list`.

For Shopping, use:

```js
async function listShoppingMerchants({ platform = "web", search } = {}) {
  return knotRequest("/merchant/list", {
    type: "shopping",
    platform,
    ...(search ? { search } : {})
  });
}
```

Shape to expect conceptually:

```json
{
  "id": 45,
  "name": "Walmart",
  "category": "Online shopping",
  "logo": "https://...",
  "min_sdk_version": "1.0.2"
}
```

Important details:

- Merchant IDs are static across environments.
- The Shopping quickstart points to Walmart as a fast-start merchant with `merchant_id: 45`.
- Do not store only merchant names in our domain model. Store `merchant_id` plus display metadata.
- The docs show examples with different numeric merchant IDs in different pages. Treat docs examples as examples, not app constants. Use List Merchants as the source of truth.

## Sessions

Sessions are used to initialize the client SDK.

### Session Types

| Type | Meaning | App usage |
| --- | --- | --- |
| `link` | Merchant account linking. | Required for Shopping merchant account setup. |
| `vault` | Digital wallet vaulting, with unified flow supporting card switching where applicable. | Possible payment setup flow. |
| `card_switcher` | Switches a card at a merchant. | Not the main Shopping checkout flow. |
| `transaction_link` | Transaction connection. | Not required for current pantry checkout flow. |

### Create A Shopping Link Session

Use this when the user opens the SDK to link a merchant account for Shopping.

```js
async function createShoppingLinkSession({ externalUserId, patientId, caretakerId }) {
  const result = await knotRequest("/session/create", {
    type: "link",
    external_user_id: externalUserId,
    metadata: {
      patient_id: patientId,
      caretaker_id: caretakerId,
      flow: "shopping_link"
    }
  });

  return result.session;
}
```

### Create A Vaulting Session

Use this only if the app is implementing wallet/card setup through Vaulting.

```js
async function createVaultSession({ externalUserId, patientId, cardId }) {
  const result = await knotRequest("/session/create", {
    type: "vault",
    external_user_id: externalUserId,
    ...(cardId ? { card_id: cardId } : {}),
    metadata: {
      patient_id: patientId,
      flow: "payment_vault"
    }
  });

  return result.session;
}
```

### Extend A Session

The Web SDK can emit a refresh-session event while the user is inside the SDK. Extend only while the SDK remains open. If the SDK is closed, create a fresh session on next open.

```js
async function extendKnotSession(sessionId) {
  const result = await knotRequest("/session/extend", {
    session_id: sessionId
  });

  return result.session;
}
```

### Metadata Rules

Metadata can be attached server-side during session creation and client-side when opening the SDK. It is echoed into webhook payloads.

Rules:

- Maximum 10 keys.
- Values must be strings.
- Values are limited to 500 characters.
- Client-side metadata can override duplicate server-side keys.

For this app, useful metadata:

```json
{
  "patient_id": "patient-row-id",
  "caretaker_id": "caretaker-row-id",
  "proposal_id": "purchase-proposal-id",
  "flow": "shopping_link"
}
```

Do not place secrets in metadata. It is for correlation, not credential storage.

## Web SDK

The Web SDK is client-side. It launches Knot's merchant login UX.

### Install

NPM:

```bash
npm install knotapi-js@next --save
```

CDN:

```html
<script src="https://unpkg.com/knotapi-js@next"></script>
```

The docs recommend updating the SDK frequently because merchant login conversion can improve with SDK updates.

### Backend Route For SDK Init

The browser should ask our backend for a fresh session each time the SDK is opened.

```js
// Directional example for a future route:
// POST /api/knot/session
async function createKnotSessionHandler(request, response) {
  const { patientId, merchantId, flow } = await readJson(request);

  const patient = await loadPatientForCurrentCaretaker(patientId);
  const externalUserId = patient.knotExternalUserId || `patient:${patient.id}`;

  const session = flow === "vault"
    ? await createVaultSession({ externalUserId, patientId: patient.id })
    : await createShoppingLinkSession({
        externalUserId,
        patientId: patient.id,
        caretakerId: request.currentCaretaker.id
      });

  json(response, 200, {
    sessionId: session,
    clientId: process.env.KNOT_WEB_CLIENT_ID || process.env.KNOT_CLIENT_ID,
    environment: process.env.KNOT_ENVIRONMENT || "development",
    merchantIds: merchantId ? [Number(merchantId)] : undefined
  });
}
```

### Browser SDK Launch

```js
async function openKnotForMerchantLink({ patientId, merchantId }) {
  const init = await fetch("/api/knot/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientId,
      merchantId,
      flow: "shopping_link"
    })
  }).then((r) => r.json());

  const KnotapiJS = window.KnotapiJS.default;
  const knotapi = new KnotapiJS();

  knotapi.open({
    sessionId: init.sessionId,
    clientId: init.clientId,
    environment: init.environment,
    merchantIds: init.merchantIds,
    entryPoint: "patient_payment_setup",
    useCategories: true,
    useSearch: true,
    metadata: {
      patient_id: patientId,
      merchant_id: String(merchantId)
    },
    locale: "en-US",
    onSuccess: (details) => {
      console.log("Knot success", details);
    },
    onError: (errorCode, errorDescription) => {
      console.error("Knot SDK error", errorCode, errorDescription);
    },
    onExit: () => {
      console.log("Knot SDK closed");
    },
    onEvent: async (event, merchant, merchantIdFromSdk, payload, taskId) => {
      console.log("Knot event", { event, merchant, merchantIdFromSdk, payload, taskId });

      if (event === "REFRESH_SESSION_REQUEST") {
        await fetch("/api/knot/session/extend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: init.sessionId })
        });
      }
    }
  });
}
```

### SDK Options We Care About

| Option | Use |
| --- | --- |
| `sessionId` | Fresh session from backend. |
| `clientId` | Public client ID for current environment. |
| `environment` | `development` or `production`; must match session. |
| `merchantIds` | Use one merchant ID for a focused link flow. Shopping docs require a merchant ID for `type: link` session initialization. |
| `entryPoint` | Analytics/correlation, returned in `AUTHENTICATED` webhook. |
| `useCategories` | Keep true unless UX intentionally removes categories. |
| `useSearch` | Keep true unless UX intentionally removes search. |
| `metadata` | Correlation fields. |
| `locale` | Supported values in docs: `en-US`, `es-US`. |

### SDK Event Names

The Web SDK can emit:

- `REFRESH_SESSION_REQUEST`
- `MERCHANT_CLICKED`
- `LOGIN_STARTED`
- `AUTHENTICATED`
- `OTP_REQUIRED`
- `QUESTIONS_REQUIRED`
- `APPROVAL_REQUIRED`
- `ZIPCODE_REQUIRED`
- `LICENSE_REQUIRED`

Use client events for UI telemetry. Use webhooks for backend state truth.

### SDK Error Codes To Handle

| Error | Likely issue |
| --- | --- |
| `INVALID_SESSION` | Session does not exist or environment mismatch. |
| `EXPIRED_SESSION` | Session is older than 30 minutes. Create a new one. |
| `INVALID_CLIENT_ID` | Client ID does not match environment. |
| `INTERNAL_ERROR` | Retry with a fresh session. |
| `MERCHANT_ID_NOT_FOUND` | Session type requires a merchant ID. |
| `INVALID_CARD_NAME` | Optional customer config is not allowlisted. |
| `INVALID_CUSTOMER_NAME` | Optional customer config is not allowlisted. |
| `INVALID_LOGO_ID` | Optional logo ID is not allowlisted. |
| `INVALID_LOCALE` | Locale is unsupported or malformed. |

## Vaulting

Vaulting lets a user vault a digital wallet into a merchant account. Knot's unified vault flow can also support card switching, depending on merchant capability.

For this app, Vaulting is adjacent to but separate from Shopping:

- Use Vaulting if we need the patient/caretaker to set a payment method inside merchant accounts.
- Shopping still needs a linked merchant account and still uses `Sync Cart` and `Checkout`.
- The Vaulting webhooks are `VAULTING_SUCCEEDED` and `VAULTING_FAILED`.
- Unified flow may also produce card-switching webhooks such as `CARD_UPDATED` and `CARD_FAILED`.

Do not confuse `knot_card_token` in the current local schema with the Shopping checkout contract. Shopping checkout uses `external_user_id`, `merchant_id`, and optional `payment_method`. It does not use the current repo's `card_token` body shape.

## Shopping Flow

### Prerequisite: Merchant Account Linked

Before `POST /cart` or `POST /cart/checkout` will work, the user's merchant account must be linked and connected.

The linking path is:

1. List supported Shopping merchants.
2. Create `type: "link"` session.
3. Open Web SDK with the session and a target merchant ID.
4. User authenticates to the merchant.
5. Receive `AUTHENTICATED` webhook.
6. Store merchant account state locally.

### Development Shortcut

In development, use `POST /development/accounts/link` to bypass the SDK.

```js
async function devLinkShoppingAccount({ externalUserId, merchantId }) {
  return knotRequest("/development/accounts/link", {
    external_user_id: externalUserId,
    merchant_id: Number(merchantId)
  });
}
```

If testing card switching through this dev endpoint, pass `card_switcher: true` and a `card_id`. For Shopping-only testing, we should keep the body focused on `external_user_id` and `merchant_id`.

### Sync Cart

Use `POST /cart`.

Required fields:

- `external_user_id`
- `merchant_id`
- `products`

Each product needs a merchant product `external_id`.

```js
async function syncKnotCart({ externalUserId, merchantId, products, deliveryLocation, simulate }) {
  return knotRequest("/cart", {
    external_user_id: externalUserId,
    merchant_id: Number(merchantId),
    products: products.map((product) => ({
      external_id: String(product.externalId),
      ...(product.fulfillmentId
        ? { fulfillment: { id: product.fulfillmentId } }
        : {})
    })),
    ...(deliveryLocation ? { delivery_location: deliveryLocation } : {}),
    ...(simulate ? { simulate } : {})
  });
}
```

Example app input after mapping proposal items to merchant products:

```js
await syncKnotCart({
  externalUserId: "patient:local-patient-id",
  merchantId: 45,
  products: [
    { externalId: "merchant-product-id-for-milk" },
    { externalId: "merchant-product-id-for-bananas" }
  ],
  deliveryLocation: {
    address_line_1: "123 Example St",
    city: "Princeton",
    region: "NJ",
    postal_code: "08540",
    country: "US"
  }
});
```

Important:

- `202` response means accepted, not done.
- Wait for `SYNC_CART_SUCCEEDED` before checkout.
- If delivery is needed and the cart sync webhook does not return a usable delivery location/cart state, do not proceed to checkout.
- To update address or fulfillment, call `POST /cart` again with updated values.

### Checkout

Use `POST /cart/checkout`.

Required fields:

- `external_user_id`
- `merchant_id`

Optional:

- `payment_method`
- `simulate: "failed"` in development

```js
async function checkoutKnotCart({ externalUserId, merchantId, paymentMethod, simulate }) {
  return knotRequest("/cart/checkout", {
    external_user_id: externalUserId,
    merchant_id: Number(merchantId),
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    ...(simulate ? { simulate } : {})
  });
}
```

The response is still async:

```json
{
  "message": "Success"
}
```

Treat this as `checkout_requested`, not `checkout_succeeded`.

### Order Confirmation

After `CHECKOUT_SUCCEEDED`, use the transaction IDs from the webhook and call Get Transaction By ID for each transaction. That data should feed the dashboard's order confirmation event.

Directional helper:

```js
async function getKnotTransactionById(transactionId) {
  const response = await fetch(`${knotBaseUrl()}/transactions/${encodeURIComponent(transactionId)}`, {
    method: "GET",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Authorization": knotBasicAuthHeader(),
      "Knot-Version": "2.0"
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Knot transaction lookup failed: ${data?.error_message || response.status}`);
  }
  return data;
}
```

Confirm the final transaction endpoint path against the current docs before implementing. The docs link this from Shopping as "Get Transaction By Id" under Transaction Link.

## Webhooks

Webhooks are the backend source of truth. SDK callbacks are useful telemetry, but they should not be the only thing that changes database state.

### Configure In Knot Dashboard

Configure separate webhook URLs per environment:

```text
Development: https://dev.example.com/api/knot/webhooks
Production:  https://app.example.com/api/knot/webhooks
```

Knot allows multiple webhook URLs per environment. HTTPS endpoints must have valid SSL certificates. Knot docs also list a source IP, but they warn it can change, so use IP allowlisting only as defense-in-depth, not the only verification mechanism.

### Webhook Verification

Knot sends `Knot-Signature`. Verification is optional in docs, but for this app it should be required in production.

The docs describe building an HMAC-SHA256 signature over selected headers/body fields:

- `Content-Length`
- `Content-Type`
- `Encryption-Type`
- `event`
- `session_id` when present

The string is built by concatenating keys and values with `|`, then HMAC-SHA256 using the Knot client secret, base64 encoded.

Directional Node helper:

```js
import crypto from "node:crypto";

function verifyKnotWebhookSignature({ headers, body }) {
  const received = headers["knot-signature"] || headers["Knot-Signature"];
  if (!received) return false;

  const values = {
    "Content-Length": headers["content-length"] || headers["Content-Length"],
    "Content-Type": headers["content-type"] || headers["Content-Type"],
    "Encryption-Type": headers["encryption-type"] || headers["Encryption-Type"],
    event: body.event
  };

  if (body.session_id) {
    values.session_id = body.session_id;
  }

  const signatureInput = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .flatMap(([key, value]) => [key, String(value)])
    .join("|");

  const expected = crypto
    .createHmac("sha256", process.env.KNOT_CLIENT_SECRET)
    .update(signatureInput)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
```

Implementation note: signature verification often depends on exact raw body and headers. When adding this to `src/app.mjs`, preserve the raw request body for the webhook route before parsing JSON.

### Webhook Handler Skeleton

```js
async function handleKnotWebhook(request, response) {
  const rawBody = await readRawBody(request);
  const payload = JSON.parse(rawBody);

  const valid = verifyKnotWebhookSignature({
    headers: request.headers,
    body: payload
  });

  if (process.env.NODE_ENV === "production" && !valid) {
    json(response, 401, { error: "Invalid Knot signature" });
    return;
  }

  await storeWebhookEventIdempotently(payload);

  switch (payload.event) {
    case "AUTHENTICATED":
      await markMerchantAccountConnected(payload);
      break;
    case "SYNC_CART_SUCCEEDED":
      await markCartSyncedAndRequestCheckout(payload);
      break;
    case "SYNC_CART_FAILED":
      await markCartSyncFailed(payload);
      break;
    case "CHECKOUT_SUCCEEDED":
      await markCheckoutSucceeded(payload);
      break;
    case "CHECKOUT_FAILED":
      await markCheckoutFailed(payload);
      break;
    case "ACCOUNT_LOGIN_REQUIRED":
      await markMerchantAccountDisconnected(payload);
      break;
    case "MERCHANT_STATUS_UPDATE":
      await refreshMerchantAvailability(payload);
      break;
    default:
      await recordUnhandledKnotEvent(payload);
      break;
  }

  json(response, 200, { ok: true });
}
```

### Retry Behavior

Knot retries webhooks if:

- Our endpoint returns non-200.
- Our endpoint does not respond within 10 seconds.

Docs state retries happen up to two times with a few minutes between attempts.

Implementation implication:

- Always return 200 after successfully persisting the webhook.
- Make processing idempotent.
- Do not do slow downstream work before acknowledging unless it is required for correctness.
- Store the payload first, then process either inline quickly or via a worker.

### Idempotency

Webhook handlers should tolerate duplicates. Suggested local table:

```sql
create table knot_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  session_id text,
  task_id text,
  external_user_id text,
  merchant_id int,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event, session_id, task_id)
);
```

If `task_id` is absent for a given event, use a fallback idempotency key derived from event, session, merchant, timestamp bucket, or the raw payload hash.

## Webhook Events We Need

| Event | Meaning | Local action |
| --- | --- | --- |
| `AUTHENTICATED` | User linked/authenticated merchant account. | Store merchant account as connected for `external_user_id` + `merchant_id`. |
| `SYNC_CART_SUCCEEDED` | Products were added to merchant cart. | Mark cart sync success; store cart/pricing/fulfillment details; request checkout if proposal still approved. |
| `SYNC_CART_FAILED` | Cart sync failed. | Mark proposal/checkout failed or retryable; create dashboard event. |
| `CHECKOUT_SUCCEEDED` | Merchant checkout succeeded. | Mark checkout success; fetch transaction details; mark proposal completed. |
| `CHECKOUT_FAILED` | Merchant checkout failed. | Mark checkout failed; leave proposal retryable or failed per product decision. |
| `ACCOUNT_LOGIN_REQUIRED` | Merchant account disconnected or needs login. | Pause checkout; ask caretaker to reconnect. |
| `MERCHANT_STATUS_UPDATE` | Merchant availability changed. | Refresh merchant list/cache. |
| `VAULTING_SUCCEEDED` | Digital wallet vaulted. | Mark payment setup complete if we use Vaulting. |
| `VAULTING_FAILED` | Digital wallet vaulting failed. | Mark payment setup failed. |
| `CARD_UPDATED` | Card switch succeeded in unified/card switcher flow. | Store card setup status if used. |
| `CARD_FAILED` | Card switch failed. | Ask caretaker to retry. |

## Suggested Supabase Model

Current repo has:

- `purchase_proposals`
- `checkout_sessions`
- `payment_cards`
- `events`

Knot-aligned implementation likely needs:

```text
knot_merchant_accounts
  patient_id
  external_user_id
  merchant_id
  merchant_name
  status: connected | disconnected | login_required
  last_authenticated_at

knot_cart_syncs
  proposal_id
  patient_id
  external_user_id
  merchant_id
  status: pending | accepted | synced | failed
  request_payload
  webhook_payload

checkout_sessions
  proposal_id
  patient_id
  merchant_id
  status: pending_cart_sync | cart_synced | checkout_requested | success | failed | login_required
  knot_session_id
  knot_task_id
  transaction_ids
  error_message

knot_webhook_events
  event
  session_id
  task_id
  payload
  processed_at
```

## Mapping Proposal Items To Knot Products

This is the biggest product/data gap.

Our Gemini output currently produces human item names and quantities:

```json
[
  { "name": "Milk", "quantity": 1 },
  { "name": "Bananas", "quantity": 6 }
]
```

Knot Shopping `Sync Cart` requires merchant product `external_id` values:

```json
[
  { "external_id": "merchant-product-id-for-milk" },
  { "external_id": "merchant-product-id-for-bananas" }
]
```

Therefore, before full real Shopping checkout, we need one of these strategies:

1. Maintain a curated product catalog for demo items and supported merchants.
2. Add a product search/discovery integration if Knot or merchant APIs expose one.
3. Let caretakers map inventory items to merchant product IDs during setup.
4. For hackathon demo, seed known Walmart product IDs for pantry staples.

Recommended demo approach: curated seed mapping per merchant.

Example local mapping:

```js
const PANTRY_PRODUCT_MAP = {
  Walmart: {
    milk: { externalId: "walmart-product-id-milk", label: "Whole Milk" },
    bananas: { externalId: "walmart-product-id-bananas", label: "Bananas" },
    oatmeal: { externalId: "walmart-product-id-oatmeal", label: "Oatmeal" }
  }
};

function mapProposalItemsToKnotProducts({ merchantName, items }) {
  const catalog = PANTRY_PRODUCT_MAP[merchantName] || {};

  return items.map((item) => {
    const key = String(item.name || "").toLowerCase();
    const mapped = catalog[key];
    if (!mapped) {
      throw new Error(`No Knot product mapping for ${item.name} at ${merchantName}`);
    }
    return {
      externalId: mapped.externalId,
      sourceItem: item
    };
  });
}
```

## End-To-End Flow For This App

### Setup: Link Merchant Account

```text
Caretaker opens patient setup
  -> frontend lists supported Shopping merchants
  -> caretaker selects Walmart
  -> backend creates type=link session
  -> frontend opens Knot SDK
  -> user logs into merchant account
  -> Knot sends AUTHENTICATED webhook
  -> backend stores knot_merchant_accounts.connected
```

### Runtime: Approve Pantry Proposal

```text
Gemini pantry analysis creates purchase_proposals row
  -> caretaker clicks Approve
  -> backend validates merchant account is connected
  -> backend maps proposal items to merchant product external IDs
  -> backend creates checkout_sessions row: pending_cart_sync
  -> worker/backend calls POST /cart
  -> checkout_sessions row: cart_sync_requested
  -> webhook SYNC_CART_SUCCEEDED
  -> checkout_sessions row: cart_synced
  -> backend calls POST /cart/checkout
  -> checkout_sessions row: checkout_requested
  -> webhook CHECKOUT_SUCCEEDED
  -> checkout_sessions row: success
  -> purchase_proposals row: completed
  -> events row: checkout success
```

### Failure: Account Disconnected

```text
POST /cart or /cart/checkout fails
  OR ACCOUNT_LOGIN_REQUIRED webhook arrives
  -> merchant account status: login_required
  -> checkout session status: login_required
  -> dashboard prompts caretaker to reconnect
  -> caretaker launches SDK again
```

## Future Implementation Checklist

### Backend

- Add a Knot API client that uses:
  - `https://development.knotapi.com` or `https://production.knotapi.com`
  - Basic auth
  - `Knot-Version: 2.0`
  - `/merchant/list`
  - `/session/create`
  - `/session/extend`
  - `/development/accounts/link`
  - `/cart`
  - `/cart/checkout`
- Replace synchronous `knotPlaceOrder` semantics with async workflow methods:
  - `requestCartSync`
  - `requestCheckout`
  - `handleKnotWebhook`
- Add request timeouts and structured error mapping.
- Do not log session IDs, secrets, raw auth headers, or merchant login data.

### Frontend

- Add merchant linking UI in patient setup.
- Load Web SDK with `knotapi-js@next`.
- Request a fresh session from backend each SDK launch.
- Pass `entryPoint`.
- Handle SDK errors clearly.
- Treat SDK `AUTHENTICATED` as UI progress only; wait for webhook-backed state for persistence.

### Database

- Add merchant account state.
- Add cart sync state.
- Add webhook event store for idempotency.
- Expand checkout sessions to model pending cart sync, cart synced, checkout requested, success, failed, login required.
- Store `merchant_id`, not just merchant name.
- Store product `external_id` mapping per inventory item or proposal item.

### Worker

- Poll approved proposals that have connected merchant accounts and mapped products.
- Request cart sync.
- Let webhook handler or worker progress checkout after cart sync success.
- Retry only idempotently.
- Avoid duplicate checkout requests.

### Webhooks

- Add `/api/knot/webhooks`.
- Preserve raw body for signature verification.
- Verify signature in production.
- Store every payload first.
- Process idempotently.
- Return 200 quickly after durable persistence.

### Tests

- Unit test Basic auth header and base URL selection.
- Unit test `knotRequest` error parsing.
- Unit test `createShoppingLinkSession` request body.
- Unit test merchant listing request body.
- Unit test cart sync request body.
- Unit test checkout request body.
- Unit test webhook signature verification with a known sample fixture.
- Integration test webhook `AUTHENTICATED` -> merchant account connected.
- Integration test `SYNC_CART_SUCCEEDED` -> checkout requested.
- Integration test `CHECKOUT_SUCCEEDED` -> checkout session success and proposal completed.
- Integration test duplicate webhook -> no duplicate checkout/event rows.
- Error test `ACCOUNT_LOGIN_REQUIRED` -> proposal pauses and dashboard event is created.

## Current Repo Mismatches

The current implementation in `services/worker/knot-client.mjs` does not match the docs.

| Current code | Docs-correct shape |
| --- | --- |
| Base URL defaults to `https://api.knotapi.com`. | Use `https://development.knotapi.com` or `https://production.knotapi.com`. |
| Uses `Authorization: Bearer <base64>`. | Use HTTP Basic auth: `Authorization: Basic <base64(client_id:secret)>`. |
| Calls `/shopping/checkout`. | Use `/cart` for sync and `/cart/checkout` for checkout. |
| Sends `{ merchant, card_token, items: [{ name, quantity }] }`. | Send `{ external_user_id, merchant_id, products: [{ external_id }] }`. |
| Treats success response as completed order. | Treat `202` as accepted/pending; wait for webhooks. |
| Uses `cardToken` as core payment input. | Shopping checkout uses linked merchant account and optional `payment_method`. |
| No webhook lifecycle. | Webhooks drive authenticated, cart synced, checkout succeeded/failed, login required. |

`services/worker/knot-checkout.mjs` also needs rework later because it currently marks proposal success inside the same call path as the API request. It should mark pending states first and wait for webhook confirmation.

`tests/knot-checkout.test.mjs` currently validates the old behavior. Those tests should be replaced or rewritten when the implementation changes.

## Development Testing Strategy

For fast local and EC2 development:

1. Configure Knot development credentials in ignored env files.
2. Configure a development webhook URL in the Knot Dashboard.
3. Use `POST /development/accounts/link` to link a test merchant account without launching the SDK.
4. Call `POST /cart` with `simulate: "failed"` to test failed cart sync where needed.
5. Call `POST /cart/checkout` with `simulate: "failed"` to test failed checkout where needed.
6. Use different `external_user_id` values per test user to avoid conflicting simultaneous operations.
7. Wait for webhooks before asserting final state.

Development link example:

```js
await devLinkShoppingAccount({
  externalUserId: "patient:test-user-001",
  merchantId: 45
});
```

Cart failure simulation:

```js
await syncKnotCart({
  externalUserId: "patient:test-user-001",
  merchantId: 45,
  products: [{ externalId: "merchant-product-id" }],
  simulate: "failed"
});
```

Checkout failure simulation:

```js
await checkoutKnotCart({
  externalUserId: "patient:test-user-001",
  merchantId: 45,
  simulate: "failed"
});
```

## Error Handling Model

Knot API error responses use structured fields such as:

- `error_type`
- `error_code`
- `error_message`

Known categories across docs include:

- `INVALID_INPUT`
- `INVALID_REQUEST`
- `USER_ERROR`
- `SESSION_ERROR`
- `MERCHANT_ACCOUNT_ERROR`
- `MERCHANT_ERROR`
- `SUBSCRIPTION_ERROR`
- `TRANSACTION_ERROR`
- `CART_ERROR`

Known error codes include:

- `INVALID_API_KEYS`
- `INVALID_FIELD`
- `USER_NOT_FOUND`
- `MERCHANT_ACCOUNT_NOT_FOUND`
- `MERCHANT_ACCOUNT_DISCONNECTED`
- `SESSION_NOT_FOUND`
- `MERCHANT_UNAVAILABLE`
- `NO_ACCESS`
- `TRANSACTION_NOT_FOUND`
- `ONGOING_OPERATION`
- `CART_NOT_FOUND`
- `FULFILLMENT_NOT_FOUND`

Our app should map these into user-facing states:

| Knot issue | Local state | User message |
| --- | --- | --- |
| Invalid credentials | system_error | "Knot credentials are not configured correctly." |
| Merchant account disconnected | login_required | "Reconnect the merchant account before ordering." |
| Merchant unavailable | failed_retryable | "Merchant is temporarily unavailable." |
| Cart not found | failed_retryable | "Cart could not be found. Try syncing again." |
| Fulfillment not found | needs_review | "Selected pickup/delivery option is no longer available." |
| Ongoing operation | pending | "A Knot operation is already in progress." |

## Security Rules

- Never expose `KNOT_CLIENT_SECRET` to browser JavaScript.
- Never log Basic auth headers.
- Never log raw merchant login details.
- Never commit `.env`, `apps/*.env`, `scripts/.deploy.env`, or live webhook payloads.
- Verify webhook signatures in production.
- Store only correlation metadata needed for our app.
- Do not put patient health details into Knot metadata. Use opaque IDs.
- Treat webhook payloads as external input. Validate event type, merchant ID, external user ID, and expected local state before mutating rows.
- Use timing-safe signature comparison.
- Make webhook processing idempotent.

## Operational Notes

- Create a new SDK session each time the user opens Knot.
- Extend a session only when the SDK emits `REFRESH_SESSION_REQUEST` while still open.
- Keep SDK version current because Knot releases updates that can improve merchant login flows.
- Configure domain allowlisting in Knot Dashboard for Web SDK when available.
- Webhook endpoint must be reachable from Knot's development and production environments.
- Localhost cannot receive Knot webhooks without tunneling.
- Use HTTPS for real webhook testing.
- PM2 deployment must load env files correctly. See `docs/solutions/workflow-issues/pm2-worker-stale-ecosystem-config-not-deployed-2026-04-19.md`.

## Minimal Future File Map

This is not implemented yet. It is the likely destination architecture.

```text
src/app.mjs
  POST /api/knot/session
  POST /api/knot/session/extend
  POST /api/knot/webhooks
  GET  /api/knot/merchants?type=shopping

services/worker/knot-client.mjs
  knotRequest
  listShoppingMerchants
  createShoppingLinkSession
  extendKnotSession
  devLinkShoppingAccount
  syncKnotCart
  checkoutKnotCart

services/worker/knot-checkout.mjs
  findApprovedProposalsReadyForCartSync
  requestCartSyncForProposal
  requestCheckoutAfterCartSync

src/supabase-store.mjs
  persist merchant account state
  persist cart sync state
  persist webhook event idempotently

public/patient.js
  launch Knot SDK for merchant linking/payment setup

tests/knot-client.test.mjs
tests/knot-webhook.test.mjs
tests/knot-checkout.test.mjs
```

## Implementation Readiness Checklist

Before writing real Knot code, confirm:

- [ ] We have Knot development `client_id` and `secret`.
- [ ] We know whether Shopping access is enabled for our Knot account.
- [ ] We can call `POST /merchant/list` with `type: "shopping"`.
- [ ] We have a selected merchant ID for the demo.
- [ ] We have product `external_id` values for pantry staples.
- [ ] We have a reachable webhook endpoint.
- [ ] We have webhook signature verification fixtures or can produce a known-good sample.
- [ ] We have a local schema plan for merchant account and cart/checkout state.
- [ ] We have frontend UX for "connect merchant account" and "reconnect merchant account".
- [ ] We have decided whether Vaulting is required for the demo or can be deferred.

## Bottom Line For This Repo

The Knot implementation should be rebuilt around these principles:

1. Use Knot as an async merchant connectivity platform, not a synchronous order API.
2. Link merchant accounts before cart sync.
3. Store merchant IDs and product external IDs.
4. Sync cart first, checkout second.
5. Let webhooks drive final local state.
6. Implement idempotency before production testing.
7. Keep all credentials server-side.

