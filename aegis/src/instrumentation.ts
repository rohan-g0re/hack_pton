export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("./lib/scheduler");
  const origin = process.env.AEGIS_ORIGIN ?? "http://localhost:3000";
  startScheduler(origin);

  if (process.env.AEGIS_ENABLE_IMESSAGE === "true") {
    try {
      const { initIMessage } = await import("./lib/imessage");
      await initIMessage();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "PLATFORM") {
        console.log("[AEGIS] iMessage skipped — Photon requires macOS. Alerts log to console.");
      } else {
        console.error("[AEGIS] iMessage init failed:", err);
      }
    }
  }
}
