import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { DemoStore } from "./store.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
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

function sendStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(publicDir, safePath);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(publicDir)) {
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

export function createApp() {
  const store = new DemoStore();

  const server = http.createServer(async (request, response) => {
    const parsed = new URL(request.url, "http://localhost");
    const { pathname } = parsed;

    try {
      if (request.method === "GET" && pathname === "/api/state") {
        json(response, 200, store.listState());
        return;
      }

      if (request.method === "POST" && pathname === "/api/demo/reset") {
        store.reset();
        json(response, 200, store.listState());
        return;
      }

      if (request.method === "POST" && pathname === "/api/profile") {
        const body = await readBody(request);
        json(response, 200, store.updateProfile(body));
        return;
      }

      if (request.method === "POST" && pathname === "/api/inventory") {
        const body = await readBody(request);
        json(response, 200, store.replaceInventory(body.items || []));
        return;
      }

      if (request.method === "POST" && pathname === "/api/prescriptions") {
        const body = await readBody(request);
        json(response, 200, store.replacePrescriptions(body.items || []));
        return;
      }

      const registerMatch = pathname.match(/^\/api\/cameras\/(pantry|medicine)\/register$/);
      if (request.method === "POST" && registerMatch) {
        const body = await readBody(request);
        json(response, 200, store.registerCamera(registerMatch[1], body));
        return;
      }

      const snapshotMatch = pathname.match(/^\/api\/cameras\/(pantry|medicine)\/snapshot$/);
      if (request.method === "POST" && snapshotMatch) {
        const body = await readBody(request);
        json(response, 200, store.recordSnapshot(snapshotMatch[1], body));
        return;
      }

      const approveMatch = pathname.match(/^\/api\/proposals\/([^/]+)\/approve$/);
      if (request.method === "POST" && approveMatch) {
        json(response, 200, store.approveProposal(approveMatch[1]));
        return;
      }

      const rejectMatch = pathname.match(/^\/api\/proposals\/([^/]+)\/reject$/);
      if (request.method === "POST" && rejectMatch) {
        json(response, 200, store.rejectProposal(rejectMatch[1]));
        return;
      }

      if (
        request.method === "GET" &&
        (pathname === "/" ||
          pathname.startsWith("/camera") ||
          pathname.endsWith(".html") ||
          pathname.endsWith(".js") ||
          pathname.endsWith(".css"))
      ) {
        sendStatic(pathname, response);
        return;
      }

      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      json(response, 400, { error: error.message });
    }
  });

  return { server, store };
}
