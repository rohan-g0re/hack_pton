---
title: "Knot API Integration Documentation"
type: feat
status: active
date: 2026-04-19
---

# Knot API Integration Documentation Plan

## Overview

Create one comprehensive Markdown document that explains the Knot API documentation the team reviewed and translates it into this app's implementation model. The document should be useful as a handoff artifact for future implementation: it must summarize Knot's Web SDK, Shopping, Vaulting, merchant listing, sessions, authentication, webhook lifecycle, testing behavior, and the changes this codebase needs to make to align with the official docs.

## Problem Frame

The current app concept depends on Knot for caregiver-approved grocery replenishment. The repository already has a `services/worker/knot-client.mjs` and `services/worker/knot-checkout.mjs`, but the existing client treats Knot as a synchronous one-step checkout API. The docs show that Shopping is an asynchronous merchant-account flow:

1. User links an existing merchant account through the Knot SDK or development-only link endpoint.
2. Backend syncs products into the user's merchant cart.
3. Backend triggers checkout.
4. Backend marks local checkout state only after webhook confirmation.

The requested output is documentation, not implementation code. The doc should make the correct flow unambiguous before code is changed.

## Requirements Trace

- R1. Produce one single documentation file that consolidates all Knot documentation provided and reviewed.
- R2. Include practical code snippets for the key flows, adapted to this Node/Supabase app.
- R3. Explain how each Knot concept maps to this project's caregiver/patient/pantry use case.
- R4. Explicitly document current mismatches in `services/worker/knot-client.mjs` so the implementation can be corrected later.
- R5. Include security and operational guidance: Basic auth, no client-side secrets, webhook verification, idempotency, async state transitions, and development testing behavior.
- R6. Keep examples sanitized: no live client IDs, secrets, EC2 IPs, account IDs, or real user data.

## Scope Boundaries

- This work creates documentation only.
- This work does not modify the Knot runtime implementation.
- This work does not add database migrations or webhook endpoints.
- This work does not submit feedback to Knot docs unless a concrete actionable issue is discovered during documentation.

### Deferred to Separate Tasks

- Correcting `services/worker/knot-client.mjs` and `services/worker/knot-checkout.mjs` to use `/cart`, `/cart/checkout`, Basic auth, `Knot-Version`, and webhook-driven status updates.
- Adding backend API routes for Knot session creation and webhook ingestion.
- Adding Supabase schema changes for merchant accounts, cart sync attempts, webhook events, and transaction records.
- Adding frontend Web SDK launch UI for merchant linking or wallet/card vaulting.

## Context & Research

### Relevant Code and Patterns

- `services/worker/knot-client.mjs`: current Knot client, currently not aligned with the official Shopping API contract.
- `services/worker/knot-checkout.mjs`: current checkout lifecycle, currently assumes synchronous success/failure.
- `src/supabase-store.mjs`: stores payment card token and proposal approval state.
- `public/patient.js` and `public/proposal-detail.js`: user-facing surfaces that may eventually launch merchant linking and display checkout progress.
- `tests/knot-checkout.test.mjs`: current tests encode the existing sandbox behavior and will need replacement when implementation changes.
- `.env.example` and `apps/workers.env.example`: current Knot credential placeholders.

### Institutional Learnings

- `docs/solutions/workflow-issues/pm2-worker-stale-ecosystem-config-not-deployed-2026-04-19.md`: environment changes must be explicitly loaded by PM2 ecosystem configs. Any future Knot env changes must be deployed through the same env propagation path.

### External References

- Knot docs index: `https://docs.knotapi.com/llms.txt`
- Web SDK: `https://docs.knotapi.com/sdk/web`
- Vaulting quickstart: `https://docs.knotapi.com/vaulting/quickstart`
- Shopping quickstart: `https://docs.knotapi.com/shopping/quickstart`
- Shopping testing: `https://docs.knotapi.com/shopping/testing`
- Authentication: `https://docs.knotapi.com/api-reference/authentication`
- List Merchants: `https://docs.knotapi.com/api-reference/merchants/list-merchants`
- Sync Cart: `https://docs.knotapi.com/api-reference/products/shopping/sync-cart`
- Checkout: `https://docs.knotapi.com/api-reference/products/shopping/checkout`
- Webhooks: `https://docs.knotapi.com/webhooks`
- Authenticated webhook: `https://docs.knotapi.com/link/webhook-events/authenticated`
- Shopping webhook events: `https://docs.knotapi.com/shopping/webhook-events/sync-cart-succeeded`, `https://docs.knotapi.com/shopping/webhook-events/checkout-succeeded`

## Key Technical Decisions

- Create a single doc at `docs/KNOT_API_INTEGRATION.md`: This keeps the requested "one single doc" easy to find and outside the plan directory.
- Prefer authored snippets over copied docs text: The doc should avoid large verbatim excerpts and instead provide project-specific examples.
- Treat Shopping as webhook-driven: The doc should repeatedly reinforce that `202` from Knot means "accepted", not "completed".
- Separate Shopping from Vaulting: Vaulting is relevant for payment method setup, but Shopping cart/checkout is the reorder flow.
- Mark implementation mismatches as "must fix later": The doc should avoid silently endorsing the current worker client.

