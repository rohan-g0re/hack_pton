import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { SupabaseStore } from "./supabase-store.mjs";
import { createSupabaseServerClient } from "./supabase-server.mjs";
import { createSnapshotPutUrl } from "./s3-presign.mjs";
import {
  createKnotSession,
  extendKnotSession,
  MERCHANTS
} from "../services/worker/knot-client.mjs";
import {
  handleCartSyncSucceeded,
  handleCartSyncFailed,
  handleCheckoutSucceeded,
  handleCheckoutFailed,
  handleMerchantAuthenticated,
  handleAccountLoginRequired
} from "../services/worker/knot-checkout.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

const MAX_BODY_BYTES = 1024 * 1024;

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => {
      chunks.push(chunk);
      if (chunks.reduce((n, c) => n + c.length, 0) > MAX_BODY_BYTES) {
        reject(new Error("Payload too large.")); request.destroy();
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Payload too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON payload."));
      }
    });

    request.on("error", reject);
  });
}

const HTML_ROUTES = {
  "/": "/index.html",
  "/register": "/register.html",
  "/dashboard": "/dashboard.html",
  "/dashboard/patient": "/patient.html",
  "/bind": "/bind.html",
  "/camera": "/camera-select.html",
  "/camera/pantry": "/camera-room.html",
  "/camera/medicine": "/camera-room.html"
};

function mapHtmlRoute(pathname) {
  if (HTML_ROUTES[pathname]) {
    return HTML_ROUTES[pathname];
  }

  if (/^\/dashboard\/proposals\/[^/]+\/?$/.test(pathname)) {
    return "/proposal-detail.html";
  }

  return pathname;
}

function sendStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(publicDir, safePath);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(publicDir + path.sep) && normalized !== publicDir) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(normalized, (error, file) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const ext = path.extname(normalized);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[ext] || "application/octet-stream";

    response.writeHead(200, { "Content-Type": type });
    response.end(file);
  });
}

/** Await store methods uniformly. */
async function invokeStore(store, method, ...args) {
  const fn = store[method];
  if (typeof fn !== "function") {
    throw new Error(`Unknown store method: ${method}`);
  }
  const out = fn.apply(store, args);
  return out && typeof out.then === "function" ? await out : out;
}

