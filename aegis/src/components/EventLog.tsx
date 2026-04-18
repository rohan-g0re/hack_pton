"use client";

import type { AegisEvent } from "@/lib/events";

interface EventLogProps {
  events: AegisEvent[];
}

const DOMAIN_COLORS: Record<string, string> = {
  grocery: "text-emerald-400 bg-emerald-950/40",
  medical: "text-blue-400 bg-blue-950/40",
  emergency: "text-red-400 bg-red-950/40",
  system: "text-gray-400 bg-gray-900",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function EventLog({ events }: EventLogProps) {
  const reversed = [...events].reverse();

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="font-semibold text-gray-100">Event Log</h3>
        <span className="text-xs text-gray-500">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-800">
        {reversed.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No events yet. Events will appear here as the system runs.
          </div>
        ) : (
          reversed.map((event) => (
            <div key={event.id} className="px-4 py-2.5 hover:bg-gray-800/30">
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-500 font-mono shrink-0 w-20">
                  {formatTime(event.timestamp)}
                </span>
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    DOMAIN_COLORS[event.domain] ?? DOMAIN_COLORS.system
                  }`}
                >
                  {event.domain}
                </span>
                <span className="text-sm text-gray-200 break-words">
                  {event.message}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
