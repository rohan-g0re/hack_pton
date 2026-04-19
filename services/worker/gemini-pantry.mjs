import { callRoboticsER } from "./gemini-client.mjs";
import { fetchImageBytes } from "./s3-fetch.mjs";
import { proposalSignature } from "./pantry-analysis.mjs";

function mapInventoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    targetQuantity: row.target_quantity,
    lowStockThreshold: row.low_stock_threshold,
    preferredMerchant: row.preferred_merchant
  };
}

function buildPantryPrompt(inventory) {
  const inventoryList = inventory
    .map(i => `  - ${i.name}: target ${i.targetQuantity} units, reorder when below ${i.lowStockThreshold} units`)
    .join("\n");

  return `You are analyzing a pantry/kitchen image for a caretaker monitoring system.

You have the following functions available:

def reorder_item(name: str, qty_visible: int):
    # Call this for each inventory item that appears LOW or MISSING in the image.
    # qty_visible is your best estimate of how many units are currently visible.

def item_sufficient(name: str, qty_visible: int):
    # Call this for each inventory item that appears adequately stocked.
    # qty_visible is your best estimate of how many units are currently visible.

The patient's grocery inventory (what the caretaker wants them to have):
${inventoryList}

Look at the pantry image carefully. For EACH item in the inventory list above, determine whether it needs to be reordered or is sufficiently stocked, then call the appropriate function.

First reason through what you see in the image item by item. Then output a JSON array of function calls:
[{"function": "reorder_item", "args": ["Milk", 1]}, {"function": "item_sufficient", "args": ["Bananas", 4]}]

Call one function per inventory item. Use only the function names defined above.`;
}

async function fetchOpenProposals(client, patientId) {
  const { data, error } = await client
    .from("purchase_proposals")
    .select("*")
    .eq("patient_id", patientId)
    .in("status", ["awaiting_approval", "review"]);
  if (error) throw error;
  return data || [];
}

function normalizeProposalItems(items) {
  return (items || []).map(i => ({
    name: i.name,
    reorderQuantity: i.reorderQuantity ?? i.reorder_quantity ?? 0
  }));
}

async function upsertProposal(client, { patientId, analysisId, reorderItems, confidence }) {
  const items = reorderItems.map(i => ({ name: i.name, reorderQuantity: i.reorderQuantity }));
  const sig = proposalSignature(items);
  const estimatedTotal = reorderItems.reduce((sum, i) => sum + i.reorderQuantity * 4.25, 0);
  const status = confidence < 0.6 ? "review" : "awaiting_approval";

  const open = await fetchOpenProposals(client, patientId);
  const existing = open.find(p => proposalSignature(normalizeProposalItems(p.items)) === sig);

  if (existing) {
    const { data, error } = await client
      .from("purchase_proposals")
      .update({ updated_at: new Date().toISOString(), status, confidence, estimated_total: estimatedTotal, items, analysis_id: analysisId })
      .eq("id", existing.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const merchant = reorderItems[0]?.preferredMerchant || "Walmart";
  const { data, error } = await client
    .from("purchase_proposals")
    .insert({ patient_id: patientId, analysis_id: analysisId, status, merchant, items, estimated_total: estimatedTotal, confidence })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function processPantrySnapshot(client, snapshotRow, cameraRow) {
  const patientId = cameraRow.patient_id;

  const inventoryRes = await client.from("inventory_items").select("*").eq("patient_id", patientId);
  if (inventoryRes.error) throw inventoryRes.error;
  const inventory = (inventoryRes.data || []).map(mapInventoryRow);

  if (!snapshotRow.image_url) throw new Error("Pantry snapshot missing image_url.");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");

  const buf = await fetchImageBytes(snapshotRow.image_url);
  const { reasoning, calls } = await callRoboticsER({
    prompt: buildPantryPrompt(inventory),
    imageBase64: buf.toString("base64")
  });

  console.log(`[pantry] Gemini reasoning: ${reasoning.slice(0, 300)}`);
  console.log(`[pantry] Function calls:`, JSON.stringify(calls));

  // Model couldn't identify pantry scene — mark processed, skip proposal
  if (calls.length === 0) {
    await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);
    console.log(`[pantry] No function calls returned — image may not show a pantry. Marked processed.`);
    return { analysis: null, proposal: null };
  }

  // Parse function calls into reorder list
  const reorderItems = [];
  const detectedItems = [];

  for (const call of calls) {
    // Model may return args as array ["Milk", 0] or object {name: "Milk", qty_visible: 0}
    const fnName = call.function || call.name;
    const name = Array.isArray(call.args) ? call.args[0] : call.args?.name;
    const qtyVisible = Array.isArray(call.args) ? call.args[1] : call.args?.qty_visible;
    const inventoryItem = inventory.find(i => i.name.toLowerCase() === String(name ?? "").toLowerCase());
    detectedItems.push({ name: String(name ?? "unknown"), qty_visible: Number(qtyVisible ?? 0), decision: fnName });

    if (fnName === "reorder_item" && inventoryItem) {
      const reorderQuantity = Math.max(1, inventoryItem.targetQuantity - Number(qtyVisible ?? 0));
      reorderItems.push({
        name: inventoryItem.name,
        reorderQuantity,
        preferredMerchant: inventoryItem.preferredMerchant
      });
    }
  }

  const confidence = reorderItems.length > 0 ? 0.85 : 0.9;

  // Check for existing analysis on this snapshot
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
      low_items: reorderItems,
      confidence,
      raw_gemini_response: { reasoning, calls }
    })
    .select()
    .single();
  if (analysisInsert.error) throw analysisInsert.error;

  const analysis = analysisInsert.data;

  async function insertEvent(payload) {
    const res = await client.from("events").insert({ patient_id: patientId, ...payload }).select().single();
    if (res.error) throw res.error;
    return res.data;
  }

  await client.from("snapshots").update({ processed: true }).eq("id", snapshotRow.id);

  if (reorderItems.length === 0) {
    await insertEvent({
      type: "pantry",
      severity: "success",
      title: "Pantry looks healthy",
      message: "Gemini checked all inventory items — nothing needs to be reordered."
    });
    return { analysis, proposal: null };
  }

  const proposal = await upsertProposal(client, { patientId, analysisId: analysis.id, reorderItems, confidence });
  await insertEvent({
    type: "pantry",
    severity: "warning",
    title: "Low stock detected",
    message: `Gemini flagged: ${reorderItems.map(i => i.name).join(", ")} need replenishment.`,
    related_id: proposal.id
  });

  return { analysis, proposal };
}
