import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.mjs";

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

test("dashboard shell is served as HTML", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const text = await response.text();
    assert.match(text, /Caretaker Command Center/);
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

test("missed medication snapshot generates a critical caretaker alert", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cameras/medicine/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: "medicine-missed", capturedAt: new Date().toISOString() })
    });

    const payload = await response.json();
    assert.equal(payload.status, "alert");
    assert.equal(payload.event.severity, "critical");
    assert.equal(payload.notification.deliveryStatus, "sent");
  });
});
