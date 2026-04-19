/**
 * Photon/Spectrum configuration and phone normalization.
 * Supports PHOTON_SECRET_KEY as a compatibility alias for PHOTON_PROJECT_SECRET.
 */

export function normalizePhone(raw) {
  if (!raw) return null;
  const stripped = String(raw).replace(/[\s\-().]/g, "");
  // Already has + prefix — validate as E.164
  if (/^\+[1-9]\d{6,14}$/.test(stripped)) return stripped;
  // No + prefix — require at least 11 digits so a country code is included
  // (e.g. 1 + 10 digits for North America). A bare 10-digit number is rejected.
  if (/^[1-9]\d{10,14}$/.test(stripped)) return `+${stripped}`;
  return null;
}

export function requireE164(raw, fieldName = "phone") {
  const normalized = normalizePhone(raw);
  if (!normalized) {
    throw new Error(
      `${fieldName} must be a valid E.164 number (e.g. +16095550100). Got: ${JSON.stringify(raw)}`
    );
  }
  return normalized;
}

/**
 * Returns resolved Photon config from environment.
 * When liveOnly is true, throws if credentials are missing.
 */
export function resolvePhotonConfig({ liveOnly = false } = {}) {
  const projectId = process.env.PHOTON_PROJECT_ID || "";

  // PHOTON_PROJECT_SECRET is canonical; PHOTON_SECRET_KEY is a compatibility alias.
  let projectSecret = process.env.PHOTON_PROJECT_SECRET || "";
  let usingAlias = false;
  if (!projectSecret && process.env.PHOTON_SECRET_KEY) {
    projectSecret = process.env.PHOTON_SECRET_KEY;
    usingAlias = true;
  }

  const caretakerPhone = normalizePhone(process.env.CARETAKER_PHONE || "");

  if (liveOnly) {
    if (!projectId) throw new Error("PHOTON_PROJECT_ID is required for live Photon delivery.");
    if (!projectSecret) throw new Error("PHOTON_PROJECT_SECRET (or PHOTON_SECRET_KEY) is required for live Photon delivery.");
  }

  return {
    projectId,
    projectSecret,
    usingAlias,
    caretakerPhone,
    pollMs: Number(process.env.PHOTON_AGENT_POLL_MS || 5000),
    batchSize: Number(process.env.PHOTON_AGENT_BATCH_SIZE || 10),
    httpPort: Number(process.env.PHOTON_HTTP_PORT || process.env.NOTIFIER_PORT || 3040),
    notifyUrl: process.env.PHOTON_NOTIFY_URL || "http://127.0.0.1:3040",
    bindHost: process.env.NOTIFIER_BIND_HOST || "127.0.0.1",
    enabled: !!(projectId && projectSecret)
  };
}
