"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Pill,
  Bell,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, domain: "accent" as const },
  { href: "/dashboard/groceries", label: "Groceries", icon: ShoppingCart, domain: "grocery" as const },
  { href: "/dashboard/medical", label: "Medical", icon: Pill, domain: "medical" as const },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell, domain: "emergency" as const },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, domain: "accent" as const },
] as const;

type Domain = (typeof NAV_ITEMS)[number]["domain"];

const ACTIVE_STYLES: Record<Domain, string> = {
  accent: "bg-accent-dim text-accent",
  grocery: "bg-grocery-dim text-grocery",
  medical: "bg-medical-dim text-medical",
  emergency: "bg-emergency-dim text-emergency",
};

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen bg-sidebar-bg border-r border-border-default shrink-0">
        <div className="px-5 pt-6 pb-4 flex items-center gap-2">
          <span className="text-[20px] font-bold text-text-primary">Aegis</span>
          <span className="inline-block w-2 h-2 rounded-full bg-grocery" />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                  active
                    ? ACTIVE_STYLES[item.domain]
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-card"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-5 border-t border-border-default flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white text-sm font-semibold shrink-0">
            M
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-text-primary truncate">Margaret Johnson</p>
            <p className="text-[12px] text-text-muted truncate">All clear today</p>
          </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-center justify-around bg-sidebar-bg border-t border-border-default px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                active
                  ? ACTIVE_STYLES[item.domain]
                  : "text-text-muted"
              }`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
