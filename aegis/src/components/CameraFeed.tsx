"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface CameraFeedProps {
  domain: "grocery" | "medical" | "emergency";
  intervalMs: number;
  onSnapshot?: (base64: string) => void;
  showPreview?: boolean;
}

const DOMAIN_LABELS = {
  grocery: "Grocery Shelf",
  medical: "Medicine Table",
  emergency: "Living Area",
};

const DOMAIN_COLORS = {
  grocery: "border-grocery",
  medical: "border-medical",
  emergency: "border-emergency",
};

export default function CameraFeed({
  domain,
  intervalMs,
  onSnapshot,
  showPreview = true,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"connecting" | "active" | "error">(
    "connecting"
  );
  const [lastCapture, setLastCapture] = useState<string>("");
  const [error, setError] = useState<string>("");

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    // Target 1024px longest side at JPEG quality ~0.8 (~150-250 KB).
    // Sub-1024 hurts small-object detection (pills, shelf labels); oversize inflates tokens.
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const TARGET = 1024;
    const scale = Math.min(1, TARGET / Math.max(vw, vh));
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];

    setLastCapture(new Date().toLocaleTimeString());

    if (onSnapshot) {
      onSnapshot(base64);
    }

    try {
      await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, image: base64, timestamp: Date.now() }),
      });
    } catch (err) {
      console.error("Snapshot upload failed:", err);
    }
  }, [domain, onSnapshot]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStatus("active");
        }
      } catch (err) {
        setError(
          "Camera access denied. Please grant camera permission and reload."
        );
        setStatus("error");
        console.error("getUserMedia error:", err);
      }
    }

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (status !== "active") return;

    captureFrame();
    const interval = setInterval(captureFrame, intervalMs);
    return () => clearInterval(interval);
  }, [status, intervalMs, captureFrame]);

  return (
    <div className={`rounded-lg border-2 ${DOMAIN_COLORS[domain]} bg-bg-card overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2 bg-bg-elevated">
        <span className="text-sm font-semibold text-text-primary">
          {DOMAIN_LABELS[domain]}
        </span>
        <div className="flex items-center gap-2">
          {status === "active" && (
            <span className="text-xs text-text-muted">
              Last: {lastCapture || "—"}
            </span>
          )}
          <span
            className={`w-2 h-2 rounded-full ${
              status === "active"
                ? "bg-grocery animate-pulse"
                : status === "error"
                ? "bg-emergency"
                : "bg-warning animate-pulse"
            }`}
          />
        </div>
      </div>

      {showPreview && (
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-emergency text-sm p-4 text-center">
              {error}
            </div>
          )}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
