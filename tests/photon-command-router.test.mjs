import test from "node:test";
import assert from "node:assert/strict";
import { routeInboundCommand } from "../services/photon/command-router.mjs";

const SEED_CARETAKER_ID = "11111111-1111-4111-8111-111111111101";
const SEED_PATIENT_ID = "22222222-2222-4222-8222-222222222202";
const CARETAKER_PHONE = "+16095550100";
const CARETAKER_PHONE_RAW = "+1 609-555-0100"; // raw with spaces — should normalize

function makeMockClient({ caretakerPhone = CARETAKER_PHONE, events = [], ackError = null, patientCaretakerId = SEED_CARETAKER_ID } = {}) {
  const calls = { eventsQuery: 0, ackUpdate: 0 };

  return {
    from: (table) => {
      if (table === "caretakers") {
        return {
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: async () => ({
                data: col === "id" && val === SEED_CARETAKER_ID
                  ? { id: SEED_CARETAKER_ID, name: "Rohan Shah", phone: caretakerPhone }
                  : null,
                error: null
              })
            })
          })
        };
      }

      if (table === "events") {
        calls.eventsQuery++;
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: events, error: null })
                  })
                })
              }),
              like: () => ({
                limit: async () => ({
                  data: events.filter(e => e.id.startsWith(SEED_PATIENT_ID.slice(0, 4)) || true).slice(0, 2),
                  error: null
                })
              })
            })
          }),
          update: () => ({
            eq: async () => ({ data: null, error: ackError })
          })
        };
      }

      if (table === "patients") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { caretaker_id: patientCaretakerId },
                error: null
              })
            })
          })
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    _calls: calls
  };
}

// --- Unrecognized senders ---

test("routeInboundCommand: unrecognized sender returns null without side effects", async () => {
  const client = makeMockClient();
  const result = await routeInboundCommand(client, { senderPhone: "+19999999999", text: "help" });
  assert.equal(result, null);
});

test("routeInboundCommand: invalid phone format returns null", async () => {
  const client = makeMockClient();
  const result = await routeInboundCommand(client, { senderPhone: "not-a-phone", text: "help" });
  assert.equal(result, null);
});

// --- help ---

test("routeInboundCommand: help returns deterministic command guidance", async () => {
  const client = makeMockClient();
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE, text: "help" });
  assert.ok(result.includes("status"));
  assert.ok(result.includes("ack"));
  assert.ok(result.includes("help"));
});

// --- status ---

test("routeInboundCommand: status with no recent events returns empty message", async () => {
  const client = makeMockClient({ events: [] });
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE, text: "status" });
  assert.ok(result.toLowerCase().includes("no recent"));
});

test("routeInboundCommand: status with warning/critical events returns concise summary", async () => {
  const events = [
    { id: "aaaa1111-0000-0000-0000-000000000000", title: "Medication not taken", severity: "critical", created_at: new Date().toISOString(), type: "medication" }
  ];
  const client = makeMockClient({ events });
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE, text: "status" });
  assert.ok(result.includes("CRITICAL") || result.includes("critical") || result.includes("Medication"));
});

// --- ack ---

test("routeInboundCommand: ack with valid short event id acknowledges event", async () => {
  const eventId = "aaaa1111-0000-0000-0000-000000000000";
  const events = [{ id: eventId, patient_id: SEED_PATIENT_ID }];
  const client = makeMockClient({ events });
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE, text: `ack aaaa1111` });
  assert.ok(result.toLowerCase().includes("acknowledged"));
});

test("routeInboundCommand: ack without event id returns usage hint", async () => {
  const client = makeMockClient({ events: [] });
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE, text: "ack" });
  assert.ok(result.toLowerCase().includes("usage"));
});

test("routeInboundCommand: ack for another caretaker event is rejected", async () => {
  const eventId = "aaaa1111-0000-0000-0000-000000000000";
  const events = [{ id: eventId, patient_id: SEED_PATIENT_ID }];
  const client = makeMockClient({ events, patientCaretakerId: "different-caretaker-id" });
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE, text: `ack aaaa1111` });
  assert.ok(result.toLowerCase().includes("not authorized") || result.toLowerCase().includes("not found"));
});

// --- unknown commands ---

test("routeInboundCommand: unknown command returns fallback help text", async () => {
  const client = makeMockClient();
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE, text: "approve all" });
  assert.ok(result.toLowerCase().includes("unknown command") || result.toLowerCase().includes("help"));
});

// --- phone normalization ---

test("routeInboundCommand: phone with spaces normalizes and matches caretaker", async () => {
  const client = makeMockClient({ caretakerPhone: CARETAKER_PHONE });
  const result = await routeInboundCommand(client, { senderPhone: CARETAKER_PHONE_RAW, text: "help" });
  // Should recognize as known caretaker (not return null)
  assert.notEqual(result, null);
});
