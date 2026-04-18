"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Pill,
  PhoneCall,
  Camera,
  Signal,
  Battery,
} from "lucide-react";

function getGreetingTime(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export default function PatientHomePage() {
  const [name, setName] = useState("Margaret");

  useEffect(() => {
    const stored = localStorage.getItem("aegis_patient_name");
    if (stored) setName(stored);
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col max-w-md mx-auto">
      {/* Status bar mock */}
      <div className="flex items-center justify-between px-6 h-[62px] shrink-0">
        <span className="text-[15px] font-bold text-text-primary">9:41</span>
        <div className="flex items-center gap-1.5 text-text-primary">
          <Signal size={14} />
          <Battery size={16} />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3">
        <Shield size={28} className="text-accent" />
        <div className="flex items-center gap-2 bg-grocery-dim px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-grocery" />
          <span className="text-[13px] font-medium text-grocery">All Good</span>
        </div>
      </div>

      {/* Greeting */}
      <div className="px-6 pt-6 pb-4">
        <p className="text-[18px] text-text-secondary">
          Good {getGreetingTime()},
        </p>
        <p className="text-[36px] font-bold text-text-primary leading-tight">
          {name}.
        </p>
      </div>

      {/* Next Medication card */}
      <div className="mx-6 bg-bg-card border border-medical rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Pill size={18} className="text-medical" />
            <span className="text-[14px] font-semibold text-medical">
              Next Medication
            </span>
          </div>
          <span className="text-[13px] font-mono text-text-muted">
            in 23 min
          </span>
        </div>
        <p className="text-[26px] font-bold text-text-primary">
          Lisinopril 10mg
        </p>
        <p className="text-[14px] text-text-secondary mt-1">
          Take with lunch at 12:00 PM
        </p>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* SOS section */}
      <div className="flex flex-col items-center pb-6 px-6">
        <p className="text-[13px] text-text-muted mb-5 text-center">
          Press and hold if you need help
        </p>

        <Link
          href="/patient/sos"
          className="relative w-[180px] h-[180px] rounded-full bg-emergency flex items-center justify-center shadow-[0_0_60px_rgba(239,68,68,0.4)] active:scale-95 transition-transform"
        >
          <PhoneCall size={52} className="text-white" />
        </Link>

        <span className="mt-4 text-[18px] font-bold text-emergency">SOS</span>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-border-default">
        <span className="w-2 h-2 rounded-full bg-grocery" />
        <span className="text-[12px] text-text-muted">
          Medicine Table camera active
        </span>
        <Camera size={14} className="text-text-muted ml-1" />
      </div>
    </div>
  );
}
