import { callRoboticsER } from "./gemini-client.mjs";
import { fetchImageBytes } from "./s3-fetch.mjs";
import { prescriptionsDueNow } from "./medicine-analysis.mjs";
import { shouldSendImmediate, buildMedicationAlertMessage } from "../photon/message-templates.mjs";
import { enqueueAlert } from "../photon/outbox.mjs";
import { normalizePhone } from "../photon/config.mjs";

async function notifyPhoton(client, { caretakerPhone, adherence, patientName, missedMedications, eventId, capturedAt }) {
  if (!shouldSendImmediate(adherence)) return;

  const phone = normalizePhone(caretakerPhone);
  if (!phone) {
    console.warn(`[medicine] caretaker phone not valid E.164, skipping alert: ${caretakerPhone}`);
    return;
  }

  const alertMessage = buildMedicationAlertMessage({
    adherence,
    patientName,
    missedMedications,
    eventId,
    capturedAt
  });

  if (!alertMessage) return;

  try {
    await enqueueAlert(client, { phone, message: alertMessage, eventId });
  } catch (err) {
    console.error(`[medicine] Failed to enqueue Photon alert for event ${eventId}:`, err.message);
    // Record a failed notification so the dashboard reflects the failure.
    try {
      await client.from("notifications").insert({
        event_id: eventId,
        channel: "photon_imessage",
        recipient: phone,
        message: alertMessage,
        delivery_status: "failed"
      });
    } catch { /* best-effort */ }
  }
}

