const params = new URLSearchParams(window.location.search);
const role = params.get("role") === "medicine" ? "medicine" : "pantry";
const title = document.getElementById("camera-title");
const subtitle = document.getElementById("camera-subtitle");
const badge = document.getElementById("camera-role-badge");
const select = document.getElementById("scene-select");
const description = document.getElementById("scene-description");
const result = document.getElementById("snapshot-result");
const registerResult = document.getElementById("register-result");
let scenes = [];
let autoTimer = null;

title.textContent = role === "pantry" ? "Pantry Nanny Cam" : "Medicine Nanny Cam";
subtitle.textContent =
  role === "pantry"
    ? "Use this page on a phone or laptop in front of the pantry."
    : "Use this page on a phone or laptop pointed at the medicine table.";
badge.textContent = role;

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

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
  result.textContent = JSON.stringify(payload, null, 2);
}

async function startPreview() {
  const video = document.getElementById("video-preview");
  if (!navigator.mediaDevices?.getUserMedia) {
    video.replaceWith(document.createTextNode("Camera preview unavailable in this browser."));
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
    return;
  }

  await sendSnapshot();
  autoTimer = setInterval(sendSnapshot, 10000);
  event.currentTarget.textContent = "Stop auto mode";
});

select.addEventListener("change", renderSceneDescription);

loadScenes().catch((error) => {
  result.textContent = error.message;
});
startPreview();
