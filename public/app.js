const state = {
  latest: null
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]
  ));
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

function renderProfile(data) {
  const form = document.getElementById("profile-form");
  if (form.contains(document.activeElement)) {
    return;
  }
  form.caretakerName.value = data.caretaker.name;
  form.phone.value = data.caretaker.phone;
  form.patientName.value = data.patient.name;
}

function renderCameras(data) {
  const target = document.getElementById("camera-status");
  target.innerHTML = "";

  data.cameras.forEach((camera) => {
    const item = document.createElement("article");
    item.className = "card";
    const safeLabel = escapeHtml(camera.label);
    const safeDevice = escapeHtml(camera.deviceName);
    const safeStatus = escapeHtml(camera.status);
    const safeScene = escapeHtml(camera.lastSceneId || "none yet");
    item.innerHTML = `
      <div class="card-row">
        <div>
          <h3>${safeLabel}</h3>
          <p class="muted">${safeDevice}</p>
        </div>
        <span class="status-pill status-${safeStatus}">${safeStatus}</span>
      </div>
      <p class="muted">Last scene: ${safeScene}</p>
      <p class="muted">Last snapshot: ${camera.lastSnapshotAt ? new Date(camera.lastSnapshotAt).toLocaleTimeString() : "not received"}</p>
    `;
    target.appendChild(item);
  });
}

function rowTemplate(row, prefix, fields) {
  const wrap = document.createElement("div");
  wrap.className = "grid-row";
  wrap.innerHTML = fields
    .map((field) => {
      const value = row[field.key];
      return `
        <label>
          ${escapeHtml(field.label)}
          <input data-key="${escapeHtml(field.key)}" data-prefix="${escapeHtml(prefix)}" data-id="${escapeHtml(row.id)}" value="${escapeHtml(value)}" />
        </label>
      `;
    })
    .join("");
  return wrap;
}

function renderInventory(data) {
  const target = document.getElementById("inventory-form");
  if (target.contains(document.activeElement)) {
    return;
  }
  target.innerHTML = "";
  data.inventory.forEach((item) => {
    target.appendChild(
      rowTemplate(item, "inventory", [
        { key: "name", label: "Item" },
        { key: "targetQuantity", label: "Target qty" },
        { key: "lowStockThreshold", label: "Low-stock threshold" },
        { key: "preferredMerchant", label: "Merchant" }
      ])
    );
  });
}

function renderPrescriptions(data) {
  const target = document.getElementById("prescription-form");
  if (target.contains(document.activeElement)) {
    return;
  }
  target.innerHTML = "";
  data.prescriptions.forEach((item) => {
    target.appendChild(
      rowTemplate(item, "prescription", [
        { key: "medicineName", label: "Medicine" },
        { key: "expectedCount", label: "Expected count" },
        { key: "scheduledTime", label: "Scheduled time" },
        { key: "windowMinutes", label: "Window mins" },
        { key: "purpose", label: "Purpose" }
      ])
    );
  });
}

function renderProposals(data) {
  const target = document.getElementById("proposal-list");
  target.innerHTML = "";

  if (data.proposals.length === 0) {
    target.innerHTML = `<p class="muted">No purchase proposals yet. Use the pantry camera page to send a low-stock snapshot.</p>`;
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

    item.innerHTML = `
      <div class="card-row">
        <div>
          <h3>${safeMerchant} proposal</h3>
          <p class="muted">${safeItems}</p>
        </div>
        <span class="status-pill status-${escapeHtml(proposal.status.replaceAll("_", "-"))}">${safeStatus}</span>
      </div>
      <p class="muted">Confidence: ${Math.round(proposal.confidence * 100)}%</p>
      <p class="muted">Estimated total: $${proposal.estimatedTotal.toFixed(2)}</p>
      ${
        showActions
          ? `<div class="card-actions">
               <button class="button proposal-approve" data-id="${escapeHtml(proposal.id)}">Approve checkout</button>
               <button class="button button-secondary proposal-reject" data-id="${escapeHtml(proposal.id)}">Reject</button>
             </div>`
          : ""
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
  data.events.slice(0, 10).forEach((event) => {
    const item = document.createElement("article");
    item.className = "card";
    item.innerHTML = `
      <div class="card-row">
        <div>
          <h3>${escapeHtml(event.title)}</h3>
          <p class="muted">${escapeHtml(event.message)}</p>
        </div>
        <span class="status-pill status-${escapeHtml(event.severity)}">${escapeHtml(event.severity)}</span>
      </div>
      <p class="muted">${new Date(event.createdAt).toLocaleString()}</p>
    `;
    target.appendChild(item);
  });
}

function collectRows(prefix) {
  const rows = new Map();
  document.querySelectorAll(`input[data-prefix="${prefix}"]`).forEach((input) => {
    const id = input.dataset.id;
    const row = rows.get(id) || { id };
    row[input.dataset.key] = input.value;
    rows.set(id, row);
  });
  return Array.from(rows.values());
}

async function loadState() {
  const data = await request("/api/state");
  state.latest = data;
  renderProfile(data);
  renderCameras(data);
  renderInventory(data);
  renderPrescriptions(data);
  renderProposals(data);
  renderEvents(data);
}

document.getElementById("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await request("/api/profile", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form.entries()))
  });
  await loadState();
});

document.getElementById("save-inventory").addEventListener("click", async () => {
  const items = collectRows("inventory").map((item) => ({
    ...item,
    targetQuantity: Number(item.targetQuantity),
    lowStockThreshold: Number(item.lowStockThreshold)
  }));
  await request("/api/inventory", { method: "POST", body: JSON.stringify({ items }) });
  await loadState();
});

document.getElementById("save-prescriptions").addEventListener("click", async () => {
  const items = collectRows("prescription").map((item) => ({
    ...item,
    expectedCount: Number(item.expectedCount),
    windowMinutes: Number(item.windowMinutes)
  }));
  await request("/api/prescriptions", { method: "POST", body: JSON.stringify({ items }) });
  await loadState();
});

document.getElementById("reset-demo").addEventListener("click", async () => {
  await request("/api/demo/reset", { method: "POST" });
  await loadState();
});

setInterval(() => {
  loadState().catch((error) => {
    document.getElementById("live-indicator").textContent = error.message;
  });
}, 3000);

loadState().catch((error) => {
  document.getElementById("event-list").innerHTML = `<p class="muted">${error.message}</p>`;
});
