"use client";

import { useCallback, useEffect, useState } from "react";
import type { AegisEvent, EventDomain } from "@/lib/events";

const FILTERS = ["all", "emergency", "medical", "grocery"] as const;
type Filter = (typeof FILTERS)[number];

const DOMAIN_BADGE: Record<string, { bg: string; text: string }> = {
  grocery: { bg: "bg-grocery-dim", text: "text-grocery" },
  medical: { bg: "bg-medical-dim", text: "text-medical" },
  emergency: { bg: "bg-emergency-dim", text: "text-emergency" },
  system: { bg: "bg-bg-elevated", text: "text-text-muted" },
};

const PILL_ACTIVE: Record<string, string> = {
  all: "bg-accent-dim text-accent",
  emergency: "bg-emergency-dim text-emergency",
  medical: "bg-medical-dim text-medical",
  grocery: "bg-grocery-dim text-grocery",
};

function subtitle(ev: AegisEvent): string {
  if (ev.metadata?.subtitle) return ev.metadata.subtitle as string;
  return ev.type.replaceAll("_", " ");
}

export default function AlertsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [events, setEvents] = useState<AegisEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async (domain: Filter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ count: "100" });
      if (domain !== "all") params.set("domain", domain);
      const res = await fetch(`/api/events?${params}`);
      const data: AegisEvent[] = await res.json();
      setEvents(data.reverse());
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(filter);
  }, [filter, fetchEvents]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 pt-8 pb-5">
        <div>
          <h1 className="text-[18px] font-bold text-text-primary">Alerts</h1>
          <p className="text-[13px] text-text-secondary mt-0.5">
            All system events and notifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium capitalize transition-colors ${
                filter === f
                  ? PILL_ACTIVE[f]
                  : "bg-bg-card text-text-secondary hover:text-text-primary"
              }`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 px-8">
        {loading && events.length === 0 && (
          <div className="py-12 text-center text-text-muted text-[14px]">
            Loading events…
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="py-12 text-center text-text-muted text-[14px]">
            No events found.
          </div>
        )}

        <div className="flex flex-col">
          {events.map((ev) => {
            const badge = DOMAIN_BADGE[ev.domain] ?? DOMAIN_BADGE.system;
            const isEmergency = ev.domain === "emergency";
            const time = new Date(ev.timestamp).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <div
                key={ev.id}
                className={`flex items-center gap-4 h-[60px] border-b border-border-default ${
                  isEmergency ? "bg-emergency-dim" : ""
                }`}
              >
                <span className="w-[80px] shrink-0 text-[12px] font-mono text-text-muted">
                  {time}
                </span>

                <span
                  className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase ${badge.bg} ${badge.text}`}
                >
                  {ev.domain}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13px] font-semibold truncate ${
                      isEmergency ? "text-emergency" : "text-text-primary"
                    }`}
                  >
                    {ev.message}
                  </p>
                  <p className="text-[12px] text-text-muted truncate">
                    {subtitle(ev)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
