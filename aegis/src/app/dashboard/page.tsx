"use client";

import { useEffect, useState, useCallback } from "react";
import { Camera, Activity, ChevronRight, Radio } from "lucide-react";
import Link from "next/link";
import type { AegisEvent, EventDomain } from "@/lib/events";
import type { PerceptionState } from "@/lib/globals";

const OFFLINE_AFTER_MS = 30_000;

type DomainStatus = {
  domain: EventDomain;
  label: string;
  statusText: string;
  color: "grocery" | "warning" | "default";
};

function deriveDomainStatuses(events: AegisEvent[]): DomainStatus[] {
  const domainConfigs: {
    domain: EventDomain;
    label: string;
  }[] = [
    { domain: "grocery", label: "Groceries" },
    { domain: "medical", label: "Medical" },
    { domain: "emergency", label: "Safety" },
  ];

  return domainConfigs.map(({ domain, label }) => {
    const domainEvents = events.filter((e) => e.domain === domain);
    const last = domainEvents[domainEvents.length - 1];

    if (domain === "grocery") {
      if (
        last?.type === "grocery_low_detected" ||
        last?.type === "grocery_list_sent"
      )
        return { domain, label, statusText: "Refill needed", color: "warning" as const };
      return { domain, label, statusText: "Well stocked", color: "grocery" as const };
    }
    if (domain === "medical") {
      if (last?.type === "med_missed" || last?.type === "med_alert_sent")
        return { domain, label, statusText: "Missed dose", color: "warning" as const };
      if (last?.type === "med_reminder_played")
        return { domain, label, statusText: "Due at 12:00 PM", color: "warning" as const };
      return { domain, label, statusText: "On schedule", color: "grocery" as const };
    }
    if (last?.type === "emergency_detected" || last?.type === "emergency_alert_sent")
      return { domain, label, statusText: last.message, color: "warning" as const };
    return { domain, label, statusText: "All clear", color: "default" as const };
  });
}

const DOMAIN_DOT_COLORS: Record<string, string> = {
  grocery: "bg-grocery",
  medical: "bg-medical",
  emergency: "bg-emergency",
};

const DOMAIN_CAMERA_LABELS: Record<string, string> = {
  grocery: "Grocery Shelf",
  medical: "Medicine Table",
  emergency: "Living Area",
};

const STATUS_COLOR_MAP: Record<string, { text: string; border: string; dot: string }> = {
  grocery: { text: "text-grocery", border: "border-grocery/30", dot: "bg-grocery" },
  warning: { text: "text-warning", border: "border-warning/30", dot: "bg-warning" },
  default: { text: "text-text-primary", border: "border-border-default", dot: "bg-grocery" },
};

const DOMAIN_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  grocery: { bg: "bg-grocery-dim", text: "text-grocery" },
  medical: { bg: "bg-medical-dim", text: "text-medical" },
  emergency: { bg: "bg-emergency-dim", text: "text-emergency" },
  system: { bg: "bg-accent-dim", text: "text-accent" },
};

