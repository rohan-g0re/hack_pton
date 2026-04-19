/**
 * Photon iMessage via HTTP — works on Linux (no Messages.app).
 * Set PHOTON_SERVER_URL to your Photon dashboard server (e.g. https://xxx.photon.codes)
 * and PHOTON_SECRET_KEY as X-API-Key. Optional: PHOTON_PROJECT_ID for URL path variants.
 */
export async function sendIMessage({ toPhone, body }) {
  if (!process.env.PHOTON_SECRET_KEY) {
    console.log(`[photon stub] iMessage to ${toPhone}: ${body.slice(0, 120)}...`);
    return { ok: true, stub: true };
  }

  const normalized = String(toPhone).replace(/[\s-]/g, "");
  const serverUrl = (process.env.PHOTON_SERVER_URL || process.env.PHOTON_API_BASE || "").replace(/\/$/, "");
  const projectId = process.env.PHOTON_PROJECT_ID;

  /** Prefer SMS/iMessage chatGuid format used by Photon HTTP proxy */
  const chatGuid = normalized.startsWith("+") ? `SMS;-;${normalized}` : `SMS;-;+${normalized}`;

  const pathsToTry = [];
  if (projectId && serverUrl) {
    pathsToTry.push(`${serverUrl}/v1/projects/${projectId}/messages`);
    pathsToTry.push(`${serverUrl}/projects/${projectId}/messages`);
  }
  if (serverUrl) {
    pathsToTry.push(`${serverUrl}/send`);
    pathsToTry.push(`${serverUrl}/v1/send`);
    pathsToTry.push(`${serverUrl}/messages`);
  }

  if (pathsToTry.length === 0) {
    return {
      ok: false,
      error: "Set PHOTON_SERVER_URL to your Photon dashboard base URL, plus PHOTON_SECRET_KEY."
    };
  }

  let lastErr = null;
  for (const url of pathsToTry) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.PHOTON_SECRET_KEY,
          Authorization: `Bearer ${process.env.PHOTON_SECRET_KEY}`
        },
        body: JSON.stringify({
          chatGuid,
          to: normalized,
          message: body,
          text: body
        })
      });
      const text = await res.text();
      if (res.ok) {
        return { ok: true, status: res.status, body: text.slice(0, 500) };
      }
      lastErr = new Error(`Photon HTTP ${res.status}: ${text.slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
    }
  }

  console.error("[photon]", lastErr?.message || lastErr);
  return { ok: false, error: lastErr?.message || String(lastErr) };
}
