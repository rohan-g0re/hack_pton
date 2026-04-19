import { escapeHtml, request } from "/common.js";

function proposalIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

function confidenceBar(pct) {
  const rounded = Math.round(pct * 100);
  return `
    <div class="confidence-row">
      <span>Confidence: ${rounded}%</span>
      <div class="confidence-track" role="progressbar" aria-valuenow="${rounded}" aria-valuemin="0" aria-valuemax="100">
        <div class="confidence-fill" style="width:${rounded}%"></div>
      </div>
    </div>
  `;
}

function sceneNarrative(proposal) {
  if (!proposal.items || proposal.items.length === 0) {
    return "No line items on this proposal.";
  }
  return proposal.items
    .map((item) => {
      const detected = item.detectedQuantity ?? "—";
      const threshold = item.threshold ?? item.lowStockThreshold ?? "—";
      return `• ${escapeHtml(item.name)}: ${escapeHtml(String(detected))} visible (threshold: ${escapeHtml(String(threshold))})`;
    })
    .join("<br/>");
}

function render(proposal, paymentCard, checkout) {
  const root = document.getElementById("proposal-root");
  const statusLabel = escapeHtml(proposal.status.replaceAll("_", " "));
  const created = new Date(proposal.createdAt).toLocaleString();
  const itemRows = proposal.items
    .map((entry) => {
      const unit = 4.25;
      const est = entry.reorderQuantity * unit;
      return `<tr>
        <td>${escapeHtml(entry.name)}</td>
        <td>${escapeHtml(String(entry.reorderQuantity))}</td>
        <td>$${est.toFixed(2)}</td>
      </tr>`;
    })
    .join("");

  const checkoutBlock =
    proposal.status === "completed" && checkout
      ? `
    <section class="panel wide">
      <h2>Checkout result</h2>
      <p>Provider: Knot API → ${escapeHtml(proposal.merchant)}</p>
      <p>Card used: ${escapeHtml(paymentCard.brand)} ending ${escapeHtml(paymentCard.last4)}</p>
      <p>Status: <span class="status-pill status-success">${escapeHtml(checkout.status)}</span></p>
      <p class="muted">Completed: ${escapeHtml(new Date(checkout.createdAt).toLocaleString())}</p>
    </section>
  `
      : "";

  const showActions = ["awaiting_approval", "review"].includes(proposal.status);

  root.innerHTML = `
    <header class="page-title-block">
      <h1>Purchase proposal</h1>
      <p class="muted">Status: <span class="status-pill status-${escapeHtml(
        proposal.status.replaceAll("_", "-")
      )}">${statusLabel}</span></p>
      <p class="muted">Merchant: ${escapeHtml(proposal.merchant)} · Created: ${escapeHtml(created)}</p>
    </header>

    <div class="proposal-split">
      <section class="panel">
        <h2>Items</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Item</th><th>Qty</th><th>Est.</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
        <p><strong>Total:</strong> $${proposal.estimatedTotal.toFixed(2)}</p>
      </section>
      <section class="panel">
        <h2>Gemini analysis</h2>
        <p class="muted">Model: Gemini 2.0 Flash</p>
        ${confidenceBar(proposal.confidence)}
        <p class="analysis-narrative"><strong>Scene detected:</strong><br/>${sceneNarrative(proposal)}</p>
      </section>
    </div>

    ${
      showActions
        ? `<div class="proposal-actions">
            <button class="button" type="button" id="approve-btn">Approve &amp; Order via Knot on ${escapeHtml(
              proposal.merchant
            )}</button>
            <button class="button button-secondary" type="button" id="reject-btn">Reject proposal</button>
           </div>`
        : ""
    }
    ${checkoutBlock}
  `;

  if (showActions) {
    document.getElementById("approve-btn").addEventListener("click", async () => {
      await request(`/api/proposals/${proposal.id}/approve`, { method: "POST" });
      await main();
    });
    document.getElementById("reject-btn").addEventListener("click", async () => {
      await request(`/api/proposals/${proposal.id}/reject`, { method: "POST" });
      await main();
    });
  }
}

async function main() {
  const id = proposalIdFromPath();
  const data = await request("/api/state");
  const proposal = data.proposals.find((p) => p.id === id);
  if (!proposal) {
    document.getElementById("proposal-root").innerHTML =
      `<p class="muted">Proposal not found. <a href="/dashboard">Return to dashboard</a></p>`;
    return;
  }

  const checkout = data.checkoutSessions?.find((c) => c.proposalId === proposal.id);
  render(proposal, data.paymentCard, checkout);
}

main().catch((error) => {
  document.getElementById("proposal-root").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
});
