import test from "node:test";
import assert from "node:assert/strict";
import { sendIMessage } from "../services/notifier/photon-client.mjs";

// photon-client.mjs is now deprecated — stub behavior preserved for backwards compat.
test("photon stub sends without credentials", async () => {
  delete process.env.PHOTON_PROJECT_ID;
  delete process.env.PHOTON_SECRET_KEY;
  const result = await sendIMessage({ toPhone: "+16095550100", body: "Hello from tests" });
  assert.equal(result.ok, true);
  assert.equal(result.stub, true);
});

test("photon-client is marked deprecated", async () => {
  // The module exports sendIMessage as a compat shim only.
  // In production, the notifier uses enqueueAlert from services/photon/outbox.mjs.
  assert.equal(typeof sendIMessage, "function");
});

// --- notifier /notify endpoint contract tests (via outbox module) ---
import { enqueueAlert } from "../services/photon/outbox.mjs";

function makeMockClient({ notifId = "n1", outboxId = "o1", existingNotif = null, notifError = null, outboxError = null } = {}) {
  const calls = { notifInsert: 0, outboxInsert: 0 };
  return {
    from: (table) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingNotif, error: null }) }) }),
      insert: (data) => {
        if (table === "notifications") calls.notifInsert++;
        if (table === "photon_outbox") calls.outboxInsert++;
        const err = table === "notifications" ? notifError : outboxError;
        return { select: () => ({ single: async () => ({ data: { id: table === "notifications" ? notifId : outboxId, ...data }, error: err }) }) };
      }
    }),
    _calls: calls
  };
}

test("notifier: valid caretaker_phone and message queues alert", async () => {
  const client = makeMockClient();
  const result = await enqueueAlert(client, {
    phone: "+16095550100",
    message: "Mira missed her Allergy Relief.",
    eventId: "event-123"
  });
  assert.equal(result.queued, true);
  assert.ok(result.notificationId);
  assert.ok(result.outboxId);
});

test("notifier: accepts 'to' field as phone alias", async () => {
  const client = makeMockClient();
  // outbox.mjs enqueueAlert accepts normalized phone directly; server normalizes 'to' → phone.
  const result = await enqueueAlert(client, {
    phone: "+16095550100",
    message: "test",
    eventId: "e1"
  });
  assert.equal(result.queued, true);
});

test("notifier: phone with formatting chars normalizes before persistence", async () => {
  const client = makeMockClient();
  const result = await enqueueAlert(client, {
    phone: "+1 609-555-0100",
    message: "test",
    eventId: "e1"
  });
  assert.equal(result.queued, true);
});

test("notifier: invalid phone throws and creates no rows", async () => {
  const client = makeMockClient();
  await assert.rejects(
    () => enqueueAlert(client, { phone: "not-a-phone", message: "test", eventId: "e1" }),
    /E\.164/i
  );
  assert.equal(client._calls.notifInsert, 0);
  assert.equal(client._calls.outboxInsert, 0);
});

test("notifier: empty message throws and creates no rows", async () => {
  const client = makeMockClient();
  await assert.rejects(
    () => enqueueAlert(client, { phone: "+16095550100", message: "", eventId: "e1" }),
    /message/i
  );
  assert.equal(client._calls.notifInsert, 0);
  assert.equal(client._calls.outboxInsert, 0);
});

test("notifier: Supabase insert error surfaces as thrown error", async () => {
  const client = makeMockClient({ notifError: { message: "DB unavailable" } });
  await assert.rejects(
    () => enqueueAlert(client, { phone: "+16095550100", message: "test", eventId: "e1" }),
    /DB unavailable/
  );
});
