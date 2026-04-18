import { NextRequest, NextResponse } from "next/server";
import "@/lib/globals";
import type { GroceryCartItem } from "@/lib/globals";
import { analyzeGrocery } from "@/lib/vision";
import { logEvent } from "@/lib/events";
import { sendGroceryMessage } from "@/lib/imessage";
import { getAllTransactions } from "@/lib/knot";
import {
  findLowItems,
  loadGroceryGrounding,
  matchAll,
  type MatchResult,
} from "@/lib/groceryMatcher";

const CONFIDENCE_THRESHOLD = 0.6;
const DEDUP_MS = 10 * 60 * 1000;

export type { GroceryCartItem };

if (!globalThis.currentGroceryCart) globalThis.currentGroceryCart = [];
if (typeof globalThis.currentGroceryMerchantId === "undefined") {
  globalThis.currentGroceryMerchantId = null;
}
if (typeof globalThis.groceryReorderLastAt === "undefined") {
  globalThis.groceryReorderLastAt = new Map<string, number>();
}

function formatGroceryList(orderable: GroceryCartItem[], manualBuy: GroceryCartItem[]): string {
  const lines: string[] = ["🛒 Grocery Refill — Aegis"];

  if (orderable.length > 0) {
    lines.push("");
    lines.push("✅ Ready to order:");
    for (const item of orderable) {
      const brand = item.brand ? `${item.brand} ` : "";
      lines.push(`  • ${brand}${item.name} (x${item.quantity})`);
    }
  }

  if (manualBuy.length > 0) {
    lines.push("");
    lines.push("🏪 Manual buy (not orderable):");
    for (const item of manualBuy) {
      const brand = item.brand ? `${item.brand} ` : "";
      lines.push(`  • ${brand}${item.name}`);
    }
  }

  lines.push("");
  lines.push('Reply with changes ("remove milk, add OJ") or "approve" to place order.');
  return lines.join("\n");
}

function dedupFingerprint(results: MatchResult[]): string {
  return results
    .map((r) => r.grounding.name)
    .sort()
    .join("|");
}

export async function POST(req: NextRequest) {
  try {
    const { image, force } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const analysis = await analyzeGrocery(image);

    if (!force && (!analysis.low_supply || analysis.confidence < CONFIDENCE_THRESHOLD)) {
      return NextResponse.json({ action: "no_action", analysis });
    }

    const grounding = loadGroceryGrounding();
    const lowItems = findLowItems(analysis, grounding);

    logEvent(
      "grocery",
      "grocery_low_detected",
      `Low supply detected. Missing/low: ${lowItems.map((i) => i.name).join(", ") || "(unspecified)"}`,
      { confidence: analysis.confidence, missing: lowItems.map((i) => i.name) }
    );

    const fingerprint = dedupFingerprint(lowItems.map((g) => ({ grounding: g, match: null })));
    const lastAt = globalThis.groceryReorderLastAt.get(fingerprint) ?? 0;
    const nowTs = Date.now();
    if (!force && nowTs - lastAt < DEDUP_MS) {
      return NextResponse.json({
        action: "deduped",
        analysis,
        reason: `reorder for [${fingerprint}] already fired ${Math.round((nowTs - lastAt) / 1000)}s ago`,
      });
    }
    globalThis.groceryReorderLastAt.set(fingerprint, nowTs);

    const envMerchantId = process.env.KNOT_MERCHANT_ID ? Number(process.env.KNOT_MERCHANT_ID) : null;
    const groceryMerchantId: number | null =
      envMerchantId && !Number.isNaN(envMerchantId) ? envMerchantId : null;
    globalThis.currentGroceryMerchantId = groceryMerchantId;

    let matchResults: MatchResult[] = lowItems.map((g) => ({ grounding: g, match: null }));
    if (groceryMerchantId) {
      try {
        const transactions = await getAllTransactions(groceryMerchantId);
        matchResults = matchAll(lowItems, transactions);
      } catch (err) {
        console.error("[AEGIS] Knot call failed — falling back to vision-only list:", err);
      }
    } else {
      console.warn("[AEGIS] KNOT_MERCHANT_ID not set — skipping Knot lookup. Run `npm run prelink:knot`.");
    }

    const cart: GroceryCartItem[] = matchResults.map((r) =>
      r.match
        ? {
            name: r.match.name,
            brand: r.match.brand,
            quantity: r.match.quantity,
            external_id: r.match.external_id,
            merchant_id: r.match.merchant_id,
            orderable: !!r.match.external_id,
            source: "history" as const,
          }
        : {
            name: r.grounding.name,
            quantity: 1,
            orderable: false,
            source: "vision" as const,
          }
    );

    const unmatched = matchResults.filter((r) => !r.match).map((r) => r.grounding.name);
    if (unmatched.length > 0) {
      logEvent(
        "grocery",
        "grocery_low_unmatched",
        `No order history match for: ${unmatched.join(", ")}`,
        { items: unmatched }
      );
    }

    globalThis.currentGroceryCart = cart;

    const orderable = cart.filter((c) => c.orderable);
    const manualBuy = cart.filter((c) => !c.orderable);
    const message = formatGroceryList(orderable, manualBuy);

    await sendGroceryMessage(message);
    logEvent("grocery", "grocery_list_sent", "Sent refill list to family", {
      orderable_count: orderable.length,
      manual_count: manualBuy.length,
    });

    return NextResponse.json({
      action: "list_sent",
      analysis,
      cart,
      message,
    });
  } catch (error) {
    console.error("Grocery check error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
