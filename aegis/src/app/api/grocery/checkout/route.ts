import { NextResponse } from "next/server";
import "@/lib/globals";
import { syncCart, checkout, type CartItem } from "@/lib/knot";
import { logEvent } from "@/lib/events";
import { sendGroceryMessage } from "@/lib/imessage";

export async function runGroceryCheckout() {
  const cart = globalThis.currentGroceryCart ?? [];
  const merchantId = globalThis.currentGroceryMerchantId;
  const orderable = cart.filter((it) => it.orderable && it.external_id);
  const manualBuy = cart.filter((it) => !it.orderable);

  if (!merchantId || orderable.length === 0) {
    const msg = manualBuy.length
      ? `⚠️ None of the ${manualBuy.length} item${manualBuy.length === 1 ? "" : "s"} can be auto-ordered. Please pick them up manually.`
      : "⚠️ No orderable items or merchant. Please check manually.";
    await sendGroceryMessage(msg);
    logEvent("grocery", "grocery_order_placed", "Order aborted — no orderable items");
    return { action: "aborted" as const, reason: "no_orderable_items" };
  }

  const products: CartItem[] = orderable.map((it) => ({
    external_id: it.external_id!,
    quantity: it.quantity,
  }));

  try {
    await syncCart(merchantId, products);
    const result = await checkout(merchantId);

    logEvent("grocery", "grocery_order_placed", `Order placed: ${orderable.length} items`, {
      merchant_id: merchantId,
      items: orderable.map((it) => it.name),
    });

    const manualNote = manualBuy.length
      ? `\n📝 Manual pickup still needed: ${manualBuy.map((m) => m.name).join(", ")}.`
      : "";
    const confirmation =
      `✅ Order placed! ${orderable.length} item${orderable.length === 1 ? "" : "s"} on the way.${manualNote}`;

    await sendGroceryMessage(confirmation);
    logEvent("grocery", "grocery_order_confirmed", "Confirmation sent to family");

    globalThis.currentGroceryCart = [];

    return { action: "placed" as const, result, items: orderable };
  } catch (err) {
    const msg = "⚠️ Could not place the order automatically. Please try from the store app.";
    await sendGroceryMessage(msg);
    logEvent("grocery", "grocery_order_placed", "Order failed", { error: String(err) });
    return { action: "failed" as const, error: String(err) };
  }
}

export async function POST() {
  try {
    const result = await runGroceryCheckout();
    const status = result.action === "failed" ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
