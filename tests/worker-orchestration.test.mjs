import test from "node:test";
import assert from "node:assert/strict";
import { startInterval, sleep } from "../services/worker/queue.mjs";

test("startInterval runs worker on a timer", async () => {
  let calls = 0;
  const stop = startInterval("test-interval", 20, async () => {
    calls += 1;
  });

  await sleep(70);
  stop();
  assert.ok(calls >= 2);
});
