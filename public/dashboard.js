import { escapeHtml, request } from "/common.js";

const state = { latest: null };

function renderSubtitle(data) {
  const el = document.getElementById("dashboard-subtitle");
  const rel = data.patient.relationship || "";
  el.textContent = `Monitoring ${data.patient.name}${rel ? ` (${rel})` : ""}.`;
}

function renderProfile(data) {
  const target = document.getElementById("profile-summary");
  const card = data.paymentCard || { brand: "—", last4: "—", status: "—" };
  target.innerHTML = `
    <p><strong>Caretaker:</strong> ${escapeHtml(data.caretaker.name)}</p>
    <p class="muted">Phone: ${escapeHtml(data.caretaker.phone)}</p>
    <p><strong>Patient:</strong> ${escapeHtml(data.patient.name)}</p>
    <p class="muted">Relationship: ${escapeHtml(data.patient.relationship || "—")}</p>
    <p><strong>Payment card:</strong> ${escapeHtml(card.brand)} ending ${escapeHtml(card.last4)}</p>
    <p class="muted">Status: ${escapeHtml(card.status)}</p>
  `;
}

function renderCameras(data) {
  const target = document.getElementById("camera-status");
  target.innerHTML = "";

  data.cameras.forEach((camera) => {
    const item = document.createElement("article");
    item.className = "card";
    const href = camera.role === "medicine" ? "/camera/medicine" : "/camera/pantry";
    const safeLabel = escapeHtml(camera.label);
    const safeDevice = escapeHtml(camera.deviceName);
    const statusClass = camera.status.replaceAll("_", "-");
    const when = camera.lastSnapshotAt
      ? new Date(camera.lastSnapshotAt).toLocaleTimeString()
      : "not received";
    item.innerHTML = `
      <div class="card-row">
        <div>
          <h3>${safeLabel}</h3>
          <p class="muted">${safeDevice}</p>
        </div>
        <span class="status-pill status-${escapeHtml(statusClass)}">${escapeHtml(camera.status)}</span>
      </div>
      <p class="muted">Last snapshot: ${escapeHtml(when)}</p>
      <div class="card-actions">
        <a class="button button-secondary" href="${href}" target="_blank" rel="noopener">Open Cam →</a>
      </div>
    `;
    target.appendChild(item);
  });
}

