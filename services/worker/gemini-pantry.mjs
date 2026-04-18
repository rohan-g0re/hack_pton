import { getSeedScenes } from "../../src/demo-data.mjs";
import { buildLowStockItems, proposalSignature } from "./pantry-analysis.mjs";
import { readPrompt, callGeminiVisionJson } from "./gemini-client.mjs";

function mapInventoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    targetQuantity: row.target_quantity,
    lowStockThreshold: row.low_stock_threshold,
    preferredMerchant: row.preferred_merchant
  };
}

async function fetchOpenProposals(client, patientId) {
  const { data, error } = await client
    .from("purchase_proposals")
    .select("*")
    .eq("patient_id", patientId)
    .in("status", ["awaiting_approval", "review"]);

  if (error) {
    throw error;
  }
  return data || [];
}

function normalizeProposalItems(items) {
  return (items || []).map((item) => ({
    name: item.name,
    reorderQuantity: item.reorderQuantity ?? item.reorder_quantity ?? 0
  }));
}

async function upsertProposal(client, { patientId, analysisId, lowItems, confidence, merchant }) {
  const items = lowItems.map((item) => ({
    name: item.name,
    reorderQuantity: item.reorderQuantity
  }));
  const sig = proposalSignature(items);
  const estimatedTotal = lowItems.reduce((sum, item) => sum + item.reorderQuantity * 4.25, 0);
  const status = confidence < 0.6 ? "review" : "awaiting_approval";

  const open = await fetchOpenProposals(client, patientId);
  const existing = open.find((proposal) => {
    const normalized = normalizeProposalItems(proposal.items);
    return proposalSignature(normalized) === sig;
  });

  if (existing) {
    const { data, error } = await client
      .from("purchase_proposals")
      .update({
        updated_at: new Date().toISOString(),
        status,
        confidence,
        estimated_total: estimatedTotal,
        items,
        analysis_id: analysisId
      })
      .eq("id", existing.id)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data;
  }

  const { data, error } = await client
    .from("purchase_proposals")
    .insert({
      patient_id: patientId,
      analysis_id: analysisId,
      status,
      merchant,
      items,
      estimated_total: estimatedTotal,
      confidence
    })
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Process one pantry snapshot row (joined with camera + patient context in caller).
 */
export async function processPantrySnapshot(client, snapshotRow, cameraRow) {
  const patientId = cameraRow.patient_id;
  const inventoryRes = await client.from("inventory_items").select("*").eq("patient_id", patientId);
  if (inventoryRes.error) {
    throw inventoryRes.error;
  }

  const inventory = (inventoryRes.data || []).map(mapInventoryRow);

  let scene;
  let detectedItems = [];
  let confidence = 0.9;
  let uncertainty = false;
  let rawGemini = null;

  if (snapshotRow.scene_id) {
    scene = getSeedScenes().pantry.find((s) => s.id === snapshotRow.scene_id);
    if (!scene) {
      throw new Error(`Unknown pantry scene: ${snapshotRow.scene_id}`);
    }
    detectedItems = scene.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      bbox: [0, 0, 1, 1]
    }));
    confidence = scene.confidence;
    uncertainty = Boolean(scene.uncertainty);
  } else if (snapshotRow.image_url && process.env.GEMINI_API_KEY) {
    const promptBase = readPrompt("pantry-prompt.md");
    const prompt = `${promptBase}\n\nInventory JSON:\n${JSON.stringify(
      inventory.map((i) => ({ name: i.name, targetQuantity: i.targetQuantity, threshold: i.lowStockThreshold })),
      null,
      2
    )}`;

    const imageResp = await fetch(snapshotRow.image_url, { signal: AbortSignal.timeout(15_000) });
    const buf = Buffer.from(await imageResp.arrayBuffer());
    rawGemini = await callGeminiVisionJson({
      prompt,
      imageBase64: buf.toString("base64")
    });
    detectedItems = rawGemini.items || [];
    confidence = Number(rawGemini.confidence ?? 0.8);
    uncertainty = Boolean(rawGemini.uncertainty);
    scene = {
      items: detectedItems.map((i) => ({ name: i.name, quantity: i.quantity })),
      confidence,
      uncertainty
    };
  } else {
    throw new Error("Pantry snapshot missing scene_id and GEMINI_API_KEY/image_url for processing.");
  }

  const lowItems = buildLowStockItems(inventory, scene);

  const existingAnalysis = await client
    .from("pantry_analyses")
    .select("id")
    .eq("snapshot_id", snapshotRow.id)
    .maybeSingle();

  if (existingAnalysis.data) {
    await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
    return { analysis: existingAnalysis.data, proposal: null };
  }

  const analysisInsert = await client
    .from("pantry_analyses")
    .insert({
      snapshot_id: snapshotRow.id,
      patient_id: patientId,
      detected_items: detectedItems,
      low_items: lowItems,
      confidence,
      raw_gemini_response: rawGemini
    })
    .select()
    .single();

  if (analysisInsert.error) {
    throw analysisInsert.error;
  }

  const analysis = analysisInsert.data;

  async function insertEvent(payload) {
    const res = await client.from("events").insert({ patient_id: patientId, ...payload }).select().single();
    if (res.error) {
      throw res.error;
    }
    return res.data;
  }

  if (uncertainty || confidence < 0.6) {
    const proposal = await upsertProposal(client, {
      patientId,
      analysisId: analysis.id,
      lowItems,
      confidence,
      merchant: "Walmart"
    });
    await insertEvent({
      type: "pantry",
      severity: "warning",
      title: "Pantry review needed",
      message: "Pantry detection was uncertain. Review the proposal before ordering anything.",
      related_id: proposal.id
    });
    await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
    return { analysis, proposal };
  }

  if (lowItems.length === 0) {
    await insertEvent({
      type: "pantry",
      severity: "success",
      title: "Pantry looks healthy",
      message: "No replenishment is needed from the latest pantry snapshot."
    });
    await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
    return { analysis, proposal: null };
  }

  const proposal = await upsertProposal(client, {
    patientId,
    analysisId: analysis.id,
    lowItems,
    confidence,
    merchant: "Walmart"
  });
  await insertEvent({
    type: "pantry",
    severity: "warning",
    title: "Low stock detected",
    message: `Proposed replenishment for ${lowItems.map((item) => item.name).join(", ")}.`,
    related_id: proposal.id
  });
  await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
  return { analysis, proposal };
}
