import { request } from "/common.js";

const pathRole = window.location.pathname.endsWith("medicine") ? "medicine" : "pantry";
const role = pathRole;

const title = document.getElementById("camera-title");
const subtitle = document.getElementById("camera-subtitle");
const badge = document.getElementById("camera-role-badge");
const select = document.getElementById("scene-select");
const description = document.getElementById("scene-description");
const result = document.getElementById("snapshot-result");
const registerResult = document.getElementById("register-result");
const snapCountEl = document.getElementById("snap-count");
const lastSentEl = document.getElementById("last-sent");
const autoBadge = document.getElementById("auto-badge");

let scenes = [];
let autoTimer = null;
let snapshotsSent = 0;

title.textContent = role === "pantry" ? "Pantry Nanny Cam" : "Medicine Nanny Cam";
subtitle.textContent =
  role === "pantry"
    ? "Capturing snapshots every 10 seconds. Place this device facing the pantry."
    : "Capturing snapshots every 10 seconds. Point at the medicine table.";
badge.textContent = role;

function renderSceneDescription() {
  const scene = scenes.find((entry) => entry.id === select.value);
  description.textContent = scene?.description || "";
}

async function loadScenes() {
  const state = await request("/api/state");
  scenes = state.scenes[role];
  select.innerHTML = scenes.map((scene) => `<option value="${scene.id}">${scene.label}</option>`).join("");
  renderSceneDescription();
}

async function registerCamera(deviceName) {
  const payload = await request(`/api/cameras/${role}/register`, {
    method: "POST",
    body: JSON.stringify({ deviceName })
  });
  registerResult.textContent = `${payload.label} registered as ${payload.deviceName}.`;
}

async function sendSnapshot() {
  const payload = await request(`/api/cameras/${role}/snapshot`, {
    method: "POST",
    body: JSON.stringify({
      sceneId: select.value,
      capturedAt: new Date().toISOString()
    })
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
    note.textContent = "Camera preview unavailable in this browser.";
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
  await sendSnapshot();
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

select.addEventListener("change", renderSceneDescription);

loadScenes().catch((error) => {
  result.textContent = error.message;
});
startPreview();
