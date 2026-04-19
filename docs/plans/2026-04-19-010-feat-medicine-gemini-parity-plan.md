---
title: "feat: Medicine module Gemini Robotics ER parity with pantry"
type: feat
status: completed
date: 2026-04-19
---

# Medicine Module — Gemini Robotics ER Parity with Pantry

## Overview

The pantry module is working end-to-end with Gemini Robotics ER 1.6 task orchestration.
The medicine module was written to mirror pantry exactly but has two bugs that
prevent clean output and one dead-code function that should be removed.
No medicine-specific snapshots have been captured with a real camera yet.

## Problem Frame

`services/worker/gemini-medicine.mjs` follows the same pattern as pantry:
- Fetches prescriptions from Supabase for the patient
- Injects them into a task-orchestration prompt
- Calls `callRoboticsER` with the image
- Model reasons → outputs `medication_taken / medication_not_taken / medication_uncertain` calls
- Worker maps calls to adherence status → writes `medication_checks` + `events` → notifies caretaker via Photon

Two bugs exist in the arg-extraction path for the `missed` and `partial` message strings (lines 114, 120)
that use `c.args[0]` on what may be an object, not an array.

## Requirements Trace

- R1. Medicine module fetches prescriptions from Supabase (by `patient_id`) before each Gemini call
- R2. Prescription list is injected into the task-orchestration prompt at call time
- R3. Gemini returns `medication_taken / medication_not_taken / medication_uncertain` function calls
- R4. Args are parsed correctly whether model returns array or named-object format
- R5. Adherence status (`taken / missed / partial / uncertain / outside_window`) is written to `medication_checks`
- R6. Caretaker is notified via Photon on `missed` or `partial` adherence
- R7. `medicine-analysis.mjs` dead code (`adherenceFromScene`) is removed

## Scope Boundaries

- No changes to `callRoboticsER` in `gemini-client.mjs` — already handles args format
- No changes to Supabase schema — `medication_checks` table already exists
- No changes to notification flow — Photon path already wired
- `prescriptionsDueNow` in `medicine-analysis.mjs` stays — still used for `due_prescriptions` field

## Context & Research

### Relevant Code and Patterns

- `services/worker/gemini-pantry.mjs` — working reference; medicine must mirror this exactly
- `services/worker/gemini-medicine.mjs` — already mirrors pantry; fix two arg-extraction bugs
- `services/worker/gemini-client.mjs` — `callRoboticsER` returns `{ reasoning, calls }`; args may be array or object
- `services/worker/medicine-analysis.mjs` — `prescriptionsDueNow` used; `adherenceFromScene` is dead code
- `services/worker/queue.mjs` — `startInterval` handles `GeminiRateLimitError` backoff

### Bugs to Fix

**Bug 1** — `gemini-medicine.mjs` lines 114, 120: `c.args[0]` fails when `args` is an object

```
// Wrong — crashes when args is {name: "...", reason: "..."}
calls.filter(c => c.function === "medication_not_taken").map(c => c.args[0])

// Right — handles both array and object
calls.filter(c => (c.function || c.name) === "medication_not_taken")
     .map(c => Array.isArray(c.args) ? c.args[0] : c.args?.name)
     .filter(Boolean).join(", ")
```

**Bug 2** — `medicine-analysis.mjs`: `adherenceFromScene` is exported but never imported anywhere
after the scene_id path was removed. Remove it (keep `prescriptionsDueNow`).

## Implementation Units

- [ ] **Unit 1: Fix arg-extraction bugs in gemini-medicine.mjs**

**Goal:** Make `missed` and `partial` adherence message strings work correctly when model returns named-object args

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Modify: `services/worker/gemini-medicine.mjs`

**Approach:**
- Lines 114 and 120 build a comma-separated list of missed medication names from function calls
- Replace `c.args[0]` with `Array.isArray(c.args) ? c.args[0] : c.args?.name`
- Apply same normalisation as the main parse loop (use `c.function || c.name` for the function name key)

**Test scenarios:**
- Happy path: model returns `[{"function":"medication_not_taken","args":["Vitamin D","full bottle"]}]` → message includes "Vitamin D"
- Edge case: model returns `[{"function":"medication_not_taken","args":{"name":"Vitamin D","reason":"full bottle"}}]` → message still includes "Vitamin D"
- Edge case: mixed array/object args across calls in same response → all names extracted correctly

**Verification:** Worker logs show medication names in the missed/partial message strings without undefined or crashes

---

- [ ] **Unit 2: Remove dead code from medicine-analysis.mjs**

**Goal:** Delete `adherenceFromScene` which is exported but never called since scene_id path was removed

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `services/worker/medicine-analysis.mjs`

**Approach:**
- Delete the `adherenceFromScene` function and its JSDoc
- Keep `prescriptionsDueNow` — still called in `gemini-medicine.mjs`
- Verify no other file imports `adherenceFromScene`

**Test scenarios:**
- Test expectation: none — pure dead code removal, no behavior change

**Verification:** `grep -r "adherenceFromScene"` returns no results

---

- [ ] **Unit 3: Deploy and verify end-to-end with medicine cam**

**Goal:** Confirm full medicine pipeline works with a real snapshot pointing at medication area

**Requirements:** R1–R6

**Dependencies:** Unit 1, Unit 2

**Files:**
- No code changes — deploy and observe

**Approach:**
- Run `bash scripts/deploy-workers.sh`
- Open `https://okaytoday.health/camera/medicine` in browser
- Point cam at a medicine/pill area and send a snapshot
- Tail worker logs: `ssh worker 'npx pm2 logs caretaker-worker --lines 0'`
- Confirm log output shows: Gemini reasoning paragraph, then function call array with `medication_taken/not_taken/uncertain`
- Confirm `medication_checks` row written in Supabase
- Confirm `events` row written with correct severity
- If medicine is not taken: confirm Photon notifier receives the call (check notifier logs)

**Test scenarios:**
- Happy path: camera points at pill organizer with empty morning slot → model calls `medication_taken`, adherence = "taken"
- Happy path: camera points at full pill bottle → model calls `medication_not_taken`, adherence = "missed", Photon notified
- Edge case: image doesn't show medication area → `calls.length === 0`, snapshot marked processed, no event created
- Integration: `medication_checks` row has `detected_pills` array matching model's function call names

**Verification:**
- Worker stdout shows `[medicine] Gemini reasoning:` and `[medicine] Function calls:` for each snapshot
- Zero `TypeError` crashes in error log
- Supabase `medication_checks` table has a row with `adherence_status` matching what the model reported

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Model returns empty calls for medicine images (wrong scene) | Already handled — marks processed and logs, does not crash |
| Prescriptions table is empty for patient | `prescriptions` array will be empty; prompt will list nothing; model likely returns `medication_uncertain` for all → handled |
| `medication_not_taken` name extraction produces empty string | Bug 1 fix covers this; verified by test scenario |
