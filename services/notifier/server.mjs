import http from "node:http";
import { createSupabaseServerClient } from "../../src/supabase-server.mjs";
import { sendIMessage } from "./photon-client.mjs";

const port = Number(process.env.PHOTON_HTTP_PORT || process.env.NOTIFIER_PORT || 3040);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (c) => {
      body += c;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function isE164ish(phone) {
  const normalized = String(phone).replace(/[\s-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(normalized);
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

  try {
    const payload = await readBody(req);
    const rawPhone = payload.caretaker_phone || payload.to;
    const message = payload.message || "";
    const eventId = payload.event_id || null;

    if (!rawPhone || !isE164ish(rawPhone)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid caretaker_phone" }));
      return;
    }

    const phone = String(rawPhone).replace(/[\s-]/g, "");
    const result = await sendIMessage({ toPhone: phone, body: message });

    const client = createSupabaseServerClient();
    if (client && eventId) {
      const existing = await client.from("notifications").select("id").eq("event_id", eventId).maybeSingle();
      if (!existing.data) {
        await client.from("notifications").insert({
          event_id: eventId,
          channel: "photon_imessage",
          recipient: phone,
          message,
          delivery_status: result.ok ? "sent" : "failed",
          sent_at: new Date().toISOString()
        });
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, delivery: result }));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(error.message || error) }));
  }
});

server.listen(port, () => {
  console.log(`Caretaker notifier listening on http://127.0.0.1:${port}`);
});
