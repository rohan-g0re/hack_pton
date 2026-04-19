/**
 * @deprecated This direct HTTP Photon client is no longer used for production delivery.
 * Alerts are now enqueued via services/photon/outbox.mjs and delivered by services/photon/agent.ts.
 * This file is kept only for backwards-compatibility test coverage.
 */
export async function sendIMessage({ toPhone, body }) {
  if (!process.env.PHOTON_SECRET_KEY) {
    console.log(`[photon stub] iMessage to ${toPhone}: ${body.slice(0, 120)}...`);
    return { ok: true, stub: true };
  }

  // This path is deprecated and should not be reached in production.
  console.warn("[photon-client] DEPRECATED: direct HTTP Photon send. Use the Photon agent outbox instead.");
  return { ok: false, deprecated: true, error: "Direct Photon send is deprecated. Use the outbox pattern." };
}
