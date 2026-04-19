/**
 * Knot checkout workflow — async, webhook-driven.
 *
 * Flow: approve proposal → ensure merchant linked → sync cart → wait for
 * SYNC_CART_SUCCEEDED webhook → checkout → wait for CHECKOUT_SUCCEEDED webhook.
 *
 * The worker calls requestCartSyncForProposal().
 * src/app.mjs webhook handler calls progressCheckoutAfterCartSync() and finaliseCheckout().
 */

import {
  syncKnotCart,
  checkoutKnotCart,
  devLinkShoppingAccount,
  mapProposalItemsToProducts,
  merchantForUseCase,
  MERCHANTS,
  DEFAULT_MERCHANT_ID
} from "./knot-client.mjs";

const DEFAULT_MERCHANT = Number(process.env.KNOT_DEFAULT_MERCHANT_ID || DEFAULT_MERCHANT_ID);

/** Resolve merchant ID for a proposal — use proposal.merchant_id if set, else use use-case default. */
function resolveMerchantId(proposal) {
  if (proposal.merchant_id) return Number(proposal.merchant_id);
  // Map proposal merchant name to ID
  const byName = Object.values(MERCHANTS).find(
    m => m.name.toLowerCase() === String(proposal.merchant || "").toLowerCase()
  );
  return byName ? byName.id : DEFAULT_MERCHANT;
}

function externalUserId(patientId) {
  return `patient:${patientId}`;
}

// ── Worker poll ───────────────────────────────────────────────────────────────

/** Approved proposals that have no checkout_session yet. */
export async function findApprovedProposalsPendingCheckout(client) {
  const { data, error } = await client
    .from("purchase_proposals")
    .select("*")
    .eq("status", "approved")
    .is("checkout_id", null)
    .order("created_at", { ascending: true })
    .limit(5); // process max 5 at a time
  if (error) throw error;
  return data || [];
}

/**
 * Initiate the Knot cart sync for a proposal.
 * Creates a checkout_session in `pending_cart_sync` state, calls POST /cart.
 * Final state is driven by the SYNC_CART_SUCCEEDED / SYNC_CART_FAILED webhooks.
 */
