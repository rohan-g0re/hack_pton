import { NextRequest, NextResponse } from "next/server";
import "@/lib/globals";
import { startScheduler } from "@/lib/scheduler";
import { initIMessage } from "@/lib/imessage";

if (typeof globalThis.aegisBootstrapped === "undefined") {
  globalThis.aegisBootstrapped = false;
}

export async function POST(req: NextRequest) {
  if (globalThis.aegisBootstrapped) {
    return NextResponse.json({ ok: true, alreadyStarted: true });
  }

  const origin = req.nextUrl.origin;
  startScheduler(origin);

  if (process.env.AEGIS_ENABLE_IMESSAGE === "true") {
    try {
      await initIMessage();
    } catch (err) {
      console.error("[AEGIS] iMessage init failed:", err);
    }
  }

  globalThis.aegisBootstrapped = true;
  return NextResponse.json({ ok: true, started: true });
}

export async function GET() {
  return NextResponse.json({
    bootstrapped: globalThis.aegisBootstrapped ?? false,
  });
}
