import { NextRequest, NextResponse } from "next/server";
import { getRecentEvents, getEventsForDate } from "@/lib/events";
import type { AegisEvent } from "@/lib/events";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get("date");
  const countParam = searchParams.get("count");
  const domainParam = searchParams.get("domain");

  let events: AegisEvent[];

  if (dateParam) {
    events = getEventsForDate(new Date(dateParam));
  } else {
    const count = countParam ? parseInt(countParam, 10) : 50;
    events = getRecentEvents(count);
  }

  if (domainParam) {
    events = events.filter((e) => e.domain === domainParam);
  }

  return NextResponse.json(events);
}
