"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const CAMERAS = [
  {
    label: "Grocery Shelf",
    domain: "grocery",
    status: "Connected",
    connected: true,
    dotColor: "bg-grocery",
    borderColor: "border-grocery/40",
    badgeBg: "bg-grocery-dim",
    badgeText: "text-grocery",
  },
  {
    label: "Medicine Table",
    domain: "medical",
    status: "Waiting",
    connected: false,
    dotColor: "bg-medical",
    borderColor: "border-border-default",
    badgeBg: "bg-bg-elevated",
    badgeText: "text-text-muted",
  },
  {
    label: "Living Area",
    domain: "emergency",
    status: "Waiting",
    connected: false,
    dotColor: "bg-emergency",
    borderColor: "border-border-default",
    badgeBg: "bg-bg-elevated",
    badgeText: "text-text-muted",
  },
] as const;

export default function CaretakerOnboarding() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 md:px-10 py-5">
        <span className="text-[20px] font-bold text-text-primary">Aegis</span>
        <span className="text-[14px] text-text-muted">Step 4 of 6</span>
      </header>

      {/* Progress bar */}
      <div className="mx-6 md:mx-10 h-[3px] bg-bg-card rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full" style={{ width: "66%" }} />
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center px-6 pt-14 pb-10">
        <h1 className="text-[28px] md:text-[36px] font-bold text-text-primary text-center mb-3">
          Set Up Your Cameras
        </h1>
        <p className="text-[16px] text-text-secondary text-center max-w-lg mb-12">
          Open each URL on the phone you&apos;re placing at that location.
        </p>

        {/* QR Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-3xl">
          {CAMERAS.map((cam) => (
            <div
              key={cam.domain}
              className={`bg-bg-card border ${cam.borderColor} rounded-2xl p-5 flex flex-col items-center`}
            >
              <div className="flex items-center gap-2 w-full mb-4">
                <span className={`w-2.5 h-2.5 rounded-full ${cam.dotColor}`} />
                <span className="text-[15px] font-medium text-text-primary flex-1">
                  {cam.label}
                </span>
                <span
                  className={`text-[12px] px-2.5 py-0.5 rounded-full font-medium ${cam.badgeBg} ${cam.badgeText}`}
                >
                  {cam.status}
                </span>
              </div>

              {/* QR placeholder */}
              <div className="w-full aspect-square bg-white rounded-xl flex items-center justify-center mb-4">
                <svg viewBox="0 0 100 100" className="w-3/4 h-3/4 text-gray-800">
                  <rect x="10" y="10" width="25" height="25" rx="3" fill="currentColor" />
                  <rect x="65" y="10" width="25" height="25" rx="3" fill="currentColor" />
                  <rect x="10" y="65" width="25" height="25" rx="3" fill="currentColor" />
                  <rect x="15" y="15" width="15" height="15" rx="2" fill="white" />
                  <rect x="70" y="15" width="15" height="15" rx="2" fill="white" />
                  <rect x="15" y="70" width="15" height="15" rx="2" fill="white" />
                  <rect x="19" y="19" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="74" y="19" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="19" y="74" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="42" y="10" width="5" height="5" fill="currentColor" />
                  <rect x="42" y="20" width="5" height="5" fill="currentColor" />
                  <rect x="50" y="15" width="5" height="5" fill="currentColor" />
                  <rect x="42" y="42" width="8" height="8" rx="1" fill="currentColor" />
                  <rect x="55" y="42" width="5" height="5" fill="currentColor" />
                  <rect x="65" y="45" width="5" height="5" fill="currentColor" />
                  <rect x="75" y="55" width="5" height="5" fill="currentColor" />
                  <rect x="65" y="65" width="10" height="10" rx="1" fill="currentColor" />
                  <rect x="80" y="70" width="10" height="10" rx="1" fill="currentColor" />
                  <rect x="65" y="80" width="5" height="10" fill="currentColor" />
                </svg>
              </div>

              <code className="text-[12px] font-mono text-text-muted">
                /camera/{cam.domain}
              </code>
            </div>
          ))}
        </div>
      </main>

      {/* Footer buttons */}
      <footer className="px-6 md:px-10 py-5 flex items-center justify-between">
        <Link
          href="/onboarding/caretaker"
          className="px-6 py-2.5 rounded-xl bg-bg-card border border-border-default text-[14px] font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Back
        </Link>
        <button
          onClick={() => router.push("/dashboard")}
          className="px-6 py-2.5 rounded-xl bg-accent text-white text-[14px] font-medium hover:opacity-90 transition-opacity"
        >
          Continue →
        </button>
      </footer>
    </div>
  );
}
