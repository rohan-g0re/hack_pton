"use client";

import { useEffect, useState, useCallback } from "react";
import { Camera, Package, Eye, Store } from "lucide-react";
import type { GroceryCartItem } from "@/lib/globals";

interface CartData {
  cart: GroceryCartItem[];
  analysis?: string;
}

export default function GroceriesPage() {
  const [cart, setCart] = useState<GroceryCartItem[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [snapshotTime, setSnapshotTime] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const pollCart = useCallback(async () => {
    try {
      const res = await fetch("/api/grocery/cart");
      if (res.ok) {
        const data: CartData = await res.json();
        if (data.cart) setCart(data.cart);
        if (data.analysis) setAnalysis(data.analysis);
      }
    } catch { /* ignore */ }
  }, []);

  const pollSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshot/latest/grocery");
      if (res.ok) {
        const data = await res.json();
        if (data.image) {
          setSnapshot(data.image);
          setSnapshotTime(data.timestamp);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    pollCart();
    const id = setInterval(pollCart, 5000);
    return () => clearInterval(id);
  }, [pollCart]);

  useEffect(() => {
    pollSnapshot();
    const id = setInterval(pollSnapshot, 3000);
    return () => clearInterval(id);
  }, [pollSnapshot]);

  const sampleItems = cart.length > 0
    ? cart.slice(0, 10)
    : [
        { name: "Whole milk 1gal", quantity: 1, orderable: true, source: "vision" as const },
        { name: "Whole wheat bread", quantity: 1, orderable: true, source: "vision" as const },
        { name: "Eggs large 12ct", quantity: 1, orderable: true, source: "vision" as const },
      ];

  const samplePrices: Record<string, string> = {
    "Whole milk 1gal": "$3.49",
    "Whole wheat bread": "$4.99",
    "Eggs large 12ct": "$3.99",
  };

  const lowCount = sampleItems.length;
  const lastScanTime = snapshotTime
    ? new Date(snapshotTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "2:34 PM";

  function toggleItem(idx: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between h-[72px] px-8 shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-text-primary">Groceries</h1>
          <p className="text-[13px] text-text-secondary">
            Last shelf scan: {lastScanTime}
          </p>
        </div>
      </div>

      {/* Alert banner */}
      <div className="mx-8 flex items-center gap-3 h-[52px] bg-grocery-dim rounded-xl px-4">
        <Package size={18} className="text-grocery shrink-0" />
        <p className="text-[13px] text-grocery flex-1">
          Low supply detected.{" "}
          <span className="font-semibold">{lowCount} items</span> ready to
          review.
        </p>
        <button className="bg-grocery text-white text-[12px] font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
          Review Order
        </button>
      </div>

      {/* Content area */}
      <div className="flex gap-5 px-8 py-6 flex-1">
        {/* Left column */}
        <div className="w-[340px] shrink-0 flex flex-col gap-4">
          {/* Camera card */}
          <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 h-9 px-3">
              <span className="w-2 h-2 rounded-full bg-grocery" />
              <span className="text-[12px] font-medium text-text-secondary">
                Grocery Shelf Camera
              </span>
            </div>
            <div className="h-[180px] bg-bg-elevated flex items-center justify-center">
              {snapshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${snapshot}`}
                  alt="Grocery shelf feed"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera size={32} className="text-text-muted" />
              )}
            </div>
          </div>

          {/* Vision Analysis card */}
          <div className="bg-bg-card border border-border-default rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={15} className="text-text-muted" />
              <span className="text-[13px] font-semibold text-text-secondary">
                Vision Analysis
              </span>
            </div>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {analysis ??
                "Shelf scan detected low inventory on dairy and bread items. Eggs supply is also running low. Recommended restock quantities have been calculated."}
            </p>
          </div>
        </div>

        {/* Right column — Pending Order */}
        <div className="flex-1">
          <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
            {/* Order header */}
            <div className="flex items-center justify-between h-12 px-4 border-b border-border-default">
              <h2 className="text-[14px] font-bold text-text-primary">
                Pending Order
              </h2>
              <div className="flex items-center gap-2 bg-bg-elevated px-2.5 py-1 rounded-md">
                <Store size={13} className="text-text-muted" />
                <span className="text-[12px] font-medium text-text-secondary">
                  Walmart
                </span>
              </div>
            </div>

            {/* Item rows */}
            <div className="divide-y divide-border-default">
              {sampleItems.map((item, idx) => {
                const displayName =
                  item.brand ? `${item.brand} ${item.name}` : item.name;
                const price =
                  samplePrices[item.name] ??
                  `$${(2.99 + idx * 1.5).toFixed(2)}`;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-4 h-12"
                  >
                    <button
                      onClick={() => toggleItem(idx)}
                      className={`w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked.has(idx)
                          ? "bg-accent border-accent"
                          : "border-border-default bg-transparent"
                      }`}
                    >
                      {checked.has(idx) && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <span className="text-[13px] text-text-primary flex-1">
                      {displayName}
                    </span>
                    <span className="text-[13px] font-mono text-text-secondary">
                      {price}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 h-14 border-t border-border-default">
              <span className="text-[13px] font-mono text-text-secondary">
                Est. $42.50 total
              </span>
              <div className="flex gap-2">
                <button className="bg-bg-elevated border border-border-default text-text-secondary text-[12px] font-semibold px-4 py-1.5 rounded-lg hover:bg-bg-card transition-colors">
                  Cancel
                </button>
                <button className="bg-grocery text-white text-[12px] font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
                  Approve &amp; Order
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
