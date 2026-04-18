import { NextRequest, NextResponse } from "next/server";

// Bridge endpoint for the macOS host. The Linux app POSTs {chatId, text}
// here and this process calls Photon in-process to deliver the message.
// Only usable when this process runs on macOS with Full Disk Access
// granted to node and the @photon-ai/imessage-kit package installed.

export const dynamic = "force-dynamic";

type PhotonSDK = {
  send: (chatId: string, text: string) => Promise<unknown>;
};

let sdk: PhotonSDK | null = null;
let loadAttempted = false;

async function getSdk(): Promise<PhotonSDK | null> {
  if (sdk) return sdk;
  if (loadAttempted) return null;
  loadAttempted = true;
  if (process.platform !== "darwin") {
    console.warn("[imessage-bridge] not running on macOS — refusing to init SDK");
    return null;
  }
  try {
    const mod = await import("@photon-ai/imessage-kit");
    sdk = new mod.IMessageSDK({ debug: false }) as unknown as PhotonSDK;
    console.log("[imessage-bridge] Photon SDK ready");
    return sdk;
  } catch (err) {
    console.error("[imessage-bridge] failed to load Photon SDK:", err);
    return null;
  }
}

function authOk(req: NextRequest): boolean {
  const expected = process.env.IMESSAGE_BRIDGE_TOKEN;
  if (!expected) return true;
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return !!match && match[1] === expected;
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { chatId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const chatId = String(body.chatId ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!chatId || !text) {
    return NextResponse.json({ error: "chatId and text required" }, { status: 400 });
  }

  const client = await getSdk();
  if (!client) {
    return NextResponse.json(
      { error: "Photon SDK unavailable on this host" },
      { status: 503 }
    );
  }

  try {
    await client.send(chatId, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[imessage-bridge] send failed:", err);
    return NextResponse.json({ error: "send failed" }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "imessage-bridge",
    platform: process.platform,
    authRequired: !!process.env.IMESSAGE_BRIDGE_TOKEN,
  });
}
