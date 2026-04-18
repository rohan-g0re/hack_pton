import http from "node:http";
import { createSupabaseServerClient } from "../../src/supabase-server.mjs";
import { processPantrySnapshot } from "./gemini-pantry.mjs";
import { processMedicineSnapshot } from "./gemini-medicine.mjs";
import { findApprovedProposalsPendingCheckout, runKnotCheckoutForProposal } from "./knot-checkout.mjs";
import { startInterval, sleep } from "./queue.mjs";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 2500);
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT || 3031);

function healthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "caretaker-worker" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(HEALTH_PORT, () => {
    console.log(`Worker health on http://127.0.0.1:${HEALTH_PORT}/health`);
  });

  return server;
}

async function loadCamera(client, cameraId) {
  const res = await client.from("cameras").select("*").eq("id", cameraId).maybeSingle();
  if (res.error) {
    throw res.error;
  }
  return res.data;
}

async function loadCaretakerForPatient(client, patientId) {
  const patientRes = await client.from("patients").select("caretaker_id").eq("id", patientId).maybeSingle();
  if (patientRes.error || !patientRes.data) {
    throw patientRes.error || new Error("patient missing");
  }
  const caretakerRes = await client
    .from("caretakers")
    .select("*")
    .eq("id", patientRes.data.caretaker_id)
    .maybeSingle();
  if (caretakerRes.error || !caretakerRes.data) {
    throw caretakerRes.error || new Error("caretaker missing");
  }
  return caretakerRes.data;
}

async function processPantry(client) {
  const { data, error } = await client
    .from("snapshots")
    .select("id, camera_id, scene_id, image_url, captured_at, processed")
    .eq("processed", false);

  if (error) {
    throw error;
  }

  for (const snap of data || []) {
    const camera = await loadCamera(client, snap.camera_id);
    if (!camera || camera.role !== "pantry") {
      continue;
    }

    await processPantrySnapshot(client, snap, camera);
    await sleep(50);
  }
}

async function processMedicine(client) {
  const { data, error } = await client
    .from("snapshots")
    .select("id, camera_id, scene_id, image_url, captured_at, processed")
    .eq("processed", false);

  if (error) {
    throw error;
  }

  for (const snap of data || []) {
    const camera = await loadCamera(client, snap.camera_id);
    if (!camera || camera.role !== "medicine") {
      continue;
    }

    const caretaker = await loadCaretakerForPatient(client, camera.patient_id);
    await processMedicineSnapshot(client, snap, camera, caretaker);
    await sleep(50);
  }
}

async function processCheckout(client) {
  const pending = await findApprovedProposalsPendingCheckout(client);
  for (const proposal of pending) {
    await runKnotCheckoutForProposal(client, proposal.id);
    await sleep(50);
  }
}

async function main() {
  const client = createSupabaseServerClient();

  if (!client) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON) are required for the worker.");
    process.exit(1);
  }

  const httpServer = healthServer();

  const stopPantry = startInterval("pantry", POLL_MS, () => processPantry(client));
  const stopMedicine = startInterval("medicine", POLL_MS, () => processMedicine(client));
  const stopCheckout = startInterval("checkout", POLL_MS * 2, () => processCheckout(client));

  const shutdown = () => {
    stopPantry();
    stopMedicine();
    stopCheckout();
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Caretaker worker started (pantry + medicine + checkout loops).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
