import { request } from "/common.js";

const pathRole = window.location.pathname.endsWith("medicine") ? "medicine" : "pantry";
const role = pathRole;

const title = document.getElementById("camera-title");
const subtitle = document.getElementById("camera-subtitle");
const badge = document.getElementById("camera-role-badge");
const result = document.getElementById("snapshot-result");
const registerResult = document.getElementById("register-result");
const snapCountEl = document.getElementById("snap-count");
const lastSentEl = document.getElementById("last-sent");
const autoBadge = document.getElementById("auto-badge");

let autoTimer = null;
let snapshotsSent = 0;

title.textContent = role === "pantry" ? "Pantry Nanny Cam" : "Medicine Nanny Cam";
subtitle.textContent =
  role === "pantry"
    ? "Capturing snapshots every 10 seconds. Place this device facing the pantry."
    : "Capturing snapshots every 10 seconds. Point at the medicine table.";
badge.textContent = role;

async function registerCamera(deviceName) {
  const payload = await request(`/api/cameras/${role}/register`, {
    method: "POST",
    body: JSON.stringify({ deviceName })
  });
  registerResult.textContent = `${payload.label} registered as ${payload.deviceName}.`;
}

async function sendSnapshot() {
  const capturedAt = new Date().toISOString();
  const video = document.getElementById("video-preview");

  if (!video?.videoWidth) {
    result.textContent = "Camera not ready. Allow camera access and wait for the preview to load.";
    return;
  }

  const prep = await request(`/api/cameras/${role}/snapshot-url`, { method: "POST", body: "{}" });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));

  const putRes = await fetch(prep.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob
  });
  if (!putRes.ok) {
    throw new Error(`S3 upload failed: ${putRes.status}`);
  }

  const payload = await request(`/api/cameras/${role}/snapshot`, {
    method: "POST",
    body: JSON.stringify({ imageUrl: prep.imageUrl, capturedAt })
  });

  snapshotsSent += 1;
  snapCountEl.textContent = `Snapshots sent: ${snapshotsSent}`;
  lastSentEl.textContent = `Last sent: ${new Date().toLocaleTimeString()}`;
  result.textContent = JSON.stringify(payload, null, 2);
}

async function startPreview() {
  const video = document.getElementById("video-preview");
  if (!navigator.mediaDevices?.getUserMedia) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "Camera preview unavailable in this browser. Make sure you are on HTTPS.";
    video.replaceWith(note);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
  } catch (error) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = `Camera preview unavailable: ${error.message}`;
    video.replaceWith(note);
  }
}

document.getElementById("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await registerCamera(form.get("deviceName"));
});

document.getElementById("send-snapshot").addEventListener("click", async () => {
  try {
    await sendSnapshot();
  } catch (err) {
    result.textContent = `Error: ${err.message}`;
  }
});

document.getElementById("toggle-auto").addEventListener("click", async (event) => {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    event.currentTarget.textContent = "Start 10s auto mode";
    autoBadge.textContent = "Auto off";
    return;
  }

  await sendSnapshot();
  autoTimer = setInterval(sendSnapshot, 10000);
  event.currentTarget.textContent = "Stop auto mode";
  autoBadge.textContent = "Active · every 10s";
});

startPreview();
