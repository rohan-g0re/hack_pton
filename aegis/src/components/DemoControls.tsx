"use client";

import { useState } from "react";

const ACTIONS = [
  { key: "emergency", label: "Trigger Emergency", color: "bg-red-600 hover:bg-red-500" },
  { key: "grocery", label: "Trigger Grocery Refill", color: "bg-emerald-600 hover:bg-emerald-500" },
  { key: "medication", label: "Trigger Med Reminder", color: "bg-blue-600 hover:bg-blue-500" },
  { key: "summary", label: "Send Daily Summary", color: "bg-purple-600 hover:bg-purple-500" },
] as const;

export default function DemoControls() {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function run(action: string) {
    setBusy(action);
    setLastResult(null);
    try {
      const res = await fetch("/api/demo/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setLastResult(
        res.ok
          ? `✓ ${action}: ${JSON.stringify(data).slice(0, 140)}`
          : `✗ ${action}: ${data.error ?? "failed"}`
      );
    } catch (err) {
      setLastResult(`✗ ${action}: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="font-semibold text-gray-100 mb-3">Demo Controls</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => run(a.key)}
            disabled={busy !== null}
            className={`${a.color} disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors`}
          >
            {busy === a.key ? "Running..." : a.label}
          </button>
        ))}
      </div>
      {lastResult && (
        <div className="mt-3 text-xs text-gray-400 font-mono truncate">
          {lastResult}
        </div>
      )}
    </div>
  );
}
