import { NextRequest, NextResponse } from "next/server";
import "@/lib/globals";
import { notePerceptionFrame } from "@/lib/perception-loop";

if (!globalThis.snapshotStore) {
  globalThis.snapshotStore = {};
}
if (!globalThis.snapshotListeners) {
  globalThis.snapshotListeners = [];
}

const ALLOWED_DOMAINS = new Set(["grocery", "medical", "emergency"] as const);
type Domain = "grocery" | "medical" | "emergency";
const MAX_IMAGE_LENGTH = 2 * 1024 * 1024; // ~1.5MB JPEG after base64 overhead

export async function POST(req: NextRequest) {
  try {
    const { domain, image, timestamp } = await req.json();

    if (!domain || !image) {
      return NextResponse.json(
        { error: "Missing domain or image" },
        { status: 400 }
      );
    }

    if (!ALLOWED_DOMAINS.has(domain)) {
      return NextResponse.json(
        { error: `Invalid domain. Expected one of: ${Array.from(ALLOWED_DOMAINS).join(", ")}` },
        { status: 400 }
      );
    }

    if (typeof image !== "string" || image.length > MAX_IMAGE_LENGTH) {
      return NextResponse.json(
        { error: "Image missing or exceeds size limit" },
        { status: 413 }
      );
    }

    const capturedAt = timestamp ?? Date.now();
    const prev = globalThis.snapshotStore[domain];
    globalThis.snapshotStore[domain] = {
      image,
      timestamp: capturedAt,
      previous: prev?.image,
    };

    notePerceptionFrame(domain as Domain, capturedAt);

    for (const listener of globalThis.snapshotListeners) {
      try {
        listener(domain, image);
      } catch {
        // ignore listener errors
      }
    }

    return NextResponse.json({ ok: true, domain, timestamp: capturedAt });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

export async function GET() {
  const summary: Record<string, { timestamp: number; hasImage: boolean }> = {};
  for (const [domain, data] of Object.entries(globalThis.snapshotStore)) {
    summary[domain] = { timestamp: data.timestamp, hasImage: !!data.image };
  }
  return NextResponse.json(summary);
}
