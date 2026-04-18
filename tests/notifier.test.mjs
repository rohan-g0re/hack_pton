import test from "node:test";
import assert from "node:assert/strict";
import { sendIMessage } from "../services/notifier/photon-client.mjs";

test("photon stub sends without credentials", async () => {
  delete process.env.PHOTON_PROJECT_ID;
  delete process.env.PHOTON_SECRET_KEY;
  const result = await sendIMessage({ toPhone: "+16095550144", body: "Hello from tests" });
  assert.equal(result.ok, true);
  assert.equal(result.stub, true);
});