function buildMedicinePrompt(prescriptions, capturedAt) {
  const timeStr = new Date(capturedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const rxList = prescriptions
    .map(rx => `  - ${rx.medicine_name}: ${rx.expected_count} dose(s) at ${rx.scheduled_time?.slice(0,5) ?? "any time"} (reason: ${rx.purpose || "not specified"})`)
    .join("\n");

  return `You are analyzing a medication area image for a caretaker monitoring system.
Current time: ${timeStr}

You have the following functions available:

def medication_taken(name: str, count_observed: int):
    # Call this when you can see evidence a medication HAS been taken
    # (e.g. pill not in blister pack, empty space in pill organizer, open bottle with pills gone)
    # count_observed is how many doses you believe were taken.

def medication_not_taken(name: str, reason: str):
    # Call this when a medication has clearly NOT been taken yet
    # (e.g. full blister pack, full pill bottle, pill still in organizer compartment)
    # reason should be a brief description of what you observe.

def medication_uncertain(name: str, reason: str):
    # Call this when you cannot determine if the medication was taken
    # (e.g. medication not visible, image unclear, container not identifiable)

The patient's prescription schedule:
${rxList}

Look at the medication area carefully. For EACH prescription listed above, determine whether it has been taken, not taken, or is uncertain based on what you see in the image.

First reason through what you observe for each medication. Then output a JSON array of function calls:
[{"function": "medication_taken", "args": ["Allergy Relief", 1]}, {"function": "medication_not_taken", "args": ["Vitamin D", "full bottle visible, cap on"]}]

Call one function per prescription item. Use only the function names defined above.`;
}

export async function processMedicineSnapshot(client, snapshotRow, cameraRow, caretakerRow) {
  const patientId = cameraRow.patient_id;
  const capturedAt = snapshotRow.captured_at || new Date().toISOString();

  const rxRes = await client.from("prescriptions").select("*").eq("patient_id", patientId);
  if (rxRes.error) throw rxRes.error;
  const prescriptions = rxRes.data || [];

  if (!snapshotRow.image_url) throw new Error("Medicine snapshot missing image_url.");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");

  const buf = await fetchImageBytes(snapshotRow.image_url);
  const { reasoning, calls } = await callRoboticsER({
    prompt: buildMedicinePrompt(prescriptions, capturedAt),
    imageBase64: buf.toString("base64")
  });

  console.log(`[medicine] Gemini reasoning: ${reasoning.slice(0, 300)}`);
  console.log(`[medicine] Function calls:`, JSON.stringify(calls));

  // Model couldn't identify medication area — mark processed
  if (calls.length === 0) {
    await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
    console.log(`[medicine] No function calls returned — image may not show medications. Marked processed.`);
    return { check: null, event: null, adherence: "outside_window" };
  }

  // Parse function calls into adherence result
  const detectedPills = [];
  let takenCount = 0;
  let notTakenCount = 0;
  let uncertainCount = 0;

  for (const call of calls) {
    // Model may return args as array ["Med", "reason"] or object {name: "Med", reason: "..."}
    const fnName = call.function || call.name;
    const name = Array.isArray(call.args) ? call.args[0] : call.args?.name;
    const second = Array.isArray(call.args) ? call.args[1] : (call.args?.count ?? call.args?.reason);
    detectedPills.push({ name: String(name ?? "unknown"), decision: fnName, detail: second });

    if (fnName === "medication_taken") takenCount++;
    else if (fnName === "medication_not_taken") notTakenCount++;
    else uncertainCount++;
  }

  // Determine overall adherence
  let adherence, severity, title, message;

  const missedNames = calls
    .filter(c => (c.function || c.name) === "medication_not_taken")
    .map(c => Array.isArray(c.args) ? c.args[0] : c.args?.name)
    .filter(Boolean)
    .join(", ");

  if (notTakenCount > 0 && takenCount === 0) {
    adherence = "missed";
    severity = "critical";
    title = "Medication not taken";
    message = `Gemini detected ${missedNames || "medication"} has not been taken. Caretaker notified.`;
  } else if (notTakenCount > 0) {
    adherence = "partial";
    severity = "warning";
    title = "Partial medication adherence";
    message = `Some medications taken, but ${missedNames || "some"} appears not taken yet.`;
  } else if (uncertainCount > 0 && takenCount === 0) {
    adherence = "uncertain";
    severity = "warning";
    title = "Medication status unclear";
    message = "Gemini could not determine medication status from the image.";
  } else if (takenCount > 0) {
    adherence = "taken";
    severity = "success";
    title = "Medications taken";
    message = `Gemini confirmed all visible medications appear to have been taken.`;
  } else {
    adherence = "outside_window";
    severity = "info";
    title = "No medications detected";
    message = "No medications were identified in the image.";
  }

  // Check for existing check on this snapshot
  const existingCheck = await client
    .from("medication_checks")
    .select("id")
    .eq("snapshot_id", snapshotRow.id)
    .maybeSingle();

  if (existingCheck.data) {
    await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
    return { check: existingCheck.data, event: null, adherence };
  }

  const confidence = uncertainCount > 0 ? 0.6 : 0.88;
  const dueEntries = prescriptionsDueNow(prescriptions, new Date(capturedAt));

  const medRes = await client
    .from("medication_checks")
    .insert({
      snapshot_id: snapshotRow.id,
      patient_id: patientId,
      adherence_status: adherence,
      due_prescriptions: dueEntries,
      detected_pills: detectedPills,
      confidence,
      raw_gemini_response: { reasoning, calls }
    })
    .select()
    .single();
  if (medRes.error) throw medRes.error;

  const eventRes = await client
    .from("events")
    .insert({ patient_id: patientId, type: "medication", severity, title, message, related_id: medRes.data.id })
    .select()
    .single();
  if (eventRes.error) throw eventRes.error;

  const patientName = caretakerRow.patientName || caretakerRow.patient_name || "the patient";
  const missedMedications = calls
    .filter(c => (c.function || c.name) === "medication_not_taken")
    .map(c => Array.isArray(c.args) ? c.args[0] : c.args?.name)
    .filter(Boolean);

  await notifyPhoton(client, {
    caretakerPhone: caretakerRow.phone,
    adherence,
    patientName,
    missedMedications,
    eventId: eventRes.data.id,
    capturedAt
  });

  await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);

  return { check: medRes.data, event: eventRes.data, adherence };
}
