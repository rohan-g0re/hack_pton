import { NextRequest, NextResponse } from "next/server";
import "@/lib/globals";
import { analyzeEmergency } from "@/lib/vision";
import { logEvent } from "@/lib/events";
import { sendEmergencyAlert } from "@/lib/imessage";

const CONFIDENCE_THRESHOLD = 0.7;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

if (!globalThis.lastEmergencyAlert) {
  globalThis.lastEmergencyAlert = null;
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const analysis = await analyzeEmergency(image);

    if (
      analysis.emergency &&
      analysis.confidence >= CONFIDENCE_THRESHOLD
    ) {
      const now = Date.now();
      const last = globalThis.lastEmergencyAlert;
      if (
        last &&
        last.type === analysis.type &&
        now - last.timestamp < DEDUP_WINDOW_MS
      ) {
        return NextResponse.json({
          action: "suppressed_duplicate",
          analysis,
        });
      }

      globalThis.lastEmergencyAlert = { type: analysis.type, timestamp: now };

      const timeStr = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      const alertMsg =
        analysis.type === "fall"
          ? `⚠️ ALERT: Possible fall detected — ${analysis.description}. [${timeStr}]`
          : analysis.type === "fire" || analysis.type === "smoke"
          ? `🔴 EMERGENCY: ${analysis.type} detected — ${analysis.description}. [${timeStr}]`
          : `⚠️ ALERT: ${analysis.type} detected — ${analysis.description}. [${timeStr}]`;

      logEvent("emergency", "emergency_detected", alertMsg, {
        type: analysis.type,
        confidence: analysis.confidence,
      });

      await sendEmergencyAlert(alertMsg);

      logEvent("emergency", "emergency_alert_sent", `Alert sent: ${analysis.type}`);

      return NextResponse.json({ action: "alert_sent", analysis, alertMsg });
    }

    return NextResponse.json({ action: "no_emergency", analysis });
  } catch (error) {
    console.error("Emergency check error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
