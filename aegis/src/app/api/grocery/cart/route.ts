import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import "@/lib/globals";
import type { GroceryCartItem } from "@/lib/globals";
import { PROMPTS } from "@/lib/prompts";
import { logEvent } from "@/lib/events";
import { sendGroceryMessage } from "@/lib/imessage";
import { runGroceryCheckout } from "../checkout/route";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

if (!globalThis.currentGroceryCart) globalThis.currentGroceryCart = [];

interface CartEditResult {
  approved: boolean;
  cart: string[];
  changes_made: string;
  message: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter(Boolean));
}

function fuzzyMatch(
  name: string,
  existing: GroceryCartItem[]
): GroceryCartItem | undefined {
  const target = normalize(name);
  const exact = existing.find((it) => normalize(it.brand ? `${it.brand} ${it.name}` : it.name) === target);
  if (exact) return exact;

  const nameMatch = existing.find((it) => normalize(it.name) === target);
  if (nameMatch) return nameMatch;

  const targetTokens = tokens(name);
  let best: { item: GroceryCartItem; score: number } | null = null;
  for (const it of existing) {
    const itemTokens = tokens(it.brand ? `${it.brand} ${it.name}` : it.name);
    const overlap = Array.from(targetTokens).filter((t) => itemTokens.has(t)).length;
    const score = overlap / Math.max(targetTokens.size, itemTokens.size, 1);
    if (score > 0.5 && (!best || score > best.score)) {
      best = { item: it, score };
    }
  }
  return best?.item;
}

function mergeNames(updatedNames: string[], existing: GroceryCartItem[]): GroceryCartItem[] {
  return updatedNames.map((name) => {
    const match = fuzzyMatch(name, existing);
    if (match) return match;
    return {
      name,
      quantity: 1,
      orderable: false,
      source: "vision" as const,
    };
  });
}

export async function GET() {
  const cart = globalThis.currentGroceryCart ?? [];
  if (cart.length === 0) {
    return NextResponse.json({ cart: [], items: [], total: 0 });
  }
  return NextResponse.json({
    cart,
    items: cart,
    total: cart.length,
    merchantId: globalThis.currentGroceryMerchantId ?? null,
  });
}

export async function POST(req: NextRequest) {
  void req;
  try {
    const { reply } = await req.json();
    if (!reply) {
      return NextResponse.json({ error: "No reply provided" }, { status: 400 });
    }

    const currentCart = globalThis.currentGroceryCart ?? [];
    const cartNames = currentCart.map((it) =>
      it.brand ? `${it.brand} ${it.name}` : it.name
    );

    const prompt = PROMPTS.cartEditor
      .replace("{CURRENT_CART}", JSON.stringify(cartNames))
      .replace("{USER_MESSAGE}", reply);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let edit: CartEditResult;
    try {
      edit = JSON.parse(raw) as CartEditResult;
    } catch {
      edit = {
        approved: false,
        cart: cartNames,
        changes_made: "Could not parse request",
        message: "Sorry, I didn't understand. Please try again.",
      };
    }

    const updated = mergeNames(edit.cart, currentCart);
    globalThis.currentGroceryCart = updated;

    logEvent("grocery", "grocery_cart_updated", edit.changes_made || "Cart edited", {
      cart: edit.cart,
      approved: edit.approved,
    });

    if (edit.approved) {
      logEvent("grocery", "grocery_order_approved", "Family approved the order");
      const checkoutResult = await runGroceryCheckout();
      return NextResponse.json({
        action: "approved",
        edit,
        checkout: checkoutResult,
      });
    }

    await sendGroceryMessage(edit.message);

    return NextResponse.json({ action: "updated", edit, cart: updated });
  } catch (error) {
    console.error("Cart edit error:", error);
    return NextResponse.json({ error: "Cart edit failed" }, { status: 500 });
  }
}
