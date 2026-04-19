import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, requireE164, resolvePhotonConfig } from "../services/photon/config.mjs";

// --- normalizePhone ---

test("normalizePhone: E.164 with spaces/hyphens normalizes correctly", () => {
  assert.equal(normalizePhone("+1 609-555-0100"), "+16095550100");
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
});

test("normalizePhone: number without leading + gets + prepended", () => {
  assert.equal(normalizePhone("16095550100"), "+16095550100");
});

test("normalizePhone: already clean E.164 passes through", () => {
  assert.equal(normalizePhone("+16095550100"), "+16095550100");
});

test("normalizePhone: bare number without country code returns null", () => {
  assert.equal(normalizePhone("6095550100"), null);
});

test("normalizePhone: empty/null returns null", () => {
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(""), null);
});

// --- requireE164 ---

test("requireE164: valid phone returns normalized value", () => {
  assert.equal(requireE164("+1 609-555-0100"), "+16095550100");
});

test("requireE164: bare 10-digit number without country code throws actionable error", () => {
  assert.throws(
    () => requireE164("6095550100", "caretaker_phone"),
    /caretaker_phone.*E\.164/
  );
});

// --- resolvePhotonConfig ---

test("resolvePhotonConfig: returns normalized config from env vars", () => {
  process.env.PHOTON_PROJECT_ID = "proj-abc";
  process.env.PHOTON_PROJECT_SECRET = "secret-xyz";
  process.env.CARETAKER_PHONE = "+1 609-555-0100";
  process.env.PHOTON_AGENT_POLL_MS = "3000";

  const cfg = resolvePhotonConfig();
  assert.equal(cfg.projectId, "proj-abc");
  assert.equal(cfg.projectSecret, "secret-xyz");
  assert.equal(cfg.caretakerPhone, "+16095550100");
  assert.equal(cfg.pollMs, 3000);
  assert.equal(cfg.usingAlias, false);
  assert.equal(cfg.enabled, true);

  delete process.env.PHOTON_PROJECT_ID;
  delete process.env.PHOTON_PROJECT_SECRET;
  delete process.env.CARETAKER_PHONE;
  delete process.env.PHOTON_AGENT_POLL_MS;
});

test("resolvePhotonConfig: PHOTON_SECRET_KEY alias resolves project secret and marks usingAlias", () => {
  delete process.env.PHOTON_PROJECT_SECRET;
  process.env.PHOTON_PROJECT_ID = "proj-abc";
  process.env.PHOTON_SECRET_KEY = "legacy-key";

  const cfg = resolvePhotonConfig();
  assert.equal(cfg.projectSecret, "legacy-key");
  assert.equal(cfg.usingAlias, true);

  delete process.env.PHOTON_PROJECT_ID;
  delete process.env.PHOTON_SECRET_KEY;
});

test("resolvePhotonConfig: liveOnly throws when credentials missing", () => {
  delete process.env.PHOTON_PROJECT_ID;
  delete process.env.PHOTON_PROJECT_SECRET;
  delete process.env.PHOTON_SECRET_KEY;

  assert.throws(
    () => resolvePhotonConfig({ liveOnly: true }),
    /PHOTON_PROJECT_ID/
  );
});

test("resolvePhotonConfig: no credentials gives enabled=false, no throw", () => {
  delete process.env.PHOTON_PROJECT_ID;
  delete process.env.PHOTON_PROJECT_SECRET;
  delete process.env.PHOTON_SECRET_KEY;

  const cfg = resolvePhotonConfig();
  assert.equal(cfg.enabled, false);
});
