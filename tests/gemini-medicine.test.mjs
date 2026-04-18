import test from "node:test";
import assert from "node:assert/strict";
import { adherenceFromScene, prescriptionsDueNow } from "../services/worker/medicine-analysis.mjs";
import { createSeedState } from "../src/demo-data.mjs";

test("adherence: taken vs missed vs uncertain", () => {
  const state = createSeedState();
  const due = state.prescriptions;

  const taken = state.scenes.medicine.find((s) => s.id === "medicine-taken");
  const outcomeTaken = adherenceFromScene(taken, due);
  assert.equal(outcomeTaken.adherence, "taken");

  const missed = state.scenes.medicine.find((s) => s.id === "medicine-missed");
  const outcomeMissed = adherenceFromScene(missed, due);
  assert.equal(outcomeMissed.adherence, "missed");

  const uncertain = state.scenes.medicine.find((s) => s.id === "medicine-uncertain");
  const outcomeUncertain = adherenceFromScene(uncertain, due);
  assert.equal(outcomeUncertain.adherence, "uncertain");
});

test("prescriptionsDueNow respects window", () => {
  const now = new Date();
  const prescriptions = [
    {
      medicine_name: "Test",
      expected_count: 1,
      scheduled_time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`,
      window_minutes: 60
    }
  ];
  const due = prescriptionsDueNow(prescriptions, now);
  assert.equal(due.length, 1);
});