export async function requestCartSyncForProposal(client, proposalId) {
  const { data: proposal, error } = await client
    .from("purchase_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) throw error;
  if (!proposal) throw new Error("Proposal not found.");
  if (proposal.status !== "approved") {
    throw new Error(`Proposal not approved (status=${proposal.status}).`);
  }

  // Idempotency: if a session already exists for this proposal, skip
  const { data: existing } = await client
    .from("checkout_sessions")
    .select("id, status")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (existing) {
    console.log(`[knot] Checkout session already exists for proposal ${proposalId} (status=${existing.status}). Skipping.`);
    return { alreadyExists: true, checkoutSession: existing };
  }

  const MERCHANT_ID = resolveMerchantId(proposal);

  // Ensure merchant account is linked (dev environment: auto-link)
  const extUserId = externalUserId(proposal.patient_id);
  await ensureMerchantLinked(client, proposal.patient_id, extUserId, MERCHANT_ID);

  // Map proposal items → Knot product external IDs for this merchant
  const { products, unmapped } = mapProposalItemsToProducts(proposal.items || [], MERCHANT_ID);

  if (unmapped.length > 0) {
    console.warn(`[knot] No product mapping for: ${unmapped.join(", ")}. Proceeding with mapped items only.`);
  }

  if (products.length === 0) {
    // Mark proposal as failed with a clear message rather than retrying forever
    await client.from("purchase_proposals")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", proposal.id);
    await client.from("events").insert({
      patient_id: proposal.patient_id,
      type: "checkout",
      severity: "warning",
      title: "Items not available for ordering",
      message: `No product catalog mapping for: ${(proposal.items || []).map(i => i.name).join(", ")}. Add items to the inventory list by their exact store name.`
    });
    console.warn(`[knot] Marked proposal ${proposalId} failed — no product mappings.`);
    return { checkoutSession: null };
  }

  // Create checkout session in pending state
  const { data: session, error: sessionErr } = await client
    .from("checkout_sessions")
    .insert({
      proposal_id: proposal.id,
      patient_id: proposal.patient_id,
      provider: "Knot API",
      merchant: proposal.merchant || "Walmart",
      merchant_id: MERCHANT_ID,
      external_user_id: extUserId,
      status: "pending_cart_sync"
    })
    .select()
    .single();
  if (sessionErr) throw sessionErr;

  // Mark proposal with checkout_id so worker doesn't double-process
  await client
    .from("purchase_proposals")
    .update({ checkout_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", proposal.id);

  // Request cart sync (202 = accepted, not done)
  try {
    await syncKnotCart({
      externalUserId: extUserId,
      merchantId: MERCHANT_ID,
      products,
      deliveryLocation: {
        address_line_1: "123 Demo Street",
        city: "Princeton",
        region: "NJ",
        postal_code: "08540",
        country: "US"
      }
    });

    await client
      .from("checkout_sessions")
      .update({ status: "cart_sync_requested" })
      .eq("id", session.id);

    await insertEvent(client, proposal.patient_id, {
      type: "checkout",
      severity: "info",
      title: "Cart sync requested",
      message: `Sending cart to Walmart via Knot for: ${products.map(p => p.label).join(", ")}.`,
      related_id: session.id
    });

    console.log(`[knot] Cart sync requested for proposal ${proposalId}, session ${session.id}`);
    return { checkoutSession: session };
  } catch (err) {
    await client.from("checkout_sessions").update({ status: "failed", error_message: err.message }).eq("id", session.id);
    await client.from("purchase_proposals").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", proposal.id);
    await insertEvent(client, proposal.patient_id, {
      type: "checkout",
      severity: "critical",
      title: "Cart sync failed",
      message: err.message,
      related_id: session.id
    });
    throw err;
  }
}

// ── Webhook handlers (called from src/app.mjs) ────────────────────────────────

export async function handleCartSyncSucceeded(client, payload) {
  const session = await findSessionByTaskId(client, payload.task_id);
  if (!session) return;

  await client
    .from("checkout_sessions")
    .update({ status: "cart_synced", knot_task_id: payload.task_id })
    .eq("id", session.id);

  // Immediately request checkout
  try {
    await checkoutKnotCart({
      externalUserId: session.external_user_id,
      merchantId: MERCHANT_ID
    });

    await client
      .from("checkout_sessions")
      .update({ status: "checkout_requested" })
      .eq("id", session.id);

    await insertEvent(client, session.patient_id, {
      type: "checkout",
      severity: "info",
      title: "Checkout requested",
      message: "Cart synced successfully. Knot is completing the checkout.",
      related_id: session.id
    });
  } catch (err) {
    await client.from("checkout_sessions").update({ status: "failed", error_message: err.message }).eq("id", session.id);
    await failProposal(client, session.proposal_id, session.patient_id, session.id, err.message);
  }
}

export async function handleCartSyncFailed(client, payload) {
  const session = await findSessionByTaskId(client, payload.task_id);
  if (!session) return;

  const msg = payload.error_message || "Knot cart sync failed.";
  await client
    .from("checkout_sessions")
    .update({ status: "failed", error_message: msg, knot_task_id: payload.task_id })
    .eq("id", session.id);
  await failProposal(client, session.proposal_id, session.patient_id, session.id, msg);
}

export async function handleCheckoutSucceeded(client, payload) {
  const session = await findSessionByTaskId(client, payload.task_id);
  if (!session) return;

  const transactionIds = payload.transaction_ids || payload.transactions || null;

  await client
    .from("checkout_sessions")
    .update({
      status: "success",
      knot_task_id: payload.task_id,
      transaction_ids: transactionIds ? JSON.stringify(transactionIds) : null
    })
    .eq("id", session.id);

  await client
    .from("purchase_proposals")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", session.proposal_id);

  await insertEvent(client, session.patient_id, {
    type: "checkout",
    severity: "success",
    title: "Order placed successfully",
    message: "Knot completed the checkout at Walmart. Order confirmed.",
    related_id: session.id
  });
}

export async function handleCheckoutFailed(client, payload) {
  const session = await findSessionByTaskId(client, payload.task_id);
  if (!session) return;

  const msg = payload.error_message || "Knot checkout failed.";
  await client
    .from("checkout_sessions")
    .update({ status: "failed", error_message: msg, knot_task_id: payload.task_id })
    .eq("id", session.id);
  await failProposal(client, session.proposal_id, session.patient_id, session.id, msg);
}

export async function handleMerchantAuthenticated(client, payload) {
  const extUserId = payload.external_user_id;
  const merchantId = payload.merchant_id || DEFAULT_MERCHANT;

  if (!extUserId) return;

  const patientId = extUserIdToPatientId(extUserId);
  if (!patientId) return;

  await client
    .from("knot_merchant_accounts")
    .upsert({
      patient_id: patientId,
      external_user_id: extUserId,
      merchant_id: merchantId,
      merchant_name: payload.merchant_name || "Walmart",
      status: "connected",
      last_authenticated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: "patient_id,merchant_id" });

  await insertEvent(client, patientId, {
    type: "checkout",
    severity: "info",
    title: "Merchant account linked",
    message: `${payload.merchant_name || "Walmart"} account connected via Knot.`
  });
}

export async function handleAccountLoginRequired(client, payload) {
  const extUserId = payload.external_user_id;
  const merchantId = payload.merchant_id || DEFAULT_MERCHANT;
  if (!extUserId) return;
  const patientId = extUserIdToPatientId(extUserId);
  if (!patientId) return;

  await client
    .from("knot_merchant_accounts")
    .upsert({
      patient_id: patientId,
      external_user_id: extUserId,
      merchant_id: merchantId,
      status: "login_required",
      updated_at: new Date().toISOString()
    }, { onConflict: "patient_id,merchant_id" });

  await insertEvent(client, patientId, {
    type: "checkout",
    severity: "warning",
    title: "Merchant account needs reconnect",
    message: "The Walmart account has been disconnected. Please reconnect from Patient Settings."
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureMerchantLinked(client, patientId, extUserId, merchantId) {
  const { data } = await client
    .from("knot_merchant_accounts")
    .select("status")
    .eq("patient_id", patientId)
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (data?.status === "connected") return;

  const merchantMeta = Object.values(MERCHANTS).find(m => m.id === merchantId);
  const merchantName = merchantMeta?.name || "Merchant";

  // In development: auto-link via Knot dev endpoint
  if ((process.env.KNOT_ENVIRONMENT || "development") === "development") {
    console.log(`[knot] Dev: auto-linking ${merchantName} (${merchantId}) for ${extUserId}`);
    await devLinkShoppingAccount({ externalUserId: extUserId, merchantId });
    await client
      .from("knot_merchant_accounts")
      .upsert({
        patient_id: patientId,
        external_user_id: extUserId,
        merchant_id: merchantId,
        merchant_name: merchantName,
        status: "connected",
        last_authenticated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "patient_id,merchant_id" });
    return;
  }

  throw new Error(`${merchantName} account not connected. Please link the account from Patient Settings.`);
}

async function findSessionByTaskId(client, taskId) {
  if (!taskId) return null;
  const { data } = await client
    .from("checkout_sessions")
    .select("*")
    .eq("knot_task_id", taskId)
    .maybeSingle();
  return data;
}

async function failProposal(client, proposalId, patientId, sessionId, message) {
  await client
    .from("purchase_proposals")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", proposalId);
  await insertEvent(client, patientId, {
    type: "checkout",
    severity: "critical",
    title: "Checkout failed",
    message,
    related_id: sessionId
  });
}

async function insertEvent(client, patientId, payload) {
  await client.from("events").insert({ patient_id: patientId, ...payload });
}

function extUserIdToPatientId(extUserId) {
  const match = String(extUserId || "").match(/^patient:(.+)$/);
  return match ? match[1] : null;
}
