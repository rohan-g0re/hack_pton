import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getRecentEvents, getEventsForDate } from "@/lib/events";
import type { AegisEvent } from "@/lib/events";

interface Prescription {
  name: string;
  time: string;
  window_minutes: number;
  instructions: string;
}

function lastEventByDomain(events: AegisEvent[], domain: string): AegisEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].domain === domain) return events[i];
  }
  return undefined;
}

function computeGroceryStatus(lastEvent: AegisEvent | undefined) {
  if (
    lastEvent &&
    (lastEvent.type === "grocery_low_detected" || lastEvent.type === "grocery_list_sent")
  ) {
    return {
      status: "warn" as const,
      label: lastEvent.type === "grocery_low_detected" ? "Low items detected" : "List sent to family",
      timestamp: lastEvent.timestamp,
    };
  }
  return { status: "ok" as const, label: "Well stocked" };
}

function computeMedicalStatus(todayEvents: AegisEvent[]) {
  const prescriptionsPath = path.join(process.cwd(), "data", "prescriptions.json");
  let prescriptions: Prescription[] = [];
  try {
    prescriptions = JSON.parse(fs.readFileSync(prescriptionsPath, "utf-8"));
  } catch {
    return { status: "ok" as const, label: "No prescriptions configured" };
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const takenMeds = new Set(
    todayEvents
      .filter((e) => e.type === "med_taken")
      .map((e) => (e.metadata?.med_name as string) ?? e.message)
  );

  let nextMed: Prescription | null = null;
  let nextMedMinutes = Infinity;

  for (const rx of prescriptions) {
    const [h, m] = rx.time.split(":").map(Number);
    const rxMinutes = h * 60 + m;

    const isTaken = takenMeds.has(rx.name) ||
      Array.from(takenMeds).some((t) => t.toLowerCase().includes(rx.name.toLowerCase()));

    if (!isTaken && rxMinutes >= nowMinutes && rxMinutes < nextMedMinutes) {
      nextMed = rx;
      nextMedMinutes = rxMinutes;
    }
  }

  if (nextMed) {
    return {
      status: "ok" as const,
      label: `Next: ${nextMed.name}`,
      nextMed: nextMed.name,
      dueAt: nextMed.time,
    };
  }

  const allTaken = prescriptions.every((rx) => {
    const [h, m] = rx.time.split(":").map(Number);
    const rxMinutes = h * 60 + m;
    if (rxMinutes > nowMinutes) return true;
    return takenMeds.has(rx.name) ||
      Array.from(takenMeds).some((t) => t.toLowerCase().includes(rx.name.toLowerCase()));
  });

  if (allTaken) {
    return { status: "ok" as const, label: "All taken" };
  }

  return { status: "warn" as const, label: "Missed medication" };
}

function computeEmergencyStatus(lastEvent: AegisEvent | undefined) {
  if (lastEvent && lastEvent.type === "emergency_detected") {
    const elapsed = Date.now() - new Date(lastEvent.timestamp).getTime();
    if (elapsed < 30 * 60 * 1000) {
      return {
        status: "alert" as const,
        label: "Emergency detected",
        timestamp: lastEvent.timestamp,
      };
    }
  }
  return { status: "ok" as const, label: "All clear" };
}

export async function GET() {
  const recentEvents = getRecentEvents(100);
  const todayEvents = getEventsForDate(new Date());

  const lastGrocery = lastEventByDomain(recentEvents, "grocery");
  const lastEmergency = lastEventByDomain(recentEvents, "emergency");

  return NextResponse.json({
    grocery: computeGroceryStatus(lastGrocery),
    medical: computeMedicalStatus(todayEvents),
    emergency: computeEmergencyStatus(lastEmergency),
  });
}
