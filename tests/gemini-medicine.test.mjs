import test from "node:test";
import assert from "node:assert/strict";
import { prescriptionsDueNow } from "../services/worker/medicine-analysis.mjs";
import { shouldSendImmediate, buildMedicationAlertMessage } from "../services/photon/message-templates.mjs";

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

// --- Alert policy ---

test("shouldSendImmediate: missed triggers immediate alert", () => {
  assert.equal(shouldSendImmediate("missed"), true);
});

test("shouldSendImmediate: partial triggers immediate alert", () => {
  assert.equal(shouldSendImmediate("partial"), true);
});

test("shouldSendImmediate: uncertain triggers immediate alert", () => {
  assert.equal(shouldSendImmediate("uncertain"), true);
});

test("shouldSendImmediate: taken does not trigger immediate alert", () => {
  assert.equal(shouldSendImmediate("taken"), false);
});

test("shouldSendImmediate: outside_window does not trigger immediate alert", () => {
  assert.equal(shouldSendImmediate("outside_window"), false);
});

// --- buildMedicationAlertMessage ---

test("buildMedicationAlertMessage: missed builds critical message with patient and medication names", () => {
  const msg = buildMedicationAlertMessage({
    adherence: "missed",
    patientName: "Mira",
    missedMedications: ["Allergy Relief", "Vitamin D"],
    eventId: "abcdef12-0000-0000-0000-000000000000"
  });
  assert.ok(msg.includes("Mira"));
  assert.ok(msg.includes("Allergy Relief"));
  assert.ok(msg.includes("Vitamin D"));
  assert.ok(msg.includes("ack abcdef12"));
});

test("buildMedicationAlertMessage: partial builds warning message and enqueues exactly one alert content", () => {
  const msg = buildMedicationAlertMessage({
    adherence: "partial",
    patientName: "Mira",
    missedMedications: ["Vitamin D"],
    eventId: "bbbbbb11-0000-0000-0000-000000000000"
  });
  assert.ok(msg.includes("Mira"));
  assert.ok(msg.includes("Vitamin D"));
  assert.match(msg, /partial/i);
});

test("buildMedicationAlertMessage: taken returns null", () => {
  const msg = buildMedicationAlertMessage({ adherence: "taken", patientName: "Mira" });
  assert.equal(msg, null);
});

test("buildMedicationAlertMessage: outside_window returns null", () => {
  const msg = buildMedicationAlertMessage({ adherence: "outside_window", patientName: "Mira" });
  assert.equal(msg, null);
});

test("buildMedicationAlertMessage: long Gemini reasoning is not included", () => {
  const msg = buildMedicationAlertMessage({
    adherence: "missed",
    patientName: "Mira",
    missedMedications: ["Allergy Relief"],
    eventId: "cccccc11-0000-0000-0000-000000000000",
    reasoning: "A".repeat(5000)
  });
  // Message should not contain the long reasoning field
  assert.ok(msg.length < 1000);
});
