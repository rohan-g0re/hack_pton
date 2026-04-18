/**
 * Photon / spectrum-ts iMessage bridge — stub when Photon credentials are not set.
 * Wire real SDK here using PHOTON_PROJECT_ID + PHOTON_SECRET_KEY.
 */
export async function sendIMessage({ toPhone, body }) {
  if (!process.env.PHOTON_PROJECT_ID || !process.env.PHOTON_SECRET_KEY) {
    console.log(`[photon stub] iMessage to ${toPhone}: ${body.slice(0, 120)}...`);
    return { ok: true, stub: true };
  }

  throw new Error("Photon SDK integration not configured for this build.");
}
