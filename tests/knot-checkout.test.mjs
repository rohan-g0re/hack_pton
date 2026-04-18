import test from "node:test";
import assert from "node:assert/strict";
import { knotPlaceOrder } from "../services/worker/knot-client.mjs";

test("knot sandbox succeeds without live credentials", async () => {
  const prevId = process.env.KNOT_CLIENT_ID;
  const prevSecret = process.env.KNOT_CLIENT_SECRET;
  delete process.env.KNOT_CLIENT_ID;
  delete process.env.KNOT_CLIENT_SECRET;

  const result = await knotPlaceOrder({
    items: [{ name: "Milk", reorderQuantity: 2 }],
    cardToken: "tok_demo",
    merchant: "Walmart"
  });

  assert.equal(result.ok, true);
  assert.equal(result.sandbox, true);

  process.env.KNOT_CLIENT_ID = prevId;
  process.env.KNOT_CLIENT_SECRET = prevSecret;
});
