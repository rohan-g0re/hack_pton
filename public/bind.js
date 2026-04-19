import { request } from "/common.js";

const params = new URLSearchParams(window.location.search);
const role = params.get("role") === "medicine" ? "medicine" : "pantry";
const label = role === "medicine" ? "Medicine Nanny Cam" : "Pantry Nanny Cam";

const codeEl = document.getElementById("pair-code");
const roleEl = document.getElementById("bind-role");
const statusEl = document.getElementById("bind-status");
const qrWrap = document.getElementById("qr-wrap");

roleEl.textContent = `Camera role: ${label}`;

let pollTimer = null;
let activeCode = null;

function formatCode(code) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function renderQr(code) {
  const payload = { cameraId: role === "medicine" ? "camera-medicine" : "camera-pantry", role, code };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encoded}`;
  qrWrap.innerHTML = `<img src="${qrUrl}" width="220" height="220" alt="Binding QR code" class="qr-image" />`;
}

async function requestNewCode() {
  const data = await request("/api/cameras/pair-code", {
    method: "POST",
    body: JSON.stringify({ role })
  });
  activeCode = data.code;
  codeEl.textContent = formatCode(data.code);
  renderQr(data.code);
}

async function checkBound() {
  const data = await request("/api/state");
  const camera = data.cameras.find((entry) => entry.role === role);
  if (camera && camera.status === "online" && camera.deviceName !== "Unregistered device") {
    statusEl.textContent = "Status: Paired. Redirecting…";
    if (pollTimer) clearInterval(pollTimer);
    setTimeout(() => {
      window.location.href = `/camera/${role}`;
    }, 600);
  }
}

requestNewCode().catch((error) => {
  codeEl.textContent = "ERROR";
  statusEl.textContent = `Status: ${error.message}`;
});

pollTimer = setInterval(() => {
  checkBound().catch(() => {});
}, 2500);
