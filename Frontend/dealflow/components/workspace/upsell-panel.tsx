"use client";

import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { UpsellSuggestion } from "@/lib/types";

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
    tag: "Q3 campaign",
  },
  {
    product_id: 102,
    product_name: "Docking Station Ultra Dual-4K",
    category_name: "Hardware",
    sku: "DOCK-U-4K",
    unit_price: "₹18,500",
    reason: "78% of Gold customers add this accessory",
    margin_delta_pct: "+1.2%",
    is_promoted: false,
  },
  {
    product_id: 103,
    product_name: "Cloud Telemetry & Log Retention",
    category_name: "Subscription",
    sku: "SUB-LOG-RET",
    unit_price: "₹6,500/mo",
    reason: "Recurring line on the same order",
    margin_delta_pct: "+3.1%",
    is_promoted: true,
    tag: "Recurring",
  },
];

export function UpsellPanel({
  suggestions = DEFAULT_SUGGESTIONS,
  onAddSuggestion,
  className = "",
}: {
  suggestions?: UpsellSuggestion[];
  onAddSuggestion: (item: UpsellSuggestion) => void;
  className?: string;
}) {
  const [items, setItems] = useState<UpsellSuggestion[]>(suggestions);
  const [addedIds, setAddedIds] = useState<number[]>([]);

  return (
    <div className={`rounded-[20px] bg-white p-4 card-shadow ${className}`}>
      <div className="flex items-center justify-between border-b border-ink/6 pb-3">
        <h3 className="text-[14px] font-semibold text-ink">
          Upsell and cross-sell
        </h3>
        <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-mist">
          Ranked by margin
        </span>
      </div>
      <p className="mt-2 text-[12.5px] text-mist">
        Suggestions from co-purchase rules. Adding one recalculates margin.
      </p>

      <div className="mt-3 space-y-2.5">
        {items.map((item) => {
          const isAdded = addedIds.includes(item.product_id);
          return (
            <div
              key={item.product_id}
              className="rounded-[16px] border border-ink/6 bg-cream/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-ink">
                      {item.product_name}
                    </span>
                    {item.tag ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-mist">
                        {item.tag}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] text-mist">{item.reason}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => prev.filter((i) => i.product_id !== item.product_id))
                  }
                  className="p-1 text-mist hover:text-ink"
                  title="Dismiss"
                >
                  <X className="size-3" />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-ink/6 pt-2">
                <div>
                  <span className="text-[13px] font-semibold tabular-nums text-ink">
                    {item.unit_price}
                  </span>
                  <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium tone-ok">
                    {item.margin_delta_pct} margin
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isAdded}
                  onClick={() => {
                    setAddedIds((prev) => [...prev, item.product_id]);
                    onAddSuggestion(item);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${
                    isAdded ? "tone-ok cursor-default" : "bg-ink text-bone hover:bg-ink/90"
                  }`}
                >
                  {isAdded ? (
                    <>
                      <Check className="size-3" /> Added
                    </>
                  ) : (
                    <>
                      <Plus className="size-3" /> Add to quote
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {items.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-mist">
            No suggestions for this mix.
          </p>
        ) : null}
      </div>
    </div>
  );
}
