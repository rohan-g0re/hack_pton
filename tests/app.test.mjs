import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.mjs";

// Integration tests expect in-memory DemoStore only (not Supabase).
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;

async function withServer(run) {
  const { server } = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("dashboard state exposes seeded caretaker and patient", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/state`);
    const payload = await response.json();
    assert.equal(payload.caretaker.name, "Rohan Shah");
    assert.equal(payload.patient.name, "Mira Shah");
    assert.equal(payload.cameras.length, 2);
  });
});

test("welcome shell is served as HTML", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const text = await response.text();
    assert.match(text, /Caretaker Command Center/);
  });
});

test("registration and dashboard routes serve HTML", async () => {
  await withServer(async (baseUrl) => {
    const registerResponse = await fetch(`${baseUrl}/register`);
    const registerText = await registerResponse.text();
    assert.match(registerText, /Register as Caretaker/);

    const dashboardResponse = await fetch(`${baseUrl}/dashboard`);
    const dashboardText = await dashboardResponse.text();
    assert.match(dashboardText, /Caretaker Command Center/);
  });
});

test("demo bind-skip marks camera online", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cameras/bind-skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "pantry" })
    });
    const payload = await response.json();
    assert.equal(payload.role, "pantry");
    assert.ok(payload.deviceName);

    const stateResponse = await fetch(`${baseUrl}/api/state`);
    const state = await stateResponse.json();
    const pantry = state.cameras.find((camera) => camera.role === "pantry");
    assert.equal(pantry.status, "online");
  });
});

test("pantry low stock snapshot creates an approval-gated proposal", async () => {
  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/cameras/pantry/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Pantry iPhone" })
    });

    const response = await fetch(`${baseUrl}/api/cameras/pantry/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: "pantry-low", capturedAt: new Date().toISOString() })
    });

    const payload = await response.json();
    assert.equal(payload.proposal.status, "awaiting_approval");
    assert.ok(payload.proposal.items.some((item) => item.name === "Milk"));
  });
});

test("approving a proposal completes sandbox checkout", async () => {
  await withServer(async (baseUrl) => {
    const snapshotResponse = await fetch(`${baseUrl}/api/cameras/pantry/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: "pantry-low", capturedAt: new Date().toISOString() })
    });

    const snapshotPayload = await snapshotResponse.json();

    const approveResponse = await fetch(`${baseUrl}/api/proposals/${snapshotPayload.proposal.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const approvePayload = await approveResponse.json();
    assert.equal(approvePayload.proposal.status, "completed");
    assert.equal(approvePayload.checkout.status, "success");
  });
});

test("pairing code binds the camera and is single-use", async () => {
  await withServer(async (baseUrl) => {
    const codeResponse = await fetch(`${baseUrl}/api/cameras/pair-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "medicine" })
    });
    const { code } = await codeResponse.json();
    assert.match(code, /^\d{6}$/);

    const pairResponse = await fetch(`${baseUrl}/api/cameras/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const camera = await pairResponse.json();
    assert.equal(camera.role, "medicine");
    assert.equal(camera.status, "online");

    const replayResponse = await fetch(`${baseUrl}/api/cameras/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    assert.equal(replayResponse.status, 400);
  });
});

test("missed medication snapshot generates a critical caretaker alert", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cameras/medicine/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: "medicine-missed", capturedAt: new Date().toISOString() })
    });

    const payload = await response.json();
    assert.equal(payload.status, "missed");
    assert.equal(payload.event.severity, "critical");
    assert.equal(payload.notification.deliveryStatus, "sent");
  });
});

test(
  "integration: /api/state includes caretaker photon readiness fields (requires SUPABASE_URL)",
  { skip: !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY },
  async () => {
    // This test validates that the new photon readiness fields are included in the state response.
    // Requires a live Supabase instance with migration 004 applied.
    const { createApp } = await import("../src/app.mjs");
    const { server } = createApp();
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/state`);
      const data = await response.json();
      assert.ok("photonStatus" in data.caretaker, "caretaker should have photonStatus");
      assert.ok("photonLastError" in data.caretaker, "caretaker should have photonLastError");
      assert.ok(Array.isArray(data.notifications), "state should include notifications array");
      assert.ok(Array.isArray(data.events), "state should include events array");
    } finally {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  }
);
