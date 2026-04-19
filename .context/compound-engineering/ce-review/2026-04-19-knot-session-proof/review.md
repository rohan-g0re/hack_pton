# CE Review: Knot Session Proof Harness

Mode: autofix
Plan: `docs/plans/2026-04-19-015-fix-knot-session-proof-plan.md`
Date: 2026-04-19

## Scope

Reviewed the proof harness work for the Knot SDK session fix:

- `scripts/prove-knot-session.mjs`
- `package.json`
- `docs/plans/2026-04-19-015-fix-knot-session-proof-plan.md`

Related pre-existing/fixed session files were used as context:

- `src/app.mjs`
- `services/worker/knot-client.mjs`
- `public/patient.js`
- `tests/knot-checkout.test.mjs`

## Findings

No actionable findings.

## Requirements Completeness

- [x] R1. Prove the app route maps order-history sessions to Knot `transaction_link`.
- [x] R2. Prove the server never sends invalid `merchant_ids` in the Knot `/session/create` body.
- [x] R3. Prove the browser entry point requests `purpose: "order_history"`.
- [x] R4. Provide a one-command proof path that works around `node --test` `spawn EPERM`.
- [x] R5. Preserve the existing focused regression test coverage.

## Applied Fixes

None. No safe-auto fixes were needed.

## Residual Risks

- The proof stubs Knot and does not prove live Amazon authentication or live Knot account status.
- Production remains unproven until the updated app is deployed/restarted and the SDK flow is clicked.

## Testing

- `node scripts\prove-knot-session.mjs`: passed
- `npm.cmd run prove:knot`: passed
- `node tests\knot-checkout.test.mjs`: passed
- `node --check scripts\prove-knot-session.mjs`: passed
- `node --check services\worker\knot-client.mjs`: passed
- `node --check src\app.mjs`: passed
- `node --check public\patient.js`: passed
- `npm.cmd test`: blocked by environment-level `spawn EPERM` from Node's test runner child-process spawning

## Verdict

Ready with known live-verification caveat.
