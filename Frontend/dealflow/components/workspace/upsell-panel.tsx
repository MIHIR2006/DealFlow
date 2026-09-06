"use client";

import { useState, useEffect } from "react";
import { Plus, Check, X } from "lucide-react";
import { Upsell } from "@/lib/types";
import { inr } from "@/lib/hooks";

export function UpsellPanel({
  suggestions,
  addedIds = [],
  loading = false,
  onAddSuggestion,
  className = "",
}: {
  suggestions: Upsell[];
  addedIds?: number[];
  loading?: boolean;
  onAddSuggestion: (item: Upsell) => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState<number[]>([]);

  // A fresh suggestion list (new quotation, cart changed) should clear stale dismissals.
  useEffect(() => setDismissed([]), [suggestions]);

  const items = suggestions.filter((s) => !dismissed.includes(s.product_id));

  return (
    <div className={`rounded-[20px] bg-white p-4 card-shadow ${className}`}>
      <div className="flex items-center justify-between border-b border-ink/6 pb-3">
        <h3 className="text-[14px] font-semibold text-ink">Upsell and cross-sell</h3>
        <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-mist">
          Ranked by margin
        </span>
      </div>
      <p className="mt-2 text-[12.5px] text-mist">
        Suggestions from co-purchase rules. Adding one recalculates margin.
      </p>

      <div className="mt-3 space-y-2.5">
        {loading ? (
          <p className="py-4 text-center text-[12px] text-mist">Loading suggestions&hellip;</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-mist">No suggestions for this mix.</p>
        ) : (
          items.map((item) => {
            const isAdded = addedIds.includes(item.product_id);
            const delta = parseFloat(item.margin_pct_delta) || 0;
            return (
              <div
                key={item.product_id}
                className="rounded-[16px] border border-ink/6 bg-cream/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ink">{item.name}</span>
                      {item.is_promoted ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-mist">
                          Promoted
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-mist">SKU {item.sku}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => [...prev, item.product_id])}
                    className="-m-1 p-2 text-mist hover:text-ink sm:m-0 sm:p-1"
                    title="Dismiss"
                  >
                    <X className="size-3" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-ink/6 pt-2">
                  <div>
                    <span className="text-[13px] font-semibold tabular-nums text-ink">
                      {inr(item.unit_price)}
                    </span>
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        delta >= 0 ? "tone-ok" : "tone-bad"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)}% margin
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isAdded}
                    onClick={() => onAddSuggestion(item)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-medium sm:px-2.5 sm:py-1 ${
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
          })
        )}
      </div>
    </div>
  );
}
