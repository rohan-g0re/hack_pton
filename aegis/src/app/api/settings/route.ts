import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

interface Settings {
  elderName: string;
  knotId: string;
  chatIds: {
    grocery: string;
    medical: string;
    emergency: string;
  };
}

const DEFAULTS: Settings = {
  elderName: "Margaret Johnson",
  knotId: "",
  chatIds: { grocery: "", medical: "", emergency: "" },
};

function ensureFile() {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SETTINGS_PATH))
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULTS, null, 2));
}

function load(): Settings {
  ensureFile();
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")) };
  } catch {
    return DEFAULTS;
  }
}

export async function GET() {
  return NextResponse.json(load());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const current = load();
  const merged = { ...current, ...body };
  if (body.chatIds) merged.chatIds = { ...current.chatIds, ...body.chatIds };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return NextResponse.json(merged);
}
