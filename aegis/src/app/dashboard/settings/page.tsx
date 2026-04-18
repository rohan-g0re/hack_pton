"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

interface Settings {
  elderName: string;
  knotId: string;
  chatIds: { grocery: string; medical: string; emergency: string };
}

const CHAT_ROWS: { key: keyof Settings["chatIds"]; label: string; dot: string }[] = [
  { key: "grocery", label: "Grocery", dot: "bg-grocery" },
  { key: "medical", label: "Medical", dot: "bg-medical" },
  { key: "emergency", label: "Emergency", dot: "bg-emergency" },
];

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d))
      .catch(() =>
        setSettings({
          elderName: "Margaret Johnson",
          knotId: "",
          chatIds: { grocery: "", medical: "", emergency: "" },
        })
      );
  }, []);

  async function save(patch: Partial<Settings>) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function updateField(field: keyof Settings, value: string) {
    if (!settings) return;
    dirty.current = true;
    setSettings({ ...settings, [field]: value });
  }

  function updateChatId(key: keyof Settings["chatIds"], value: string) {
    if (!settings) return;
    dirty.current = true;
    setSettings({
      ...settings,
      chatIds: { ...settings.chatIds, [key]: value },
    });
  }

  function handleBlur() {
    if (!dirty.current || !settings) return;
    dirty.current = false;
    save(settings);
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-screen text-text-muted text-[14px]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-8 pt-8 pb-5">
        <h1 className="text-[18px] font-bold text-text-primary">Settings</h1>
      </div>

      <div className="px-8 flex flex-col md:flex-row gap-6">
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Elder Profile */}
          <div className="bg-bg-card border border-border-default rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-bold text-text-primary">
                Elder Profile
              </h2>
              <Pencil size={16} className="text-accent" />
            </div>

            <label className="block mb-3">
              <span className="text-[11px] text-text-muted uppercase tracking-wide">
                Name
              </span>
              <input
                type="text"
                value={settings.elderName}
                onChange={(e) => updateField("elderName", e.target.value)}
                onBlur={handleBlur}
                className="mt-1 w-full h-10 bg-bg-elevated text-text-primary rounded-lg px-3 text-[14px] border-none outline-none focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="block">
              <span className="text-[11px] text-text-muted uppercase tracking-wide">
                External User ID (Knot)
              </span>
              <input
                type="text"
                value={settings.knotId}
                onChange={(e) => updateField("knotId", e.target.value)}
                onBlur={handleBlur}
                className="mt-1 w-full h-10 bg-bg-elevated text-text-primary font-mono rounded-lg px-3 text-[14px] border-none outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          </div>

          {/* iMessage Chat IDs */}
          <div className="bg-bg-card border border-border-default rounded-xl p-5">
            <h2 className="text-[14px] font-bold text-text-primary mb-4">
              iMessage Chat IDs
            </h2>

            <div className="flex flex-col gap-3">
              {CHAT_ROWS.map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.dot}`} />
                  <span className="text-[13px] text-text-secondary w-24 shrink-0">
                    {row.label}
                  </span>
                  <input
                    type="text"
                    value={settings.chatIds[row.key]}
                    onChange={(e) => updateChatId(row.key, e.target.value)}
                    onBlur={handleBlur}
                    placeholder="chat123456789"
                    className="flex-1 h-10 bg-bg-elevated text-text-primary font-mono rounded-lg px-3 text-[14px] border-none outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="w-full md:w-[340px] shrink-0">
          <div className="bg-bg-card border border-border-default rounded-xl p-5">
            <h2 className="text-[14px] font-bold text-text-primary mb-4">
              Appearance
            </h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
              </div>

              <button
                onClick={toggle}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  theme === "dark" ? "bg-accent" : "bg-bg-elevated"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    theme === "dark" ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
