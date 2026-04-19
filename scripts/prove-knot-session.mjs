import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/app.mjs";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "KNOT_CLIENT_ID",
  "KNOT_CLIENT_SECRET",
  "KNOT_WEB_CLIENT_ID",
  "KNOT_ENVIRONMENT",
  "KNOT_API_BASE",
  "KNOT_DEFAULT_MERCHANT_ID"
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, resolve));
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  const previousEnv = snapshotEnv();
  const originalFetch = global.fetch;
  let server;
  let capturedKnotRequest;

  try {
    process.env.SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
    delete process.env.SUPABASE_ANON_KEY;
    process.env.KNOT_CLIENT_ID = "server_client_id";
    process.env.KNOT_CLIENT_SECRET = "server_client_secret";
    process.env.KNOT_WEB_CLIENT_ID = "web_client_id";
    process.env.KNOT_ENVIRONMENT = "production";
    delete process.env.KNOT_API_BASE;
    process.env.KNOT_DEFAULT_MERCHANT_ID = "44";

    global.fetch = async (url, options = {}) => {
      const urlString = typeof url === "string" ? url : url.url;

      if (urlString === "https://production.knotapi.com/session/create") {
        capturedKnotRequest = {
          url: urlString,
          method: options.method,
          headers: options.headers,
          body: JSON.parse(options.body)
        };
        return new Response(JSON.stringify({ session: "sess_proof_transaction_link" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return originalFetch(url, options);
    };

    ({ server } = createApp());
    await listen(server);
    const { port } = server.address();

    const response = await originalFetch(`http://127.0.0.1:${port}/api/knot/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: 44, purpose: "order_history" })
    });

    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);

    const payload = JSON.parse(responseText);
    assert.deepEqual(payload, {
      sessionId: "sess_proof_transaction_link",
      sessionType: "transaction_link",
      clientId: "web_client_id",
      environment: "production",
      merchantIds: [44]
    });

    assert.ok(capturedKnotRequest, "Expected app route to call Knot /session/create.");
    assert.equal(capturedKnotRequest.url, "https://production.knotapi.com/session/create");
    assert.equal(capturedKnotRequest.method, "POST");
    assert.equal(
      capturedKnotRequest.headers.Authorization,
      `Basic ${Buffer.from("server_client_id:server_client_secret").toString("base64")}`
    );
    assert.deepEqual(capturedKnotRequest.body, {
      type: "transaction_link",
      external_user_id: "patient:22222222-2222-4222-8222-222222222202",
      metadata: {
        patient_id: "22222222-2222-4222-8222-222222222202",
        flow: "order_history"
      }
    });
    assert.equal(Object.hasOwn(capturedKnotRequest.body, "merchant_ids"), false);

    const patientJs = await readFile(new URL("../public/patient.js", import.meta.url), "utf8");
    assert.match(patientJs, /purpose:\s*"order_history"/);
    assert.match(patientJs, /Order history/);

    console.log("Knot session proof passed");
    console.log("- Browser payload requests purpose=order_history");
    console.log("- /api/knot/session returns sessionType=transaction_link");
    console.log("- Knot /session/create body excludes merchant_ids");
    console.log("- merchantIds stay in the SDK init response");
  } finally {
    if (server?.listening) {
      await close(server);
    }
    global.fetch = originalFetch;
    restoreEnv(previousEnv);
  }
}

main().catch((error) => {
  console.error(`Knot session proof failed: ${error.message}`);
  process.exitCode = 1;
});
