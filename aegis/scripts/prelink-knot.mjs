#!/usr/bin/env node
// Prelink Knot: enumerate shopping merchants, pick one (by name or ID via CLI arg),
// simulate a dev Link Account, sync transactions, and dump discovered products.
//
// Usage:
//   node scripts/prelink-knot.mjs               # interactive: prints merchants, prompts
//   node scripts/prelink-knot.mjs --id 45       # use merchant id 45
//   node scripts/prelink-knot.mjs --name kroger # fuzzy-match merchant by name
//
// Writes:
//   data/knot-merchants.json  (list of shopping merchants)
//   data/knot-products.json   (products pulled from that merchant's order history)
// And prints the chosen merchant id so you can put it in .env as KNOT_MERCHANT_ID.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const BASE_URL = process.env.KNOT_BASE_URL ?? "https://development.knotapi.com";
const CLIENT_ID = process.env.KNOT_CLIENT_ID ?? "";
const SECRET = process.env.KNOT_SECRET ?? "";
const EXTERNAL_USER_ID = process.env.KNOT_EXTERNAL_USER_ID ?? "demo_elder_001";

if (!CLIENT_ID || !SECRET) {
  console.error("[prelink] KNOT_CLIENT_ID and KNOT_SECRET must be set in your environment (.env)");
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") out.id = Number(argv[++i]);
    else if (a === "--name") out.name = argv[++i];
  }
  return out;
}

async function knotGet(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function knotPost(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listShoppingMerchants() {
  return knotGet("/merchants?type=shopping");
}

async function createTestLink(merchantId) {
  // Dev-only helper: simulate a linked account for this external_user_id.
  // In staging/prod this is done via the Knot Link SDK from a client.
  try {
    return await knotPost("/link/test", {
      merchant_id: merchantId,
      external_user_id: EXTERNAL_USER_ID,
    });
  } catch (err) {
    console.warn(`[prelink] dev test-link endpoint not available (${err.message}); proceeding — assuming account already linked`);
    return null;
  }
}

async function syncAllTransactions(merchantId) {
  const all = [];
  let cursor;
  do {
    const body = {
      merchant_id: merchantId,
      external_user_id: EXTERNAL_USER_ID,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    };
    const page = await knotPost("/transactions/sync", body);
    all.push(...(page.transactions ?? []));
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return all;
}

function extractProducts(transactions) {
  const map = new Map();
  for (const tx of transactions) {
    for (const p of tx.products ?? []) {
      const key = `${(p.brand ?? "").toLowerCase()}::${p.name.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += p.quantity ?? 1;
      } else {
        map.set(key, {
          name: p.name,
          brand: p.brand,
          external_id: p.external_id,
          merchant_id: tx.merchant?.id,
          count: p.quantity ?? 1,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

async function choose(merchants, args) {
  if (args.id) {
    const m = merchants.find((x) => x.id === args.id);
    if (m) return m;
    console.error(`[prelink] no merchant with id=${args.id}`);
    process.exit(1);
  }
  if (args.name) {
    const needle = args.name.toLowerCase();
    const m = merchants.find((x) => x.name?.toLowerCase().includes(needle));
    if (m) return m;
    console.error(`[prelink] no merchant matching name="${args.name}"`);
    process.exit(1);
  }

  console.log("\nAvailable shopping merchants:");
  merchants.forEach((m, i) => {
    console.log(`  [${i}] id=${m.id}  ${m.name}`);
  });
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question("\nPick a merchant by index: ");
  rl.close();
  const idx = Number(answer);
  if (Number.isNaN(idx) || idx < 0 || idx >= merchants.length) {
    console.error("[prelink] invalid selection");
    process.exit(1);
  }
  return merchants[idx];
}

async function main() {
  const args = parseArgs(process.argv);

  console.log("[prelink] fetching shopping merchants...");
  const merchants = await listShoppingMerchants();

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "knot-merchants.json"), JSON.stringify(merchants, null, 2));

  const chosen = await choose(merchants, args);
  console.log(`[prelink] chosen merchant: id=${chosen.id} name="${chosen.name}"`);

  console.log("[prelink] attempting dev Link Account (test mode)...");
  await createTestLink(chosen.id);

  console.log("[prelink] syncing transactions (this may take a few seconds)...");
  const transactions = await syncAllTransactions(chosen.id);
  console.log(`[prelink] pulled ${transactions.length} transactions`);

  const products = extractProducts(transactions);
  fs.writeFileSync(
    path.join(dataDir, "knot-products.json"),
    JSON.stringify(
      {
        merchant_id: chosen.id,
        merchant_name: chosen.name,
        external_user_id: EXTERNAL_USER_ID,
        product_count: products.length,
        products,
      },
      null,
      2
    )
  );

  console.log(`[prelink] wrote data/knot-merchants.json and data/knot-products.json`);
  console.log(`\n✅ Done. Add this to your .env:`);
  console.log(`   KNOT_MERCHANT_ID=${chosen.id}\n`);
}

main().catch((err) => {
  console.error("[prelink] FAILED:", err);
  process.exit(1);
});
