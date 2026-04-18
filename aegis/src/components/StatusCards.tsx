"use client";

import type { AegisEvent } from "@/lib/events";

interface StatusCardsProps {
  events: AegisEvent[];
}

type Status = "ok" | "warn" | "alert" | "unknown";

function evalStatus(
  events: AegisEvent[],
  domain: "grocery" | "medical" | "emergency"
): { status: Status; label: string } {
  const domainEvents = events.filter((e) => e.domain === domain);
  const last = domainEvents[domainEvents.length - 1];

  if (!last) return { status: "ok", label: "All clear" };

  if (domain === "emergency") {
    if (last.type === "emergency_detected" || last.type === "emergency_alert_sent") {
      return { status: "alert", label: last.message };
    }
    return { status: "ok", label: "All clear" };
  }

  if (domain === "medical") {
    if (last.type === "med_missed" || last.type === "med_alert_sent") {
      return { status: "alert", label: "Missed medication" };
    }
    if (last.type === "med_taken") {
      return { status: "ok", label: "Medication taken" };
    }
    if (last.type === "med_reminder_played") {
      return { status: "warn", label: "Awaiting confirmation" };
    }
    return { status: "ok", label: "On schedule" };
  }

  if (domain === "grocery") {
    if (last.type === "grocery_low_detected" || last.type === "grocery_list_sent") {
      return { status: "warn", label: "Refill needed" };
    }
    if (last.type === "grocery_order_placed" || last.type === "grocery_order_confirmed") {
      return { status: "ok", label: "Order placed" };
    }
    return { status: "ok", label: "Well stocked" };
  }

  return { status: "unknown", label: "—" };
}

const STATUS_STYLES: Record<Status, { bg: string; text: string; dot: string }> = {
  ok: { bg: "bg-emerald-950/40 border-emerald-700", text: "text-emerald-300", dot: "bg-emerald-400" },
  warn: { bg: "bg-amber-950/40 border-amber-700", text: "text-amber-300", dot: "bg-amber-400" },
  alert: { bg: "bg-red-950/40 border-red-700", text: "text-red-300", dot: "bg-red-400 animate-pulse" },
  unknown: { bg: "bg-gray-900 border-gray-700", text: "text-gray-400", dot: "bg-gray-500" },
};

const DOMAIN_LABELS = {
  grocery: "Groceries",
  medical: "Medication",
  emergency: "Safety",
};

export default function StatusCards({ events }: StatusCardsProps) {
  const domains = ["grocery", "medical", "emergency"] as const;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {domains.map((domain) => {
        const { status, label } = evalStatus(events, domain);
        const styles = STATUS_STYLES[status];
        return (
          <div
            key={domain}
            className={`rounded-xl border p-5 ${styles.bg} transition-colors`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-100">
                {DOMAIN_LABELS[domain]}
              </h3>
              <span className={`w-3 h-3 rounded-full ${styles.dot}`} />
            </div>
            <p className={`text-sm ${styles.text} line-clamp-2`}>{label}</p>
          </div>
        );
      })}
    </div>
  );
}
