"use client";

import { useEffect, useState } from "react";

interface CameraPreviewProps {
  domain: "grocery" | "medical" | "emergency";
}

const DOMAIN_LABELS = {
  grocery: "Grocery Shelf",
  medical: "Medicine Table",
  emergency: "Living Area",
};

const DOMAIN_COLORS = {
  grocery: "border-emerald-600",
  medical: "border-blue-600",
  emergency: "border-red-600",
};

const OFFLINE_AFTER_MS = 30_000;

export default function CameraPreview({ domain }: CameraPreviewProps) {
  const [image, setImage] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch(`/api/snapshot/latest/${domain}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && data.image) {
          setImage(data.image);
          setTimestamp(data.timestamp);
        }
      } catch {
        // ignore
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [domain]);

  const offline = timestamp !== null && now - timestamp > OFFLINE_AFTER_MS;
  const lastSeen = timestamp
    ? new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div className={`rounded-xl border-2 ${DOMAIN_COLORS[domain]} overflow-hidden bg-gray-900`}>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
        <span className="text-sm font-semibold text-white">
          {DOMAIN_LABELS[domain]}
        </span>
        <span className={`text-xs ${offline ? "text-red-400" : "text-gray-400"}`}>
          {offline ? "Camera offline" : `Last: ${lastSeen}`}
        </span>
      </div>
      <div className="relative aspect-video bg-black flex items-center justify-center">
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/jpeg;base64,${image}`}
              alt={`${domain} feed`}
              className={`w-full h-full object-cover ${offline ? "opacity-40 grayscale" : ""}`}
            />
            {offline && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span className="text-red-400 text-sm font-semibold uppercase tracking-wide">
                  Camera offline
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-gray-500 text-sm p-4">
            <div className="mb-2">No feed yet</div>
            <div className="text-xs text-gray-600">
              Open <code className="font-mono text-gray-400">/camera/{domain}</code> on a device
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
