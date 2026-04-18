import { NextRequest, NextResponse } from "next/server";
import { analyzeMedical } from "@/lib/vision";
import { logEvent } from "@/lib/events";
import { sendMedicalAlert } from "@/lib/imessage";

const CONFIDENCE_THRESHOLD = 0.6;

export async function POST(req: NextRequest) {
  try {
    const { image, medication } = await req.json();

    if (!image) {
      return NextResponse.json(
        { error: "image required" },
        { status: 400 }
      );
    }

    const expected = medication ?? "scheduled medication";
    const analysis = await analyzeMedical(image, expected);

    if (analysis.meds_taken) {
      logEvent("medical", "med_taken", `Medication taken: ${expected}`, {
        changes: analysis.changes_detected,
        confidence: analysis.confidence,
      });
      return NextResponse.json({ action: "med_taken", analysis });
    }

    if (analysis.confidence < CONFIDENCE_THRESHOLD) {
      logEvent(
        "medical",
        "med_taken",
        `Inconclusive vision — assuming taken (confidence ${analysis.confidence.toFixed(2)})`,
        { medication: expected, confidence: analysis.confidence, inconclusive: true }
      );
      return NextResponse.json({ action: "inconclusive", analysis });
    }

    const timeStr = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const alertMsg = `💊 MEDICATION ALERT: ${expected} was still visible on the medicine table at window-close. [${timeStr}]`;

    logEvent("medical", "med_missed", alertMsg, {
      medication: expected,
      confidence: analysis.confidence,
    });

    await sendMedicalAlert(alertMsg);

    logEvent("medical", "med_alert_sent", `Alert sent for: ${expected}`);

    return NextResponse.json({ action: "alert_sent", analysis, alertMsg });
  } catch (error) {
    console.error("Medical check error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
