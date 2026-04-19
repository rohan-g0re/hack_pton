/**
 * Knot API client — development.knotapi.com
 * Basic auth, Knot-Version: 2.0, async webhook-driven flow.
 */

function knotBaseUrl() {
  if (process.env.KNOT_API_BASE) return process.env.KNOT_API_BASE.replace(/\/$/, "");
  return process.env.KNOT_ENVIRONMENT === "production"
    ? "https://production.knotapi.com"
    : "https://development.knotapi.com";
}

function knotBasicAuthHeader() {
  const clientId = process.env.KNOT_CLIENT_ID;
  const secret = process.env.KNOT_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error("Knot credentials missing. Set KNOT_CLIENT_ID and KNOT_CLIENT_SECRET.");
  }
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
}

async function knotRequest(path, body, { method = "POST", timeoutMs = 30_000 } = {}) {
  const url = `${knotBaseUrl()}${path}`;
  const opts = {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Authorization": knotBasicAuthHeader(),
      "Content-Type": "application/json",
      "Knot-Version": "2.0"
    }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.error_message || data?.message || text || "Unknown Knot error";
    const code = data?.error_code || res.status;
    throw new Error(`Knot ${code}: ${msg}`);
  }
  return data;
}

// ── Merchant Discovery ────────────────────────────────────────────────────────

export async function listShoppingMerchants({ search } = {}) {
  return knotRequest("/merchant/list", {
    type: "shopping",
    platform: "web",
    ...(search ? { search } : {})
  });
}

// ── Sessions ──────────────────────────────────────────────────────────────────

function sessionFlow(sessionType) {
  if (sessionType === "vault") return "payment_vault";
  if (sessionType === "transaction_link") return "order_history";
  return "shopping_link";
}

export async function createKnotSession({ externalUserId, merchantId, patientId, purpose }) {
  const merchant = Object.values(MERCHANTS).find(m => m.id === Number(merchantId));
  const sessionType = purpose === "order_history"
    ? "transaction_link"
    : merchant?.type === "card_switcher" ? "vault" : "link";

  // merchant_ids is NOT a valid session/create field — merchant is passed only via SDK open()
  const result = await knotRequest("/session/create", {
    type: sessionType,
    external_user_id: externalUserId,
    metadata: {
      patient_id: String(patientId),
      flow: sessionFlow(sessionType)
    }
  });
  return { session: result.session, sessionType };
}

// keep old name as alias for worker usage
export async function createShoppingLinkSession({ externalUserId, merchantId, patientId }) {
  const { session } = await createKnotSession({ externalUserId, merchantId, patientId });
  return session;
}

export async function createVaultSession({ externalUserId, patientId }) {
  const result = await knotRequest("/session/create", {
    type: "vault",
    external_user_id: externalUserId,
    metadata: { patient_id: String(patientId), flow: "payment_vault" }
  });
  return result.session;
}

export async function extendKnotSession(sessionId) {
  const result = await knotRequest("/session/extend", { session_id: sessionId });
  return result.session;
}

// ── Development Only ──────────────────────────────────────────────────────────

export async function devLinkShoppingAccount({ externalUserId, merchantId }) {
  return knotRequest("/development/accounts/link", {
    external_user_id: externalUserId,
    merchant_id: Number(merchantId)
  });
}

// ── Shopping ──────────────────────────────────────────────────────────────────

export async function syncKnotCart({ externalUserId, merchantId, products, deliveryLocation, simulate }) {
  return knotRequest("/cart", {
    external_user_id: externalUserId,
    merchant_id: Number(merchantId),
    products: products.map(p => ({
      external_id: String(p.externalId),
      ...(p.quantity ? { quantity: Number(p.quantity) } : {})
    })),
    ...(deliveryLocation ? { delivery_location: deliveryLocation } : {}),
    ...(simulate ? { simulate } : {})
  });
}

export async function checkoutKnotCart({ externalUserId, merchantId, paymentMethod, simulate }) {
  return knotRequest("/cart/checkout", {
    external_user_id: externalUserId,
    merchant_id: Number(merchantId),
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    ...(simulate ? { simulate } : {})
  });
}

