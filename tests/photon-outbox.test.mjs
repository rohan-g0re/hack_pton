import test from "node:test";
import assert from "node:assert/strict";
import { enqueueAlert, buildOutboxPayload } from "../services/photon/outbox.mjs";

// --- buildOutboxPayload ---

test("buildOutboxPayload: valid params produce correct payload shape", () => {
  const payload = buildOutboxPayload({
    phone: "+16095550100",
    message: "Mira missed her Allergy Relief. Please check in.",
    eventId: "event-uuid-123",
    notificationId: "notif-uuid-456"
  });
  assert.equal(payload.recipient_phone, "+16095550100");
  assert.equal(payload.message_body, "Mira missed her Allergy Relief. Please check in.");
  assert.equal(payload.event_id, "event-uuid-123");
  assert.equal(payload.notification_id, "notif-uuid-456");
  assert.equal(payload.status, "pending");
});

test("buildOutboxPayload: missing phone throws", () => {
  assert.throws(
    () => buildOutboxPayload({ phone: "", message: "test", eventId: "e1", notificationId: "n1" }),
    /phone.*E\.164/i
  );
});

test("buildOutboxPayload: phone with spaces is normalized to E.164", () => {
  const payload = buildOutboxPayload({
    phone: "+1 609-555-0100",
    message: "test alert",
    eventId: "e1",
    notificationId: "n1"
  });
  assert.equal(payload.recipient_phone, "+16095550100");
});

test("buildOutboxPayload: missing message throws", () => {
  assert.throws(
    () => buildOutboxPayload({ phone: "+16095550100", message: "", eventId: "e1", notificationId: "n1" }),
    /message/i
  );
});

// --- enqueueAlert (mocked Supabase) ---

function makeMockSupabase({ notifId = "notif-1", outboxId = "outbox-1", existingNotif = null } = {}) {
  const calls = { notifSelect: 0, notifInsert: 0, outboxInsert: 0 };

  const notifChain = {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingNotif, error: null }) }) }),
    insert: (data) => {
      calls.notifInsert++;
      return { select: () => ({ single: async () => ({ data: { id: notifId, ...data }, error: null }) }) };
    },
    update: (data) => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: notifId, ...data }, error: null }) }) }) })
  };

  const outboxChain = {
    insert: (data) => {
      calls.outboxInsert++;
      return { select: () => ({ single: async () => ({ data: { id: outboxId, ...data }, error: null }) }) };
    }
  };

  const client = {
    from: (table) => {
      if (table === "notifications") return notifChain;
      if (table === "photon_outbox") return outboxChain;
      throw new Error(`Unexpected table: ${table}`);
    },
    _calls: calls
  };

  return client;
}

test("enqueueAlert: valid payload creates pending notification and outbox row", async () => {
  const client = makeMockSupabase();
  const result = await enqueueAlert(client, {
    phone: "+16095550100",
    message: "Mira missed her Allergy Relief.",
    eventId: "event-uuid-123"
  });

  assert.equal(result.queued, true);
  assert.ok(result.notificationId);
  assert.ok(result.outboxId);
  assert.equal(client._calls.notifInsert, 1);
  assert.equal(client._calls.outboxInsert, 1);
});

test("enqueueAlert: phone with formatting characters normalizes before persistence", async () => {
  const client = makeMockSupabase();
  const result = await enqueueAlert(client, {
    phone: "+1 609-555-0100",
    message: "test",
    eventId: "event-1"
  });
  assert.equal(result.queued, true);
});

test("enqueueAlert: invalid phone returns error without inserting rows", async () => {
  const client = makeMockSupabase();
  await assert.rejects(
    () => enqueueAlert(client, { phone: "not-a-phone", message: "test", eventId: "e1" }),
    /E\.164/i
  );
  assert.equal(client._calls.notifInsert, 0);
  assert.equal(client._calls.outboxInsert, 0);
});

test("enqueueAlert: missing message returns error without inserting rows", async () => {
  const client = makeMockSupabase();
  await assert.rejects(
    () => enqueueAlert(client, { phone: "+16095550100", message: "", eventId: "e1" }),
    /message/i
  );
  assert.equal(client._calls.notifInsert, 0);
  assert.equal(client._calls.outboxInsert, 0);
});

test("enqueueAlert: existing notification for same event_id reuses it and still creates outbox row", async () => {
  const client = makeMockSupabase({ existingNotif: { id: "notif-existing" } });
  const result = await enqueueAlert(client, {
    phone: "+16095550100",
    message: "test",
    eventId: "event-uuid-123"
  });
  assert.equal(result.queued, true);
  assert.equal(client._calls.notifInsert, 0);
  assert.equal(client._calls.outboxInsert, 1);
});
