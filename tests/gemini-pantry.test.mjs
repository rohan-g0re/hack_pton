import test from "node:test";
import assert from "node:assert/strict";
import { buildLowStockItems, proposalSignature } from "../services/worker/pantry-analysis.mjs";
import { createSeedState } from "../src/demo-data.mjs";

test("pantry low-stock scene produces Milk reorder", () => {
  const state = createSeedState();
  const scene = state.scenes.pantry.find((s) => s.id === "pantry-low");
  const inventory = state.inventory;

  const low = buildLowStockItems(inventory, scene);
  assert.ok(low.some((item) => item.name === "Milk" && item.reorderQuantity > 0));
  assert.match(proposalSignature(low), /Milk/);
});

test("healthy pantry scene yields no low items", () => {
  const state = createSeedState();
  const scene = state.scenes.pantry.find((s) => s.id === "pantry-full");
  const low = buildLowStockItems(state.inventory, scene);
  assert.equal(low.length, 0);
});
