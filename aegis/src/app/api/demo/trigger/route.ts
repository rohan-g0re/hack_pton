import { NextRequest, NextResponse } from "next/server";
import "@/lib/globals";
import { triggerDailySummaryNow, triggerMedReminderNow } from "@/lib/scheduler";
import { logEvent } from "@/lib/events";
import { sendEmergencyAlert } from "@/lib/imessage";

function isAuthorized(req: NextRequest): boolean {
  if (process.env.AEGIS_DEMO_MODE === "true") return true;
  const host = req.headers.get("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Demo trigger disabled. Set AEGIS_DEMO_MODE=true or call from localhost." },
      { status: 403 }
    );
  }

  const { action, medication } = await req.json();
  const origin = req.nextUrl.origin;

  try {
    switch (action) {
      case "emergency": {
        const store = globalThis.snapshotStore ?? {};
        const image = store.emergency?.image;
        if (!image) {
          const timeStr = new Date().toLocaleTimeString();
          const msg = `⚠️ ALERT: Possible fall detected (manual demo trigger). [${timeStr}]`;
          logEvent("emergency", "emergency_detected", msg, { manual: true });
          await sendEmergencyAlert(msg);
          logEvent("emergency", "emergency_alert_sent", "Manual demo alert sent");
          return NextResponse.json({ action: "manual_alert_sent", message: msg });
        }
        const res = await fetch(`${origin}/api/emergency/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
        return NextResponse.json({ via: "vision", result: await res.json() });
      }

      case "grocery": {
        const store = globalThis.snapshotStore ?? {};
        const image = store.grocery?.image;
        if (!image) {
          return NextResponse.json(
            { error: "No grocery snapshot available yet. Open /camera/grocery first." },
            { status: 400 }
          );
        }
        const res = await fetch(`${origin}/api/grocery/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, force: true }),
        });
        return NextResponse.json({ result: await res.json() });
      }

      case "medication": {
        const target = await triggerMedReminderNow(origin, medication);
        return NextResponse.json({ triggered: target });
      }

      case "summary": {
        await triggerDailySummaryNow();
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Demo trigger error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
