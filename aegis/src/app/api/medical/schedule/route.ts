import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getEventsForDate } from "@/lib/events";

interface Prescription {
  name: string;
  time: string;
  window_minutes: number;
  instructions?: string;
}

function getPrescriptions(): Prescription[] {
  try {
    const p = path.join(process.cwd(), "data", "prescriptions.json");
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export async function GET() {
  const prescriptions = getPrescriptions();
  const todayEvents = getEventsForDate(new Date());
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const schedule = prescriptions.map((pres) => {
    const presMinutes = parseTime(pres.time);
    const takenEvent = todayEvents.find(
      (e) =>
        e.type === "med_taken" &&
        e.message.toLowerCase().includes(pres.name.toLowerCase())
    );

    const [h, m] = pres.time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    const displayTime = `${displayHour}:${String(m).padStart(2, "0")} ${ampm}`;

    if (takenEvent) {
      const takenAt = new Date(takenEvent.timestamp).toLocaleTimeString(
        "en-US",
        { hour: "numeric", minute: "2-digit" }
      );
      return {
        name: `${pres.name}`,
        time: displayTime,
        status: "taken" as const,
        detail: `Taken at ${takenAt}`,
      };
    }

    const diff = presMinutes - nowMinutes;
    if (diff <= 0 && diff > -pres.window_minutes) {
      return {
        name: `${pres.name}`,
        time: displayTime,
        status: "due" as const,
        detail: `Due ${Math.abs(diff)} min ago`,
      };
    }
    if (diff > 0 && diff <= 30) {
      return {
        name: `${pres.name}`,
        time: displayTime,
        status: "due" as const,
        detail: `Due in ${diff} min`,
      };
    }

    if (presMinutes + pres.window_minutes < nowMinutes) {
      return {
        name: `${pres.name}`,
        time: displayTime,
        status: "missed" as const,
        detail: "Window closed",
      };
    }

    return {
      name: `${pres.name}`,
      time: displayTime,
      status: "upcoming" as const,
      detail: "Scheduled",
    };
  });

  return NextResponse.json(schedule);
}