export default function DashboardPage() {
  const [events, setEvents] = useState<AegisEvent[]>([]);
  const [snapshots, setSnapshots] = useState<
    Record<string, { image: string | null; timestamp: number | null }>
  >({});
  const [perception, setPerception] = useState<PerceptionState | null>(null);
  const [now, setNow] = useState(Date.now());

  const pollEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events?count=20");
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch { /* ignore */ }
  }, []);

  const pollSnapshots = useCallback(async () => {
    const domains = ["grocery", "medical", "emergency"];
    const results = await Promise.allSettled(
      domains.map(async (d) => {
        const res = await fetch(`/api/snapshot/latest/${d}`);
        if (!res.ok) return { domain: d, image: null, timestamp: null };
        const data = await res.json();
        return { domain: d, image: data.image ?? null, timestamp: data.timestamp ?? null };
      })
    );
    const newSnaps: typeof snapshots = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        newSnaps[r.value.domain] = {
          image: r.value.image,
          timestamp: r.value.timestamp,
        };
      }
    }
    setSnapshots((prev) => ({ ...prev, ...newSnaps }));
  }, []);

  useEffect(() => {
    pollEvents();
    const id = setInterval(pollEvents, 5000);
    return () => clearInterval(id);
  }, [pollEvents]);

  useEffect(() => {
    pollSnapshots();
    const id = setInterval(pollSnapshots, 2000);
    return () => clearInterval(id);
  }, [pollSnapshots]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/perception-state?sse=1");
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PerceptionState;
        setPerception(data);
      } catch {
        // ignore
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, []);

  const statuses = deriveDomainStatuses(events);

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatSnapshotTime(ts: number | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between h-[72px] px-8 shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-text-primary">
            Good evening, Sarah.
          </h1>
          <p className="text-[13px] text-text-secondary">
            Margaret is doing well today.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-bg-card border border-border-default rounded-full px-3 py-1.5">
          <Radio size={12} className={perception?.meta.lastTickAt ? "text-grocery animate-pulse" : "text-text-muted"} />
          <span className="text-[12px] text-text-secondary font-medium">
            {perception?.meta.lastTickAt
              ? `Last tick ${Math.max(0, Math.round((now - perception.meta.lastTickAt) / 1000))}s ago`
              : "Waiting for perception loop…"}
          </span>
        </div>
      </div>

      {/* Status row */}
      <div className="flex gap-4 px-8">
        {statuses.map((s) => {
          const colors = STATUS_COLOR_MAP[s.color];
          return (
            <div
              key={s.domain}
              className={`flex-1 bg-bg-card rounded-xl border ${colors.border} p-5`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${DOMAIN_DOT_COLORS[s.domain]}`} />
                <span className="text-[13px] font-semibold text-text-secondary">
                  {s.label}
                </span>
              </div>
              <p className={`text-[22px] font-bold ${colors.text}`}>
                {s.statusText}
              </p>
            </div>
          );
        })}
      </div>

      {/* Live Feeds */}
      <div className="px-8 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-text-primary">
            Live Feeds
          </h2>
          <Link
            href="/camera/grocery"
            className="text-[13px] text-accent hover:underline flex items-center gap-1"
          >
            Open cameras
            <ChevronRight size={14} />
          </Link>
        </div>
        <div className="flex gap-4">
          {(["grocery", "medical", "emergency"] as const).map((domain) => {
            const snap = snapshots[domain];
            const offline =
              snap?.timestamp !== null &&
              snap?.timestamp !== undefined &&
              now - snap.timestamp > OFFLINE_AFTER_MS;
            return (
              <div
                key={domain}
                className="flex-1 bg-bg-card border border-border-default rounded-xl overflow-hidden"
              >
                <div className="flex items-center justify-between h-9 px-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${DOMAIN_DOT_COLORS[domain]}`} />
                    <span className="text-[12px] font-medium text-text-secondary">
                      {DOMAIN_CAMERA_LABELS[domain]}
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono ${offline ? "text-emergency" : "text-text-muted"}`}>
                    {offline ? "offline" : formatSnapshotTime(snap?.timestamp ?? null)}
                  </span>
                </div>
                <div className="h-[140px] bg-bg-elevated flex items-center justify-center relative">
                  {snap?.image ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/jpeg;base64,${snap.image}`}
                        alt={`${domain} feed`}
                        className={`w-full h-full object-cover ${offline ? "opacity-30 grayscale" : ""}`}
                      />
                      {offline && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="text-emergency text-[11px] font-semibold uppercase tracking-wide">
                            Camera offline
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <Camera size={32} className="text-text-muted" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="px-8 mt-6 flex-1">
        <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
          <div className="flex items-center justify-between h-12 px-4">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-text-muted" />
              <h2 className="text-[14px] font-bold text-text-primary">
                Recent Activity
              </h2>
            </div>
            <Link
              href="/dashboard/alerts"
              className="text-[12px] text-accent hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-border-default">
            {events.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-text-muted">
                No recent activity
              </div>
            )}
            {events
              .slice()
              .reverse()
              .slice(0, 20)
              .map((evt) => {
                const badge = DOMAIN_BADGE_STYLES[evt.domain] ?? DOMAIN_BADGE_STYLES.system;
                return (
                  <div
                    key={evt.id}
                    className="flex items-center gap-3 h-12 px-4"
                  >
                    <span className="text-[11px] font-mono text-text-muted w-[72px] shrink-0">
                      {formatTime(evt.timestamp)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text} shrink-0`}
                    >
                      {evt.domain}
                    </span>
                    <span className="text-[13px] text-text-secondary truncate">
                      {evt.message}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