## Output Structure

```text
docs/
  KNOT_API_INTEGRATION.md
```

## High-Level Technical Design

> This illustrates the intended documentation shape and is directional guidance for review, not implementation specification.

```text
Knot docs -> one repo doc
  -> mental model and product boundaries
  -> auth/versioning/env setup
  -> Web SDK merchant-linking flow
  -> Vaulting flow for payment method setup
  -> Shopping flow for pantry reorder
  -> webhook lifecycle and idempotency
  -> testing/development bypasses
  -> code snippets mapped to this app
  -> current repo gaps and future implementation checklist
```

## Implementation Units

- [x] **Unit 1: Create Consolidated Knot Documentation**

**Goal:** Create the single requested documentation artifact.

**Requirements:** R1, R2, R3, R5, R6

**Dependencies:** Plan file exists.

**Files:**
- Create: `docs/KNOT_API_INTEGRATION.md`

**Approach:**
- Start with the app-specific mental model: caregiver approves proposal, Knot operates on the patient's linked merchant account.
- Include endpoint tables, lifecycle diagrams, data mapping, and code snippets for Node fetch helpers, Web SDK launch, webhook verification, session creation, sync cart, checkout, and testing.
- Keep all credentials and IDs as placeholders.

**Patterns to follow:**
- Existing docs use Markdown with clear sections and concise code blocks.
- Use repo-relative paths when referencing code.

**Test scenarios:**
- Test expectation: none -- documentation-only unit.

**Verification:**
- `docs/KNOT_API_INTEGRATION.md` exists and contains a complete flow from merchant linking to webhook-confirmed checkout.

- [x] **Unit 2: Document Current Repo Mismatches and Future Implementation Checklist**

**Goal:** Ensure future code changes do not repeat the current incorrect assumptions.

**Requirements:** R4, R5

**Dependencies:** Unit 1.

**Files:**
- Modify: `docs/KNOT_API_INTEGRATION.md`

**Approach:**
- Add a section comparing current code behavior against the docs.
- Call out the wrong base URL, wrong auth shape, wrong endpoints, wrong request body shape, and synchronous status assumption.
- Add a future implementation checklist grouped by backend, frontend, database, webhooks, tests, and operations.

**Patterns to follow:**
- Reference exact repo paths, not absolute paths.

**Test scenarios:**
- Test expectation: none -- documentation-only unit.

**Verification:**
- The doc names the relevant current files and gives clear next steps without modifying implementation.

- [x] **Unit 3: Review Documentation for Security and Accuracy**

**Goal:** Ensure the doc is safe to commit and grounded in the provided Knot docs.

**Requirements:** R5, R6

**Dependencies:** Units 1 and 2.

**Files:**
- Modify: `docs/KNOT_API_INTEGRATION.md`

**Approach:**
- Check for accidental live secrets, public IPs, account IDs, or real-looking tokens.
- Check that code snippets use placeholders and environment variables only.
- Check that external source links are included.

**Patterns to follow:**
- Existing `.gitignore` work protects env files, but docs still need to be sanitized manually.

**Test scenarios:**
- Test expectation: none -- documentation-only unit.

**Verification:**
- Secret-pattern scan on the new doc returns no live-looking credentials.

## System-Wide Impact

- **Interaction graph:** No runtime behavior changes in this task. The doc describes future changes across frontend SDK launch, backend sessions, worker checkout, webhooks, and Supabase state.
- **Error propagation:** No code changes now. The future implementation should treat Knot `202` responses as pending and webhook failures as state transitions.
- **State lifecycle risks:** The doc should emphasize idempotent webhook handling and separate states for linked account, cart sync, checkout, and transaction detail retrieval.
- **API surface parity:** Future backend routes should be callable by both UI and agents where applicable.
- **Integration coverage:** Future implementation needs tests for session creation, cart sync, checkout acceptance, webhook success/failure, duplicate webhooks, and disconnected merchant account handling.
- **Unchanged invariants:** Existing UI and worker behavior are not changed by this documentation task.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Docs become too generic to guide implementation | Tie every section back to project files and caregiver/patient pantry flow. |
| Accidentally copying incorrect current implementation assumptions | Explicitly list current mismatches against Knot docs. |
| Including live credential-like values | Use placeholders and run a final credential scan on the new doc. |
| Knot docs may evolve | Include source links and date the doc so future maintainers know when it was synthesized. |

## Documentation / Operational Notes

- The new document is the handoff artifact for future Knot implementation.
- Do not commit real `KNOT_CLIENT_ID`, `KNOT_CLIENT_SECRET`, webhook secrets, merchant account IDs, or user credentials.
- If future implementation adds public webhook routes, deployment must include HTTPS and stable callback URLs configured in the Knot Dashboard.

## Sources & References

- User-provided Knot docs excerpts in chat.
- Official Knot docs listed under External References.
- Related code: `services/worker/knot-client.mjs`, `services/worker/knot-checkout.mjs`, `src/supabase-store.mjs`, `tests/knot-checkout.test.mjs`.
