import { knotPlaceOrder } from "./knot-client.mjs";

export async function runKnotCheckoutForProposal(client, proposalId) {
  const proposalRes = await client.from("purchase_proposals").select("*").eq("id", proposalId).maybeSingle();

  if (proposalRes.error) {
    throw proposalRes.error;
  }

  const proposal = proposalRes.data;
  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  if (proposal.status !== "approved") {
    throw new Error(`Proposal is not approved (status=${proposal.status}).`);
  }

  const cards = await client
    .from("payment_cards")
    .select("*")
    .eq("patient_id", proposal.patient_id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (cards.error) {
    throw cards.error;
  }

  if (!cards.data?.length) {
    throw new Error("Add a payment card first.");
  }

  const card = cards.data[0];

  const checkoutInsert = await client
    .from("checkout_sessions")
    .insert({
      proposal_id: proposal.id,
      patient_id: proposal.patient_id,
      provider: "Knot API",
      merchant: proposal.merchant || "Walmart",
      status: "pending",
      card_last_four: card.card_last_four
    })
    .select()
    .single();

  if (checkoutInsert.error) {
    throw checkoutInsert.error;
  }

  const checkout = checkoutInsert.data;

  try {
    const result = await knotPlaceOrder({
      items: proposal.items || [],
      cardToken: card.knot_card_token,
      merchant: proposal.merchant || "Walmart"
    });

    await client
      .from("checkout_sessions")
      .update({
        status: "success",
        knot_session_id: result.knot_session_id || result.session_id || null
      })
      .eq("id", checkout.id);

    await client
      .from("purchase_proposals")
      .update({
        status: "completed",
        checkout_id: checkout.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", proposal.id);

    await client.from("events").insert({
      patient_id: proposal.patient_id,
      type: "checkout",
      severity: "success",
      title: "Checkout completed",
      message: `Knot checkout completed for ${(proposal.items || []).map((i) => i.name).join(", ")}.`,
      related_id: checkout.id
    });

    return { checkout: { ...checkout, status: "success" }, proposal: { ...proposal, status: "completed" } };
  } catch (error) {
    await client.from("checkout_sessions").update({ status: "failed" }).eq("id", checkout.id);
    await client
      .from("purchase_proposals")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", proposal.id);

    await client.from("events").insert({
      patient_id: proposal.patient_id,
      type: "checkout",
      severity: "critical",
      title: "Checkout failed",
      message: String(error.message || error),
      related_id: checkout.id
    });

    throw error;
  }
}

/** Worker poll: proposals approved but not yet checked out. */
export async function findApprovedProposalsPendingCheckout(client) {
  const { data, error } = await client
    .from("purchase_proposals")
    .select("*")
    .eq("status", "approved")
    .is("checkout_id", null);

  if (error) {
    throw error;
  }
  return data || [];
}
