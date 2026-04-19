import { normalizePhone } from "./config.mjs";

const SEED_CARETAKER_ID = "11111111-1111-4111-8111-111111111101";
const SEED_PATIENT_ID = "22222222-2222-4222-8222-222222222202";

const HELP_TEXT = `Caretaker Command Center\nCommands:\n  status — recent medication alerts\n  ack <event-id> — acknowledge an alert\n  help — show this message`;

async function findCaretakerByPhone(client, normalizedSenderPhone) {
  const { data, error } = await client
    .from("caretakers")
    .select("id, name, phone")
    .eq("id", SEED_CARETAKER_ID)
    .maybeSingle();

  if (error || !data) return null;
  const caretakerPhone = normalizePhone(data.phone);
  if (!caretakerPhone || caretakerPhone !== normalizedSenderPhone) return null;
  return data;
}

async function handleStatus(client) {
  const { data: events } = await client
    .from("events")
    .select("id, title, severity, created_at, type")
    .eq("patient_id", SEED_PATIENT_ID)
    .in("severity", ["warning", "critical"])
    .eq("type", "medication")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!events || events.length === 0) {
    return "No recent medication alerts. All looks good.";
  }

  const lines = events.map(e => {
    const d = new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `[${e.severity.toUpperCase()}] ${e.title} (${d}) — id: ${e.id.slice(0, 8)}`;
  });

  return `Recent alerts:\n${lines.join("\n")}`;
}

async function handleAck(client, caretaker, shortId) {
  if (!shortId) return "Usage: ack <event-id>";

  const { data: events } = await client
    .from("events")
    .select("id, patient_id")
    .eq("patient_id", SEED_PATIENT_ID)
    .like("id", `${shortId}%`)
    .limit(2);

  if (!events || events.length === 0) {
    return `No event found matching id: ${shortId}`;
  }
  if (events.length > 1) {
    return `Ambiguous id: ${shortId}. Please use more characters.`;
  }

  const event = events[0];

  // Verify event belongs to this caretaker's patient
  const { data: patient } = await client
    .from("patients")
    .select("caretaker_id")
    .eq("id", event.patient_id)
    .maybeSingle();

  if (!patient || patient.caretaker_id !== caretaker.id) {
    return "Not authorized to acknowledge this event.";
  }

  await client.from("events").update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq("id", event.id);

  return `Acknowledged event ${event.id.slice(0, 8)}.`;
}

/**
 * Routes an inbound iMessage from a caretaker.
 * Returns a reply string, or null if the sender is unrecognized.
 */
export async function routeInboundCommand(client, { senderPhone, text }) {
  const normalizedSender = normalizePhone(senderPhone);
  if (!normalizedSender) return null;

  const caretaker = await findCaretakerByPhone(client, normalizedSender);
  if (!caretaker) {
    // Silently ignore messages from unrecognized senders.
    return null;
  }

  const trimmed = String(text || "").trim().toLowerCase();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];

  switch (cmd) {
    case "help":
      return HELP_TEXT;
    case "status":
      return await handleStatus(client);
    case "ack":
      return await handleAck(client, caretaker, parts[1] || "");
    default:
      return `Unknown command: ${cmd}\n\n${HELP_TEXT}`;
  }
}
