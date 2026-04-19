/**
 * Photon iMessage smoke test — sends a single test message to the configured caretaker phone.
 * Run manually after recipient onboarding is complete:
 *   bun scripts/smoke-photon.ts
 *
 * Prerequisites:
 * - PHOTON_PROJECT_ID and PHOTON_PROJECT_SECRET (or PHOTON_SECRET_KEY) are set
 * - CARETAKER_PHONE is set to an E.164 number
 * - Recipient has accepted the Photon invite email and received the first bot message
 */
import { resolvePhotonConfig, requireE164 } from "../services/photon/config.mjs";
import { createSpectrumApp, stopSpectrumApp } from "../services/photon/spectrum-app.ts";
import { sendMessage } from "../services/photon/sender.ts";

async function main() {
  console.log("=== Photon iMessage Smoke Test ===\n");

  const cfg = resolvePhotonConfig({ liveOnly: true });

  const rawPhone = process.env.CARETAKER_PHONE || "";
  let phone: string;
  try {
    phone = requireE164(rawPhone, "CARETAKER_PHONE");
  } catch (err) {
    console.error(`ERROR: ${(err as Error).message}`);
    console.error("Set CARETAKER_PHONE to the recipient E.164 number before running the smoke test.");
    process.exit(1);
  }

  console.log(`Project ID : ${cfg.projectId}`);
  console.log(`Recipient  : ${phone}`);
  if (cfg.usingAlias) {
    console.warn("WARN: Using PHOTON_SECRET_KEY alias — migrate to PHOTON_PROJECT_SECRET when convenient.");
  }
  console.log("\nOnboarding checklist (verify before running):");
  console.log("  [ ] Recipient added in Photon dashboard with name, phone, email");
  console.log("  [ ] Recipient accepted Photon invite email");
  console.log("  [ ] Photon bot sent first iMessage to recipient");
  console.log("  [ ] Dashboard shows thread_open or sendable status");
  console.log("");

  const app = await createSpectrumApp();
  console.log("Spectrum app started. Sending test message...\n");

  const result = await sendMessage(app, {
    toPhone: phone,
    body: `[Caretaker Command Center] Smoke test — Photon iMessage delivery is working. (${new Date().toISOString()})`
  });

  await stopSpectrumApp();

  if (result.ok) {
    console.log("SUCCESS: Test message sent.");
    console.log("Next: Update caretaker photon_status to 'sendable' in the dashboard.");
  } else {
    console.error(`FAILED: ${result.errorCode} — ${result.errorMessage}`);
    if (result.onboardingBlocked) {
      console.error("ONBOARDING REQUIRED: Recipient must accept the Photon invite and receive the first bot message.");
    } else if (result.permanent) {
      console.error("PERMANENT ERROR: Check phone number format and Photon project configuration.");
    } else {
      console.error("RETRYABLE ERROR: Check network, credentials, and Photon service status.");
    }
    process.exit(1);
  }
}

main();
