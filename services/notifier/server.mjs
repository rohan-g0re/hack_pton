import http from "node:http";
import { createSupabaseServerClient } from "../../src/supabase-server.mjs";
import { enqueueAlert } from "../photon/outbox.mjs";
import { normalizePhone } from "../photon/config.mjs";

const port = Number(process.env.PHOTON_HTTP_PORT || process.env.NOTIFIER_PORT || 3040);
const bindHost = process.env.NOTIFIER_BIND_HOST || "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024; // 64 KB — alert payloads are small

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (c) => {
      body += c;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        request.socket.destroy();
      }
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "caretaker-notifier" }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/notify") {
    res.writeHead(404);
    res.end();
    return;
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    res.writeHead(415, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Content-Type must be application/json." }));
    return;
  }

  try {
    const payload = await readBody(req);
    const rawPhone = payload.caretaker_phone || payload.to;
    const message = String(payload.message || "").trim();
    const eventId = payload.event_id || null;

    const normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid caretaker_phone — must be a valid E.164 number (e.g. +16095550100)." }));
      return;
    }

    if (!message) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "message is required and must not be empty." }));
      return;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Database service unavailable. Please try again later." }));
      return;
    }

    const result = await enqueueAlert(client, {
      phone: normalizedPhone,
      message,
      eventId
    });

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, queued: true, ...result }));
  } catch (error) {
    console.error("[notifier] /notify error:", error.message || error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "An internal error occurred." }));
  }
});

server.listen(port, bindHost, () => {
  console.log(`Caretaker notifier listening on http://${bindHost}:${port}`);
});
