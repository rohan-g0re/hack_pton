import { NextResponse } from "next/server";
import { triggerDailySummaryNow } from "@/lib/scheduler";

export async function POST() {
  try {
    await triggerDailySummaryNow();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Summary error:", err);
    return NextResponse.json({ error: "Summary failed" }, { status: 500 });
  }
}
