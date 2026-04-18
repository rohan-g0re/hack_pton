import { getSeedScenes } from "../../src/demo-data.mjs";
import { prescriptionsDueNow, adherenceFromScene } from "./medicine-analysis.mjs";
import { readPrompt, callGeminiVisionJson } from "./gemini-client.mjs";

async function notifyPhoton(client, { caretakerPhone, message, eventId }) {
  const base = process.env.PHOTON_NOTIFY_URL || "http://127.0.0.1:3040";
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caretaker_phone: caretakerPhone,
        message,
        event_id: eventId
      })
    });
    if (res.ok) {
      return;
    }
  } catch {
    // fall through to durable failure record
  }

  await client.from("notifications").insert({
    event_id: eventId,
    channel: "photon_imessage",
    recipient: caretakerPhone,
    message,
    delivery_status: "failed",
    sent_at: new Date().toISOString()
  });
}

export async function processMedicineSnapshot(client, snapshotRow, cameraRow, caretakerRow) {
  const patientId = cameraRow.patient_id;
  const capturedAt = new Date(snapshotRow.captured_at || Date.now());

  const rxRes = await client.from("prescriptions").select("*").eq("patient_id", patientId);
  if (rxRes.error) {
    throw rxRes.error;
  }

  const prescriptions = rxRes.data || [];
  const dueEntries = prescriptionsDueNow(prescriptions, capturedAt);

  let scene;
  let rawGemini = null;

  if (snapshotRow.scene_id) {
    scene = getSeedScenes().medicine.find((s) => s.id === snapshotRow.scene_id);
    if (!scene) {
      throw new Error(`Unknown medicine scene: ${snapshotRow.scene_id}`);
    }
  } else if (snapshotRow.image_url && process.env.GEMINI_API_KEY) {
    const promptBase = readPrompt("medicine-prompt.md");
    const prompt = `${promptBase}\n\nPrescriptions JSON:\n${JSON.stringify(prescriptions, null, 2)}`;
    const imageResp = await fetch(snapshotRow.image_url, { signal: AbortSignal.timeout(15_000) });
    const buf = Buffer.from(await imageResp.arrayBuffer());
    rawGemini = await callGeminiVisionJson({
      prompt,
      imageBase64: buf.toString("base64")
    });
    scene = {
      medsTaken: rawGemini.medsTaken || [],
      confidence: Number(rawGemini.confidence ?? 0.8),
      uncertainty: Boolean(rawGemini.uncertainty)
    };
  } else {
    throw new Error("Medicine snapshot missing scene_id and GEMINI_API_KEY/image_url for processing.");
  }

  const outcome = adherenceFromScene(scene, dueEntries);

  const existingCheck = await client
    .from("medication_checks")
    .select("id")
    .eq("snapshot_id", snapshotRow.id)
    .maybeSingle();

  if (existingCheck.data) {
    await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
    return { check: existingCheck.data, event: null, adherence: outcome.adherence };
  }

  const medRes = await client
    .from("medication_checks")
    .insert({
      snapshot_id: snapshotRow.id,
      patient_id: patientId,
      adherence_status: outcome.adherence,
      due_prescriptions: dueEntries,
      detected_pills: scene.medsTaken,
      confidence: scene.confidence,
      raw_gemini_response: rawGemini
    })
    .select()
    .single();

  if (medRes.error) {
    throw medRes.error;
  }

  const eventRes = await client
    .from("events")
    .insert({
      patient_id: patientId,
      type: "medication",
      severity: outcome.severity,
      title: outcome.title,
      message: outcome.message,
      related_id: medRes.data.id
    })
    .select()
    .single();

  if (eventRes.error) {
    throw eventRes.error;
  }

  const event = eventRes.data;

  if (outcome.adherence !== "outside_window") {
    await notifyPhoton(client, {
      caretakerPhone: caretakerRow.phone,
      message: outcome.message,
      eventId: event.id
    });
  }

  await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);

  return {
    check: medRes.data,
    event,
    adherence: outcome.adherence
  };
}
