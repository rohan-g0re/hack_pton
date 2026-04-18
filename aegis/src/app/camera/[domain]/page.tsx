"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Volume2 } from "lucide-react";
import CameraFeed from "@/components/CameraFeed";

const INTERVALS: Record<string, number> = {
  grocery: 60 * 1000,
  medical: 10 * 1000,
  emergency: 3 * 1000,
};

const DOMAIN_TAGS: Record<string, string> = {
  grocery: "grocery-shelf",
  medical: "medicine-table",
  emergency: "living-area",
};

export default function CameraPage() {
  const params = useParams();
  const domain = params.domain as string;
  const [ttsMessage, setTtsMessage] = useState<string>("");
  const [now, setNow] = useState(new Date());

  const isValidDomain = ["grocery", "medical", "emergency"].includes(domain);
  const intervalSec = INTERVALS[domain] ? INTERVALS[domain] / 1000 : 0;
  const nextLabel =
    intervalSec >= 60
      ? `${Math.round(intervalSec / 60)} min`
      : `${intervalSec} s`;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (domain !== "medical") return;

    const eventSource = new EventSource("/api/medical/tts-stream");
    eventSource.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.speak) {
        setTtsMessage(data.speak);
        const utterance = new SpeechSynthesisUtterance(data.speak);
        utterance.rate = 0.85;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        speechSynthesis.speak(utterance);
      }
    };

    return () => eventSource.close();
  }, [domain]);

  if (!isValidDomain) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center text-text-primary">
        <p>Invalid camera domain. Use: /camera/grocery, /camera/medical, or /camera/emergency</p>
      </div>
    );
  }

  const timestamp = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-[62px] shrink-0">
        <Link
          href="/patient"
          className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-[14px]">Home</span>
        </Link>

        <div className="flex items-center gap-1.5 bg-emergency px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[12px] font-semibold text-white uppercase tracking-wide">
            Live
          </span>
        </div>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 bg-black relative">
        <CameraFeed
          domain={domain as "grocery" | "medical" | "emergency"}
          intervalMs={INTERVALS[domain]}
        />

        {/* Overlay */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none">
          <span className="bg-black/70 text-white font-mono text-[12px] px-2 py-1 rounded-full">
            {DOMAIN_TAGS[domain]}
          </span>
          <span className="bg-black/70 text-white font-mono text-[12px] px-2 py-1 rounded-full">
            {timestamp}
          </span>
        </div>
      </div>

      {/* Bottom section */}
      <div className="shrink-0">
        {/* TTS card (medical only) */}
        {domain === "medical" && ttsMessage && (
          <div className="mx-4 mt-3 flex items-center gap-3 bg-medical-dim border border-medical rounded-xl px-4 py-3">
            <Volume2 size={18} className="text-medical shrink-0" />
            <p className="text-[13px] text-text-primary">
              <span className="font-semibold">Speaking:</span> {ttsMessage}
            </p>
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-center gap-2 bg-bg-card mx-4 my-3 px-4 py-3 rounded-xl">
          <Camera size={16} className="text-text-muted" />
          <span className="text-[13px] text-text-secondary">
            Next capture in {nextLabel}
          </span>
        </div>

        {/* Change role link */}
        <div className="flex items-center justify-center pb-3">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem("aegis_camera_role");
                window.location.href = "/onboarding/patient";
              }
            }}
            className="text-[12px] text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            Change camera role
          </button>
        </div>
      </div>
    </div>
  );
}
