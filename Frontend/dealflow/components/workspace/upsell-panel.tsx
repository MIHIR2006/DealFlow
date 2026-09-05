"use client";

import React, { useState } from "react";
import { Sparkles, Plus, Check, X } from "lucide-react";
import { UpsellSuggestion } from "@/lib/types";

interface UpsellPanelProps {
  suggestions?: UpsellSuggestion[];
  onAddSuggestion: (item: UpsellSuggestion) => void;
  className?: string;
}

const DEFAULT_SUGGESTIONS: UpsellSuggestion[] = [
  {
    product_id: 101,
    product_name: "Extended Enterprise Warranty (3yr)",
    category_name: "Service",
    sku: "WAR-3YR-PRO",
    unit_price: "₹34,000",
    reason: "Frequently paired with Laptop Pro orders",
    margin_delta_pct: "+2.4%",
    is_promoted: true,
    tag: "Q3 Campaign",
  },
  {
    product_id: 102,
    product_name: "Docking Station Ultra Dual-4K",
    category_name: "Hardware",
    sku: "DOCK-U-4K",
    unit_price: "₹18,500",
    reason: "78% of Gold Tier customers add this accessory",
    margin_delta_pct: "+1.2%",
    is_promoted: false,
  },
  {
    product_id: 103,
    product_name: "Cloud Telemetry & Log Retention",
    category_name: "Subscription",
    sku: "SUB-LOG-RET",
    unit_price: "₹6,500/mo",
    reason: "Recurring high-margin SaaS expansion",
    margin_delta_pct: "+3.1%",
    is_promoted: true,
    tag: "Recurring ARR",
  },
];

export function UpsellPanel({
  suggestions = DEFAULT_SUGGESTIONS,
  onAddSuggestion,
  className = "",
}: UpsellPanelProps) {
  const [items, setItems] = useState<UpsellSuggestion[]>(suggestions);
  const [addedIds, setAddedIds] = useState<number[]>([]);

  function handleAdd(item: UpsellSuggestion) {
    setAddedIds((prev) => [...prev, item.product_id]);
    onAddSuggestion(item);
  }

  function handleDismiss(productId: number) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  return (
    <div className={`rounded-[20px] bg-white p-4 border border-ink/8 shadow-xs ${className}`}>
      <div className="flex items-center justify-between pb-3 border-b border-ink/6">
        <h3 className="text-[13.5px] font-semibold text-ink flex items-center gap-1.5">
          <Sparkles className="size-4 text-purple-600" />
          Smart Recommendations
        </h3>
        <span className="text-[11px] font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
          Ranked Affinity
        </span>
      </div>
      <p className="mt-2 text-[12px] text-mist">
        Suggestions based on historical co-purchase patterns and promoted margin boosters.
      </p>

      <div className="mt-3 space-y-2.5">
        {items.map((item) => {
          const isAdded = addedIds.includes(item.product_id);
          return (
            <div
              key={item.product_id}
              className="relative rounded-[16px] bg-cream/40 p-3 border border-ink/6 hover:border-ink/15 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-[13px] text-ink">
                      {item.product_name}
                    </span>
                    {item.tag && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-purple-100 text-purple-900">
                        {item.tag}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-mist mt-0.5">{item.reason}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDismiss(item.product_id)}
                  className="text-mist hover:text-ink transition-colors p-1"
                  title="Dismiss suggestion"
                >
                  <X className="size-3" />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between pt-2 border-t border-ink/6">
                <div>
                  <span className="font-mono text-[12.5px] font-semibold text-ink">
                    {item.unit_price}
                  </span>
                  <span className="ml-2 font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    {item.margin_delta_pct} margin
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isAdded}
                  onClick={() => handleAdd(item)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                    isAdded
                      ? "bg-emerald-600 text-white cursor-default"
                      : "bg-ink text-bone hover:bg-ink/90"
                  }`}
                >
                  {isAdded ? (
                    <>
                      <Check className="size-3" /> Added
                    </>
                  ) : (
                    <>
                      <Plus className="size-3" /> Add to Quote
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="text-center py-4 text-[12px] text-mist">
            No active suggestions for this category mix.
          </p>
        )}
      </div>
    </div>
  );
}
