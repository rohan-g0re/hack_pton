import test from "node:test";
import assert from "node:assert/strict";
import { createKnotSession } from "../services/worker/knot-client.mjs";

function withKnotEnv(run) {
  return async () => {
    const previous = {
      clientId: process.env.KNOT_CLIENT_ID,
      secret: process.env.KNOT_CLIENT_SECRET,
      environment: process.env.KNOT_ENVIRONMENT,
      base: process.env.KNOT_API_BASE,
      fetch: global.fetch
    };

    process.env.KNOT_CLIENT_ID = "client_id";
    process.env.KNOT_CLIENT_SECRET = "client_secret";
    process.env.KNOT_ENVIRONMENT = "production";
    delete process.env.KNOT_API_BASE;

    try {
      await run();
    } finally {
      restoreEnv("KNOT_CLIENT_ID", previous.clientId);
      restoreEnv("KNOT_CLIENT_SECRET", previous.secret);
      restoreEnv("KNOT_ENVIRONMENT", previous.environment);
      restoreEnv("KNOT_API_BASE", previous.base);
      global.fetch = previous.fetch;
    }
  };
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("order history sessions use transaction_link and no merchant_ids field", withKnotEnv(async () => {
  let request;
  global.fetch = async (url, options) => {
    request = {
      url,
      options,
      body: JSON.parse(options.body)
    };
    return new Response(JSON.stringify({ session: "sess_order_history" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await createKnotSession({
    externalUserId: "patient:seed",
    merchantId: 44,
    patientId: "seed",
    purpose: "order_history"
  });

  assert.equal(result.session, "sess_order_history");
  assert.equal(result.sessionType, "transaction_link");
  assert.equal(request.url, "https://production.knotapi.com/session/create");
  assert.equal(request.options.headers.Authorization, "Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=");
  assert.deepEqual(request.body, {
    type: "transaction_link",
    external_user_id: "patient:seed",
    metadata: {
      patient_id: "seed",
      flow: "order_history"
    }
  });
  assert.equal(Object.hasOwn(request.body, "merchant_ids"), false);
}));

test("shopping sessions keep merchant selection out of session/create", withKnotEnv(async () => {
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ session: "sess_shopping" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await createKnotSession({
    externalUserId: "patient:seed",
    merchantId: 44,
    patientId: "seed"
  });

  assert.equal(result.sessionType, "link");
  assert.equal(result.session, "sess_shopping");
  assert.equal(requestBody.type, "link");
  assert.equal(Object.hasOwn(requestBody, "merchant_ids"), false);
}));
