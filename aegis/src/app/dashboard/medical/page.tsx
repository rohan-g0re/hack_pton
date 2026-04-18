"use client";

import { useEffect, useState, useCallback } from "react";
import { Camera, CheckCircle, Timer, Pencil } from "lucide-react";

interface MedEntry {
  name: string;
  time: string;
  status: "taken" | "due" | "upcoming" | "missed";
  detail: string;
}

const DEFAULT_SCHEDULE: MedEntry[] = [
  {
    name: "Lisinopril 10mg",
    time: "8:00 AM",
    status: "taken",
    detail: "Taken at 8:12 AM",
  },
  {
    name: "Metformin 500mg",
    time: "12:00 PM",
    status: "due",
    detail: "Due in 15 min",
  },
  {
    name: "Atorvastatin 20mg",
    time: "8:00 PM",
    status: "upcoming",
    detail: "Scheduled",
  },
];

const STATUS_STYLES: Record<
  string,
  { circle: string; icon: typeof CheckCircle; iconColor: string; badge: string; badgeText: string; detailColor: string }
> = {
  taken: {
    circle: "bg-grocery-dim",
    icon: CheckCircle,
    iconColor: "text-grocery",
    badge: "bg-grocery-dim text-grocery",
    badgeText: "Taken",
    detailColor: "text-grocery",
  },
  due: {
    circle: "bg-warning/15",
    icon: Timer,
    iconColor: "text-warning",
    badge: "bg-warning/15 text-warning",
    badgeText: "Due Soon",
    detailColor: "text-warning",
  },
  upcoming: {
    circle: "bg-bg-elevated",
    icon: Timer,
    iconColor: "text-text-muted",
    badge: "bg-bg-elevated text-text-muted",
    badgeText: "Upcoming",
    detailColor: "text-text-muted",
  },
  missed: {
    circle: "bg-emergency-dim",
    icon: Timer,
    iconColor: "text-emergency",
    badge: "bg-emergency-dim text-emergency",
    badgeText: "Missed",
    detailColor: "text-emergency",
  },
};

function todayFormatted() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function MedicalPage() {
  const [schedule, setSchedule] = useState<MedEntry[]>(DEFAULT_SCHEDULE);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const pollSchedule = useCallback(async () => {
    try {
      const res = await fetch("/api/medical/schedule");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setSchedule(data);
      }
    } catch { /* ignore — use default schedule */ }
  }, []);

  const pollSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshot/latest/medical");
      if (res.ok) {
        const data = await res.json();
        if (data.image) setSnapshot(data.image);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    pollSchedule();
    const id = setInterval(pollSchedule, 5000);
    return () => clearInterval(id);
  }, [pollSchedule]);

  useEffect(() => {
    pollSnapshot();
    const id = setInterval(pollSnapshot, 3000);
    return () => clearInterval(id);
  }, [pollSnapshot]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between h-[72px] px-8 shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-text-primary">Medical</h1>
          <p className="text-[13px] text-text-secondary">
            Today&apos;s medication schedule
          </p>
        </div>
        <button className="flex items-center gap-2 bg-bg-card border border-border-default rounded-lg px-3 py-1.5 hover:bg-bg-elevated transition-colors">
          <Pencil size={13} className="text-text-muted" />
          <span className="text-[12px] font-medium text-text-secondary">
            Edit Schedule
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex gap-5 px-8 py-2 flex-1">
        {/* Left — Schedule card */}
        <div className="flex-1">
          <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
            <div className="flex items-center justify-between h-12 px-4 border-b border-border-default">
              <h2 className="text-[14px] font-bold text-text-primary">
                Today&apos;s Schedule
              </h2>
              <span className="text-[12px] font-mono text-text-muted">
                {todayFormatted()}
              </span>
            </div>

            <div className="divide-y divide-border-default">
              {schedule.map((med, idx) => {
                const style = STATUS_STYLES[med.status];
                const Icon = style.icon;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-4 h-[60px] px-4"
                  >
                    {/* Status circle */}
                    <div
                      className={`w-9 h-9 rounded-full ${style.circle} flex items-center justify-center shrink-0`}
                    >
                      <Icon size={18} className={style.iconColor} />
                    </div>

                    {/* Med info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-text-primary">
                        {med.name}
                      </p>
                      <p
                        className={`text-[12px] font-mono ${style.detailColor}`}
                      >
                        {med.time} · {med.detail}
                      </p>
                    </div>

                    {/* Badge */}
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${style.badge} shrink-0`}
                    >
                      {style.badgeText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right — Camera card */}
        <div className="w-[340px] shrink-0">
          <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 h-9 px-3">
              <span className="w-2 h-2 rounded-full bg-medical" />
              <span className="text-[12px] font-medium text-text-secondary">
                Medicine Table Camera
              </span>
            </div>
            <div className="h-[180px] bg-bg-elevated flex items-center justify-center">
              {snapshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${snapshot}`}
                  alt="Medicine table feed"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera size={32} className="text-text-muted" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
