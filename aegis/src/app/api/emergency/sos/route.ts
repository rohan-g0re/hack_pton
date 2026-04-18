import { NextResponse } from "next/server";
import { logEvent } from "@/lib/events";
import { sendEmergencyAlert } from "@/lib/imessage";

export async function POST() {
  const msg = "🚨 SOS: Patient pressed the emergency button. Immediate help needed.";

  logEvent("emergency", "emergency_detected", msg, { source: "manual_sos" });

  try {
    await sendEmergencyAlert(msg);
    logEvent("emergency", "emergency_alert_sent", "SOS alert sent to family", {
      source: "manual_sos",
    });
  } catch (err) {
    console.error("[SOS] iMessage send failed:", err);
    logEvent("emergency", "emergency_alert_sent", "SOS logged (iMessage unavailable)", {
      source: "manual_sos",
      sendFailed: true,
    });
  }

  return NextResponse.json({ ok: true, message: "Alert sent to family." });
}
