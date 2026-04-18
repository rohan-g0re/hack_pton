import { NextRequest, NextResponse } from "next/server";
import "@/lib/globals";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;
  const entry = globalThis.snapshotStore?.[domain];

  if (!entry) {
    return NextResponse.json(
      { image: null, timestamp: null },
      { status: 200 }
    );
  }

  return NextResponse.json({
    image: entry.image,
    timestamp: entry.timestamp,
  });
}
