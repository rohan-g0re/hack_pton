import { requireE164 } from "./config.mjs";

export function buildOutboxPayload({ phone, message, eventId, notificationId, snapshotUrl = null }) {
  const normalizedPhone = requireE164(phone, "phone");
  if (!message || !String(message).trim()) {
    throw new Error("message is required and must not be empty.");
  }
  return {
    recipient_phone: normalizedPhone,
    message_body: String(message).trim(),
    event_id: eventId || null,
    notification_id: notificationId || null,
    snapshot_url: snapshotUrl || null,
    status: "pending"
  };
}

/**
 * Enqueues a Photon iMessage alert durably.
 * Creates or reuses a pending notifications row, then creates a photon_outbox row.
 * Returns { queued: true, notificationId, outboxId }.
 */
export async function enqueueAlert(client, { phone, message, eventId, snapshotUrl = null }) {
  const normalizedPhone = requireE164(phone, "phone");
  if (!message || !String(message).trim()) {
    throw new Error("message is required and must not be empty.");
  }

  let notificationId;

  // Reuse an existing pending/failed notification for this event to avoid duplicates.
  if (eventId) {
    const existing = await client
      .from("notifications")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing.data) {
      notificationId = existing.data.id;
    }
  }

  if (!notificationId) {
    const notifInsert = await client
      .from("notifications")
      .insert({
        event_id: eventId || null,
        channel: "photon_imessage",
        recipient: normalizedPhone,
        message: String(message).trim(),
        delivery_status: "pending"
      })
      .select()
      .single();

    if (notifInsert.error) throw new Error(notifInsert.error.message || String(notifInsert.error));
    notificationId = notifInsert.data.id;
  }

  const outboxPayload = buildOutboxPayload({
    phone: normalizedPhone,
    message,
    eventId,
    notificationId,
    snapshotUrl
  });

  const outboxInsert = await client
    .from("photon_outbox")
    .insert(outboxPayload)
    .select()
    .single();

  if (outboxInsert.error) throw new Error(outboxInsert.error.message || String(outboxInsert.error));

  return {
    queued: true,
    notificationId,
    outboxId: outboxInsert.data.id
  };
}
