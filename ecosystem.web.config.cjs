/** PM2 — run on web EC2 from repo root: pm2 start ecosystem.web.config.cjs */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  fs.readFileSync(file, "utf8").split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    env[key] = val;
  });
  return env;
}

const envFile = path.join(__dirname, ".env");
const envVars = loadEnv(envFile);

module.exports = {
  apps: [
    {
      name: "caretaker-web",
      script: "server.mjs",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        ...envVars
      }
    }
  ]
};