export function createApp() {
  const sb = createSupabaseServerClient();
  if (!sb) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Demo/in-memory store has been removed."
    );
  }
  const store = new SupabaseStore(sb);

  const server = http.createServer(async (request, response) => {
    const parsed = new URL(request.url, "http://localhost");
    const { pathname } = parsed;

    try {
      if (request.method === "GET" && pathname === "/healthz") {
        json(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && pathname === "/api/state") {
        json(response, 200, await invokeStore(store, "listState"));
        return;
      }

      if (request.method === "POST" && pathname === "/api/demo/reset") {
        json(response, 200, await invokeStore(store, "reset"));
        return;
      }

      if (request.method === "POST" && pathname === "/api/profile") {
        const body = await readBody(request);
        json(response, 200, await invokeStore(store, "updateProfile", body));
        return;
      }

      if (request.method === "POST" && pathname === "/api/inventory") {
        const body = await readBody(request);
        json(response, 200, await invokeStore(store, "replaceInventory", body.items || []));
        return;
      }

      if (request.method === "POST" && pathname === "/api/prescriptions") {
        const body = await readBody(request);
        json(response, 200, await invokeStore(store, "replacePrescriptions", body.items || []));
        return;
      }

      const registerMatch = pathname.match(/^\/api\/cameras\/(pantry|medicine)\/register$/);
      if (request.method === "POST" && registerMatch) {
        const body = await readBody(request);
        json(response, 200, await invokeStore(store, "registerCamera", registerMatch[1], body));
        return;
      }

      const snapshotUrlMatch = pathname.match(/^\/api\/cameras\/(pantry|medicine)\/snapshot-url$/);
      if (request.method === "POST" && snapshotUrlMatch && sb) {
        const bucket = process.env.AWS_S3_BUCKET;
        if (!bucket) {
          json(response, 503, { error: "AWS_S3_BUCKET not configured." });
          return;
        }
        const camera = await store.getCameraByRole(snapshotUrlMatch[1]);
        if (!camera) {
          json(response, 400, { error: "Camera not found for role." });
          return;
        }
        const urls = await createSnapshotPutUrl({
          bucket,
          region: process.env.AWS_REGION,
          role: snapshotUrlMatch[1],
          cameraId: camera.id
        });
        json(response, 200, urls);
        return;
      }

      if (request.method === "POST" && snapshotUrlMatch && !sb) {
        json(response, 503, { error: "Snapshot upload requires Supabase + S3 configuration." });
        return;
      }

      const snapshotMatch = pathname.match(/^\/api\/cameras\/(pantry|medicine)\/snapshot$/);
      if (request.method === "POST" && snapshotMatch) {
        const body = await readBody(request);
        json(response, 200, await invokeStore(store, "recordSnapshot", snapshotMatch[1], body));
        return;
      }

      const approveMatch = pathname.match(/^\/api\/proposals\/([^/]+)\/approve$/);
      if (request.method === "POST" && approveMatch) {
        json(response, 200, await invokeStore(store, "approveProposal", approveMatch[1]));
        return;
      }

      const rejectMatch = pathname.match(/^\/api\/proposals\/([^/]+)\/reject$/);
      if (request.method === "POST" && rejectMatch) {
        json(response, 200, await invokeStore(store, "rejectProposal", rejectMatch[1]));
        return;
      }

      if (request.method === "POST" && pathname === "/api/cameras/pair-code") {
        const body = await readBody(request);
        const role = body.role === "medicine" ? "medicine" : "pantry";
        json(response, 200, await invokeStore(store, "generatePairingCode", role));
        return;
      }

      if (request.method === "POST" && pathname === "/api/cameras/pair") {
        const body = await readBody(request);
        json(response, 200, await invokeStore(store, "pairCamera", body.code));
        return;
      }

      if (request.method === "POST" && pathname === "/api/payment-card") {
        const body = await readBody(request);
        json(response, 200, await invokeStore(store, "updatePaymentCard", body));
        return;
      }

      // ── Knot API routes ────────────────────────────────────────────────────

      if (request.method === "GET" && pathname === "/api/knot/merchants") {
        // Return our curated merchant catalog — no live API call needed for UI display
        json(response, 200, { merchants: Object.values(MERCHANTS) });
        return;
      }

      if (request.method === "POST" && pathname === "/api/knot/session") {
        const body = await readBody(request);
        const patientId = "22222222-2222-4222-8222-222222222202";
        const externalUserId = `patient:${patientId}`;
        const merchantId = Number(body.merchantId || process.env.KNOT_DEFAULT_MERCHANT_ID || 44);
        const { session: sessionId, sessionType } = await createKnotSession({
          externalUserId,
          merchantId,
          patientId,
          purpose: body.purpose
        });
        json(response, 200, {
          sessionId,
          sessionType,
          clientId: process.env.KNOT_WEB_CLIENT_ID || process.env.KNOT_CLIENT_ID,
          environment: process.env.KNOT_ENVIRONMENT || "production",
          merchantIds: [merchantId]
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/knot/session/extend") {
        const body = await readBody(request);
        const sessionId = await extendKnotSession(body.sessionId);
        json(response, 200, { sessionId });
        return;
      }

      if (request.method === "POST" && pathname === "/api/knot/webhooks") {
        const rawBody = await readRawBody(request);
        let payload;
        try { payload = JSON.parse(rawBody); } catch { json(response, 400, { error: "Invalid JSON" }); return; }

        // Store webhook event idempotently
        const taskId = payload.task_id || null;
        const event = payload.event || "";
        if (taskId && sb) {
          const { error: upsertErr } = await sb
            .from("knot_webhook_events")
            .upsert({
              event,
              session_id: payload.session_id || null,
              task_id: taskId,
              external_user_id: payload.external_user_id || null,
              merchant_id: payload.merchant_id || null,
              payload,
              processed_at: new Date().toISOString()
            }, { onConflict: "event,task_id", ignoreDuplicates: true });
          if (upsertErr) { console.warn("[knot-webhook] idempotency upsert error:", upsertErr.message); }
        }

        // Dispatch to handler
        try {
          switch (event) {
            case "AUTHENTICATED": await handleMerchantAuthenticated(sb, payload); break;
            case "SYNC_CART_SUCCEEDED": await handleCartSyncSucceeded(sb, payload); break;
            case "SYNC_CART_FAILED": await handleCartSyncFailed(sb, payload); break;
            case "CHECKOUT_SUCCEEDED": await handleCheckoutSucceeded(sb, payload); break;
            case "CHECKOUT_FAILED": await handleCheckoutFailed(sb, payload); break;
            case "ACCOUNT_LOGIN_REQUIRED": await handleAccountLoginRequired(sb, payload); break;
            default: console.log(`[knot-webhook] unhandled event: ${event}`);
          }
        } catch (handlerErr) {
          console.error(`[knot-webhook] handler error for ${event}:`, handlerErr.message);
        }

        json(response, 200, { ok: true });
        return;
      }

      // ── Static files ────────────────────────────────────────────────────────

      if (request.method === "GET" && !pathname.startsWith("/api")) {
        const staticPath = mapHtmlRoute(pathname);
        const allowed =
          staticPath.endsWith(".html") ||
          staticPath.endsWith(".js") ||
          staticPath.endsWith(".css") ||
          staticPath === "/";

        if (allowed) {
          sendStatic(staticPath === "/" ? "/" : staticPath, response);
          return;
        }
      }

      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      json(response, 400, { error: error.message });
    }
  });

  return { server, store };
}
