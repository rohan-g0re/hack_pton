"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Pill, AlertTriangle, ShoppingCart } from "lucide-react";

type CameraRole = "grocery" | "medical" | "emergency";

const ROLES: { id: CameraRole; label: string; sub: string; Icon: typeof Shield }[] = [
  { id: "medical", label: "Medicine table", sub: "Pill bottles & prescriptions", Icon: Pill },
  { id: "emergency", label: "Living area", sub: "Falls & emergencies", Icon: AlertTriangle },
  { id: "grocery", label: "Grocery shelf", sub: "Pantry & fridge contents", Icon: ShoppingCart },
];

export default function PatientOnboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<CameraRole | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.localStorage.getItem("aegis_camera_role") as CameraRole | null;
    if (existing && ["grocery", "medical", "emergency"].includes(existing)) {
      router.replace(`/camera/${existing}`);
    }
  }, [router]);

  function handleSubmit() {
    if (name.trim()) {
      localStorage.setItem("aegis_patient_name", name.trim());
    }
    if (!role) return;
    localStorage.setItem("aegis_camera_role", role);
    router.push(`/camera/${role}`);
  }

  const canSubmit = !!role;

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center">
      {/* Header */}
      <header className="w-full max-w-md flex items-center justify-end px-6 py-5">
        <span className="text-[14px] text-text-muted">1 of 3</span>
      </header>

      {/* Progress bar */}
      <div className="w-full max-w-md px-6">
        <div className="h-[3px] bg-bg-card rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: "33%" }} />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 w-full max-w-md py-8">
        <div className="w-20 h-20 rounded-full bg-accent-dim flex items-center justify-center mb-8">
          <Shield size={36} className="text-accent" />
        </div>

        <h1 className="text-[30px] font-bold text-text-primary text-center mb-3">
          Welcome to Aegis
        </h1>
        <p className="text-[16px] text-text-secondary text-center mb-10">
          Your family has set up Aegis to help keep you safe.
        </p>

        <div className="w-full mb-6">
          <label
            htmlFor="patient-name"
            className="block text-[14px] font-medium text-text-secondary mb-2"
          >
            What should we call you?
          </label>
          <input
            id="patient-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 rounded-xl bg-bg-card border border-accent/40 text-text-primary text-[16px] placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="w-full mb-8">
          <p className="text-[14px] font-medium text-text-secondary mb-3">
            What is this device watching?
          </p>
          <div className="grid grid-cols-1 gap-2">
            {ROLES.map(({ id, label, sub, Icon }) => {
              const selected = role === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRole(id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                    selected
                      ? "border-accent bg-accent-dim"
                      : "border-bg-card bg-bg-card hover:border-accent/40"
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      selected ? "bg-accent/20" : "bg-bg-primary"
                    }`}
                  >
                    <Icon size={18} className={selected ? "text-accent" : "text-text-secondary"} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium text-text-primary">{label}</span>
                    <span className="block text-[12px] text-text-muted">{sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full h-14 rounded-xl bg-accent text-white text-[16px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Get Started →
        </button>
      </main>
    </div>
  );
}
