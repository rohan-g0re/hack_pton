"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Monitor, Heart, Check } from "lucide-react";

const CARETAKER_FEATURES = [
  "Live camera monitoring for 3 zones",
  "AI-powered alerts via iMessage",
  "Grocery & medication tracking",
];

const PATIENT_FEATURES = [
  "Simple phone camera setup",
  "Voice medication reminders",
  "One-tap emergency help",
];

export default function LandingPage() {
  const router = useRouter();

  function selectRole(role: "caretaker" | "patient") {
    localStorage.setItem("aegis_role", role);
    router.push(`/onboarding/${role}`);
  }

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Navbar */}
      <nav className="h-[68px] flex items-center justify-between px-6 md:px-10 shrink-0">
        <span className="text-[22px] font-bold text-text-primary">Aegis</span>
        <div className="flex items-center gap-6">
          <span className="hidden sm:inline text-[14px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
            About
          </span>
          <span className="hidden sm:inline text-[14px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
            How it works
          </span>
          <Link
            href="/dashboard"
            className="px-5 py-2 rounded-full bg-accent text-white text-[14px] font-medium hover:opacity-90 transition-opacity"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-16">
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-dim mb-8">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-[12px] text-accent font-medium">HackPrinceton 2026</span>
        </div>

        <h1 className="text-[40px] md:text-[64px] font-bold text-text-primary text-center leading-[1.1] mb-5">
          One Guardian,
          <br />
          Three Promises.
        </h1>

        <p className="text-[16px] md:text-[20px] text-text-secondary text-center max-w-xl mb-14">
          Groceries, medication, and safety — watched by AI, acted on immediately.
        </p>

        {/* Role cards */}
        <div className="flex flex-col md:flex-row gap-5 w-full max-w-[720px]">
          {/* Caretaker */}
          <button
            onClick={() => selectRole("caretaker")}
            className="flex-1 bg-bg-card border border-border-default rounded-2xl p-7 text-left hover:border-accent/40 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-dim flex items-center justify-center mb-5">
              <Monitor size={22} className="text-accent" />
            </div>
            <h2 className="text-[20px] font-semibold text-text-primary mb-1">Caretaker</h2>
            <p className="text-[14px] text-text-muted mb-5">Adult child</p>
            <ul className="space-y-2.5 mb-7">
              {CARETAKER_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-text-secondary">
                  <Check size={16} className="text-accent mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <span className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-accent text-white text-[14px] font-semibold group-hover:opacity-90 transition-opacity">
              Set Up Monitoring
            </span>
          </button>

          {/* Patient */}
          <button
            onClick={() => selectRole("patient")}
            className="flex-1 bg-bg-card border border-border-default rounded-2xl p-7 text-left hover:border-grocery/40 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-grocery-dim flex items-center justify-center mb-5">
              <Heart size={22} className="text-grocery" />
            </div>
            <h2 className="text-[20px] font-semibold text-text-primary mb-1">Patient</h2>
            <p className="text-[14px] text-text-muted mb-5">Elder / parent</p>
            <ul className="space-y-2.5 mb-7">
              {PATIENT_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-text-secondary">
                  <Check size={16} className="text-grocery mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <span className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-grocery text-white text-[14px] font-semibold group-hover:opacity-90 transition-opacity">
              Set Up My Phone
            </span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-5 flex items-center justify-between border-t border-border-default text-[13px] text-text-muted">
        <span>Aegis © 2026 · HackPrinceton Healthcare Track</span>
        <span className="hidden sm:inline">Dark mode by default</span>
      </footer>
    </div>
  );
}
