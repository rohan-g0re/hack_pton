import { NextRequest, NextResponse } from "next/server";
import { triggerTTS } from "../tts-stream/route";
import { logEvent } from "@/lib/events";

export async function POST(req: NextRequest) {
  try {
    const { medication, instructions } = await req.json();

    const message = instructions
      ? `Time to take your ${medication}. ${instructions}.`
      : `Time to take your ${medication}.`;

    triggerTTS(message);
    logEvent("medical", "med_reminder_played", `Reminder: ${medication}`, {
      medication,
      instructions,
    });

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error("Remind error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