function renderInventoryReadOnly(data) {
  const body = document.getElementById("inventory-body");
  body.innerHTML = data.inventory
    .map(
      (row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(String(row.targetQuantity))}</td>
      <td>${escapeHtml(String(row.lowStockThreshold))}</td>
      <td>${escapeHtml(row.preferredMerchant)}</td>
    </tr>
  `
    )
    .join("");
}

function renderPrescriptionsReadOnly(data) {
  const body = document.getElementById("prescription-body");
  body.innerHTML = data.prescriptions
    .map(
      (row) => `
    <tr>
      <td>${escapeHtml(row.medicineName)}</td>
      <td>${escapeHtml(String(row.expectedCount))}</td>
      <td>${escapeHtml(row.scheduledTime)}</td>
      <td>${escapeHtml(String(row.windowMinutes))} min</td>
      <td>${escapeHtml(row.purpose)}</td>
    </tr>
  `
    )
    .join("");
}

function renderProposals(data) {
  const target = document.getElementById("proposal-list");
  target.innerHTML = "";

  if (data.proposals.length === 0) {
    target.innerHTML =
      `<p class="muted">No purchase proposals yet. Use the pantry camera page to send a low-stock snapshot.</p>`;
    return;
  }

  data.proposals.forEach((proposal) => {
    const item = document.createElement("article");
    item.className = "card";
    const items = proposal.items.map((entry) => `${entry.name} x${entry.reorderQuantity}`).join(", ");
    const showActions = ["awaiting_approval", "review"].includes(proposal.status);
    const safeMerchant = escapeHtml(proposal.merchant);
    const safeItems = escapeHtml(items || "No items");
    const safeStatus = escapeHtml(proposal.status.replaceAll("_", " "));
    const statusClass = escapeHtml(proposal.status.replaceAll("_", "-"));

    item.innerHTML = `
      <div class="card-row">
        <div>
          <h3>${safeMerchant} grocery order</h3>
          <p class="muted">${safeItems}</p>
        </div>
        <span class="status-pill status-${statusClass}">${safeStatus}</span>
      </div>
      <p class="muted">Gemini confidence: ${Math.round(proposal.confidence * 100)}%</p>
      <p class="muted">Est. total: $${proposal.estimatedTotal.toFixed(2)}</p>
      ${
        showActions
          ? `<div class="card-actions">
               <button class="button proposal-approve" type="button" data-id="${escapeHtml(proposal.id)}">Approve &amp; Order via Knot</button>
               <button class="button button-secondary proposal-reject" type="button" data-id="${escapeHtml(proposal.id)}">Reject</button>
               <a class="button button-secondary" href="/dashboard/proposals/${escapeHtml(proposal.id)}">View Details →</a>
             </div>`
          : `<div class="card-actions">
               <a class="button button-secondary" href="/dashboard/proposals/${escapeHtml(proposal.id)}">View Details →</a>
             </div>`
      }
    `;
    target.appendChild(item);
  });

  target.querySelectorAll(".proposal-approve").forEach((button) => {
    button.addEventListener("click", async () => {
      await request(`/api/proposals/${button.dataset.id}/approve`, { method: "POST" });
      await loadState();
    });
  });

  target.querySelectorAll(".proposal-reject").forEach((button) => {
    button.addEventListener("click", async () => {
      await request(`/api/proposals/${button.dataset.id}/reject`, { method: "POST" });
      await loadState();
    });
  });
}

function renderEvents(data) {
  const target = document.getElementById("event-list");
  target.innerHTML = "";
  data.events.slice(0, 12).forEach((event) => {
    const item = document.createElement("article");
    item.className = "card event-card";
    const sev = escapeHtml(event.severity);
    item.innerHTML = `
      <div class="card-row">
        <div>
          <p class="event-severity">[${sev}] ${escapeHtml(event.title)}</p>
          <p class="muted">${escapeHtml(event.message)}</p>
        </div>
        <span class="muted time">${escapeHtml(new Date(event.createdAt).toLocaleTimeString())}</span>
      </div>
    `;
    target.appendChild(item);
  });
}

async function loadState() {
  const data = await request("/api/state");
  state.latest = data;
  renderSubtitle(data);
  renderProfile(data);
  renderCameras(data);
  renderInventoryReadOnly(data);
  renderPrescriptionsReadOnly(data);
  renderProposals(data);
  renderEvents(data);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

document.getElementById("reset-demo").addEventListener("click", async () => {
  await request("/api/demo/reset", { method: "POST" });
  await loadState();
});

document.getElementById("pair-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("pair-input");
  const feedback = document.getElementById("pair-feedback");
  const code = input.value.replace(/\D/g, "");

  if (code.length !== 6) {
    feedback.textContent = "Enter the 6-digit code from the nanny cam.";
    return;
  }

  feedback.textContent = "Pairing…";
  try {
    const camera = await request("/api/cameras/pair", {
      method: "POST",
      body: JSON.stringify({ code })
    });
    feedback.textContent = `${camera.label} paired as ${camera.deviceName}.`;
    input.value = "";
    showToast(`${camera.label} is now online.`);
    await loadState();
  } catch (error) {
    feedback.textContent = error.message;
  }
});

let pollTimer = null;

function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    loadState().catch((error) => {
      document.getElementById("live-indicator").textContent = error.message;
    });
  }, 4000);
}

loadState()
  .then(() => {
    document.getElementById("live-indicator").textContent = "Live";
    startPolling();
  })
  .catch((error) => {
    document.getElementById("event-list").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  });
