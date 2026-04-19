import { escapeHtml, request } from "/common.js";

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function inventoryRowTemplate(row) {
  const id = row.id || makeId("inv");
  return `
    <div class="inv-row" data-id="${escapeHtml(id)}">
      <label>Item<input class="inv-name" value="${escapeHtml(row.name)}" /></label>
      <label>Target qty<input class="inv-target" type="number" min="0" value="${escapeHtml(
        String(row.targetQuantity)
      )}" /></label>
      <label>Low-stock threshold<input class="inv-low" type="number" min="0" value="${escapeHtml(
        String(row.lowStockThreshold)
      )}" /></label>
      <label>Merchant<input class="inv-merchant" value="${escapeHtml(row.preferredMerchant)}" /></label>
      <button type="button" class="button button-secondary row-remove" aria-label="Remove row">×</button>
    </div>
  `;
}

function prescriptionRowTemplate(row) {
  const id = row.id || makeId("rx");
  return `
    <div class="rx-row" data-id="${escapeHtml(id)}">
      <label>Medicine<input class="rx-name" value="${escapeHtml(row.medicineName)}" /></label>
      <label>Count<input class="rx-count" type="number" min="0" value="${escapeHtml(
        String(row.expectedCount)
      )}" /></label>
      <label>Time<input class="rx-time" value="${escapeHtml(row.scheduledTime)}" placeholder="14:00" /></label>
      <label>Window (min)<input class="rx-window" type="number" min="0" value="${escapeHtml(
        String(row.windowMinutes)
      )}" /></label>
      <label>Purpose<input class="rx-purpose" value="${escapeHtml(row.purpose)}" /></label>
      <button type="button" class="button button-secondary row-remove" aria-label="Remove row">×</button>
    </div>
  `;
}

function wireRemoveButtons(container) {
  container.querySelectorAll(".row-remove").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".inv-row, .rx-row")?.remove();
    });
  });
}

function collectInventory() {
  const rows = document.querySelectorAll("#inventory-rows .inv-row");
  return Array.from(rows).map((row) => ({
    id: row.dataset.id,
    name: row.querySelector(".inv-name").value,
    targetQuantity: Number(row.querySelector(".inv-target").value),
    lowStockThreshold: Number(row.querySelector(".inv-low").value),
    preferredMerchant: row.querySelector(".inv-merchant").value
  }));
}

function collectPrescriptions() {
  const rows = document.querySelectorAll("#prescription-rows .rx-row");
  return Array.from(rows).map((row) => ({
    id: row.dataset.id,
    medicineName: row.querySelector(".rx-name").value,
    expectedCount: Number(row.querySelector(".rx-count").value),
    scheduledTime: row.querySelector(".rx-time").value,
    windowMinutes: Number(row.querySelector(".rx-window").value),
    purpose: row.querySelector(".rx-purpose").value
  }));
}

function renderCardSummary(card) {
  document.getElementById("card-summary").innerHTML = `
    <p><strong>Current card:</strong> ${escapeHtml(card.brand)} ending ${escapeHtml(card.last4)}</p>
    <p class="muted">Status: ${escapeHtml(card.status)}</p>
  `;
}

let knotMerchants = [];

async function loadKnotMerchants() {
  const data = await request("/api/knot/merchants");
  knotMerchants = data.merchants || [];
  renderMerchantList();
}

function renderMerchantList() {
  const container = document.getElementById("knot-merchant-list");
  if (!knotMerchants.length) { container.innerHTML = `<p class="muted">No merchants available.</p>`; return; }

  container.innerHTML = knotMerchants.map(m => `
    <div class="inv-row" style="align-items:center;gap:1rem;">
      <span style="flex:1"><strong>${escapeHtml(m.name)}</strong>
        <span class="status-pill" style="font-size:0.7rem;margin-left:0.5rem">${escapeHtml(m.category)}</span>
      </span>
      <span class="muted" style="font-size:0.8rem">${m.type === "card_switcher" ? "Card management" : "Shopping"}</span>
      <button type="button" class="button" style="padding:0.3rem 0.75rem;font-size:0.85rem"
        data-merchant-id="${escapeHtml(String(m.id))}"
        data-merchant-name="${escapeHtml(m.name)}"
        data-merchant-type="${escapeHtml(m.type)}">
        Link →
      </button>
    </div>
  `).join("");

  container.querySelectorAll("[data-merchant-id]").forEach(btn => {
    btn.addEventListener("click", () => openKnotSDK({
      merchantId: Number(btn.dataset.merchantId),
      merchantName: btn.dataset.merchantName,
      merchantType: btn.dataset.merchantType
    }));
  });
}