// ── Merchant Catalog ─────────────────────────────────────────────────────────
// type: "shopping"      → POST /cart then /cart/checkout
// type: "card_switcher" → SDK-based payment method update at merchant

export const MERCHANTS = {
  amazon: {
    id: 44,
    name: "Amazon",
    type: "shopping",
    category: "Grocery & General",
    useCase: "pantry"
  }
};

// ── Product Catalogs (curated external IDs per merchant) ─────────────────────

const PRODUCT_CATALOG = {
  // Amazon (merchant_id: 44) — pantry staples via ASINs
  44: {
    milk:        { externalId: "B07FG1NQMR", label: "Whole Milk, 1 Gallon" },
    bananas:     { externalId: "B0753GVHKQ", label: "Fresh Bananas" },
    oatmeal:     { externalId: "B00004R8LR", label: "Quaker Old Fashioned Rolled Oats" },
    apples:      { externalId: "B07H7TJWDG", label: "Gala Apples" },
    oranges:     { externalId: "B07H7TXNGT", label: "Navel Oranges, 4 lb bag" },
    eggs:        { externalId: "B07FH8BGLZ", label: "Large Eggs, 12 ct" },
    bread:       { externalId: "B07FMQG5FW", label: "Whole Wheat Bread" },
    butter:      { externalId: "B00F2KFMDO", label: "Unsalted Butter, 1 lb" },
    rice:        { externalId: "B00850QYSS", label: "Long Grain White Rice, 5 lb" },
    yogurt:      { externalId: "B07BHHZ7Z6", label: "Greek Yogurt Plain" },
    chicken:     { externalId: "B07X6W1VXL", label: "Boneless Chicken Breast, 2 lb" },
    water:       { externalId: "B01M0MXSPP", label: "Spring Water, 24 ct" },
    juice:       { externalId: "B00CQNPQWE", label: "Orange Juice, 52 fl oz" },
    cereal:      { externalId: "B00NH5KLIM", label: "Cheerios Cereal" },
    coffee:      { externalId: "B00M0V9L8Y", label: "Ground Coffee, 30.5 oz" }
  },
  // Walgreens-equivalent health items (routed through Amazon for demo)
  999: {
    vitamins:      { externalId: "wal-vitamins-d3",    label: "Nature Made Vitamin D3" },
    allergy:       { externalId: "wal-allergy-relief", label: "Walgreens Allergy Relief" },
    bandages:      { externalId: "wal-bandages",       label: "Walgreens Adhesive Bandages" },
    tylenol:       { externalId: "wal-tylenol-500",    label: "Tylenol Extra Strength 500mg" },
    ibuprofen:     { externalId: "wal-ibuprofen-200",  label: "Ibuprofen 200mg, 100 ct" },
    melatonin:     { externalId: "wal-melatonin-5mg",  label: "Melatonin 5mg Sleep Aid" },
    ensure:        { externalId: "wal-ensure-vanilla", label: "Ensure Nutrition Shake" }
  }
};

/**
 * Map proposal item names to Knot product external_ids for a given merchant.
 * Returns { products, unmapped }.
 */
export function mapProposalItemsToProducts(items, merchantId = 45) {
  const catalog = PRODUCT_CATALOG[Number(merchantId)] || PRODUCT_CATALOG[45];
  const products = [];
  const unmapped = [];

  for (const item of items) {
    const key = String(item.name || "").toLowerCase().trim();
    const entry = catalog[key];
    if (entry) {
      products.push({ externalId: entry.externalId, label: entry.label, quantity: item.reorderQuantity || 1 });
    } else {
      unmapped.push(item.name);
    }
  }

  return { products, unmapped };
}

/** Preferred merchant for a given use case. */
export function merchantForUseCase(useCase) {
  const entry = Object.values(MERCHANTS).find(m => m.useCase === useCase && m.type === "shopping");
  return entry ? entry.id : 45;
}

export const DEFAULT_MERCHANT_ID = 44; // Amazon
