"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Siren, Phone, CheckCircle } from "lucide-react";

export default function SOSPage() {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sent, setSent] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const HOLD_MS = 3000;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePressStart = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
    if (e && "touches" in e) e.preventDefault();
    if (sent || timerRef.current) return;
    setHolding(true);
    setProgress(0);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / HOLD_MS, 1);
      setProgress(pct);

      if (pct >= 1) {
        clearTimer();
        setHolding(false);
        setSent(true);
        fetch("/api/emergency/sos", { method: "POST" }).catch(console.error);
      }
    }, 50);
  }, [sent, clearTimer]);

  const handlePressEnd = useCallback(() => {
    if (sent) return;
    clearTimer();
    setHolding(false);
    setProgress(0);
  }, [sent, clearTimer]);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col max-w-md mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 h-[62px] shrink-0">
        <Link
          href="/patient"
          className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-[14px]">Home</span>
        </Link>
        <span className="text-[15px] font-bold text-text-primary">9:41</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {sent ? (
          <>
            <CheckCircle size={48} className="text-grocery mb-4" />
            <h1 className="text-[28px] font-bold text-text-primary mb-2">
              Alert Sent!
            </h1>
            <p className="text-[15px] text-text-secondary text-center max-w-xs">
              Your family has been notified. Help is on the way.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[28px] font-bold text-text-primary mb-2">
              Emergency
            </h1>
            <p className="text-[15px] text-text-secondary text-center max-w-xs mb-10">
              Press and hold the button for 3 seconds to alert your family
              immediately.
            </p>

            {/* Outer ring */}
            <div className="relative w-[220px] h-[220px] rounded-full bg-emergency/10 flex items-center justify-center">
              {/* Progress ring */}
              {holding && (
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90"
                  viewBox="0 0 220 220"
                >
                  <circle
                    cx="110"
                    cy="110"
                    r="105"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-emergency"
                    strokeDasharray={`${2 * Math.PI * 105}`}
                    strokeDashoffset={`${2 * Math.PI * 105 * (1 - progress)}`}
                    strokeLinecap="round"
                  />
                </svg>
              )}

              {/* Inner button */}
              <button
                onMouseDown={(e) => handlePressStart(e)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={(e) => handlePressStart(e)}
                onTouchEnd={handlePressEnd}
                onTouchCancel={handlePressEnd}
                className={`w-[180px] h-[180px] rounded-full bg-emergency flex items-center justify-center shadow-[0_0_60px_rgba(239,68,68,0.4)] transition-transform ${
                  holding ? "scale-95" : "active:scale-95"
                }`}
              >
                <Siren size={64} className="text-white" />
              </button>
            </div>

            <span className="mt-5 text-[15px] text-text-muted">
              Hold for 3 seconds
            </span>
          </>
        )}
      </div>

      {/* Bottom */}
      <div className="px-6 pb-8">
        <a
          href="tel:911"
          className="flex items-center justify-center gap-2 w-full h-12 bg-bg-card border border-border-default rounded-xl text-emergency font-medium text-[15px]"
        >
          <Phone size={18} />
          Call 911 directly
        </a>
      </div>
    </div>
  );
}