async function openKnotSDK({ merchantId, merchantName, merchantType }) {
  const hint = document.getElementById("knot-hint");
  hint.textContent = `Opening Knot for ${merchantName}…`;

  try {
    const init = await request("/api/knot/session", {
      method: "POST",
      body: JSON.stringify({ merchantId })
    });

    const KnotapiJS = window.KnotapiJS?.default || window.KnotapiJS;
    if (!KnotapiJS) {
      hint.textContent = "Knot SDK not loaded. Check network connection.";
      return;
    }

    const knotapi = new KnotapiJS();
    knotapi.open({
      sessionId: init.sessionId,
      clientId: init.clientId,
      environment: init.environment,
      merchantIds: init.merchantIds,
      entryPoint: "patient_payment_setup",
      useCategories: init.sessionType !== "card_switcher",
      useSearch: init.sessionType !== "card_switcher",
      locale: "en-US",
      onSuccess: () => {
        hint.textContent = `${merchantName} account linked!`;
        loadKnotMerchants();
      },
      onError: (code, desc) => {
        const codeStr = typeof code === "object" ? JSON.stringify(code) : String(code ?? "");
        const descStr = typeof desc === "object" ? JSON.stringify(desc) : String(desc ?? "");
        console.error("Knot onError:", code, desc);
        hint.textContent = `Knot error: ${codeStr}${descStr ? " — " + descStr : ""}`;
      },
      onExit: () => {
        if (hint.textContent.startsWith("Opening Knot")) hint.textContent = "";
      },
      onEvent: async (event) => {
        if (event === "REFRESH_SESSION_REQUEST") {
          await request("/api/knot/session/extend", {
            method: "POST",
            body: JSON.stringify({ sessionId: init.sessionId })
          });
        }
      }
    });
  } catch (err) {
    hint.textContent = `Error: ${err.message}`;
  }
}

async function hydrate() {
  const data = await request("/api/state");
  document.getElementById("patient-title").textContent = `Settings for ${data.patient.name}`;
  const inv = document.getElementById("inventory-rows");
  inv.innerHTML = data.inventory.map((item) => inventoryRowTemplate(item)).join("");
  wireRemoveButtons(inv);

  const rx = document.getElementById("prescription-rows");
  rx.innerHTML = data.prescriptions.map((item) => prescriptionRowTemplate(item)).join("");
  wireRemoveButtons(rx);

  renderCardSummary(data.paymentCard || { brand: "—", last4: "—", status: "—" });
  loadKnotMerchants().catch(() => {});
}

document.getElementById("add-inventory").addEventListener("click", () => {
  const inv = document.getElementById("inventory-rows");
  const wrap = document.createElement("div");
  wrap.innerHTML = inventoryRowTemplate({
    id: makeId("inv"),
    name: "",
    targetQuantity: 1,
    lowStockThreshold: 1,
    preferredMerchant: "Walmart"
  });
  inv.appendChild(wrap.firstElementChild);
  wireRemoveButtons(inv);
});

document.getElementById("add-prescription").addEventListener("click", () => {
  const rx = document.getElementById("prescription-rows");
  const wrap = document.createElement("div");
  wrap.innerHTML = prescriptionRowTemplate({
    id: makeId("rx"),
    medicineName: "",
    expectedCount: 1,
    scheduledTime: "14:00",
    windowMinutes: 30,
    purpose: ""
  });
  rx.appendChild(wrap.firstElementChild);
  wireRemoveButtons(rx);
});

document.getElementById("save-inventory").addEventListener("click", async () => {
  const items = collectInventory();
  await request("/api/inventory", { method: "POST", body: JSON.stringify({ items }) });
  await hydrate();
});

document.getElementById("save-prescriptions").addEventListener("click", async () => {
  const items = collectPrescriptions();
  await request("/api/prescriptions", { method: "POST", body: JSON.stringify({ items }) });
  await hydrate();
});

document.getElementById("update-card").addEventListener("click", () => {
  alert("Card vaulting requires Knot SDK integration. Use the Knot merchant linking flow above to set up payment.");
});

hydrate().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<p class="muted">${escapeHtml(error.message)}</p>`);
});
