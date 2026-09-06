"use client";

import { useMemo } from "react";
import { Check, Minus } from "lucide-react";
import { inr } from "@/lib/hooks";
import type { FulfillmentLine, FulfillmentPlan } from "@/lib/types";

/**
 * Why the engine chose these warehouses.
 *
 * The split is a greedy set cover: at each step it takes the warehouse that
 * covers the most outstanding demand for the least shipping cost weight, until
 * the order is covered or nothing is left to cover it with. That is what keeps
 * the shipment count down — every extra warehouse is another shipment, another
 * freight charge.
 *
 * The reasoning was invisible: the page said "GREEDY_SPLIT across 2 shipments"
 * and nothing about the warehouses it turned down. This lays the candidates out
 * beside the choice, so a reviewer can see the trade-off before accepting it —
 * and knows what a Manual Override would be overriding.
 *
 * Every number here comes from the same preview the engine planned against;
 * nothing is recomputed independently.
 */
export function SplitDecision({
  plan,
  chosen,
  className = "",
}: {
  plan: FulfillmentPlan;
  /** Lines actually allocated — the preview's, or the persisted split's. */
  chosen: FulfillmentLine[];
  className?: string;
}) {
  const rows = useMemo(() => {
    const demands = plan.demands ?? [];
    const totalDemand = demands.reduce((sum, d) => sum + d.qty, 0);

    // What each warehouse could have covered, capped at what the order needs:
    // stock beyond demand is not coverage, it is just stock.
    const byWarehouse = new Map<
      number,
      { id: number; name: string; city: string | null; couldCover: number; allocated: number }
    >();

    for (const a of plan.availability ?? []) {
      const need = demands.find((d) => d.product_id === a.product_id)?.qty ?? 0;
      const row = byWarehouse.get(a.warehouse_id) ?? {
        id: a.warehouse_id,
        name: a.warehouse_name,
        city: a.city ?? null,
        couldCover: 0,
        allocated: 0,
      };
      row.couldCover += Math.min(a.available, need);
      byWarehouse.set(a.warehouse_id, row);
    }

    for (const l of chosen) {
      const row = byWarehouse.get(l.warehouse_id);
      if (row) row.allocated += l.qty;
    }

    return {
      totalDemand,
      list: [...byWarehouse.values()].sort(
        (a, b) => b.allocated - a.allocated || b.couldCover - a.couldCover,
      ),
    };
  }, [plan, chosen]);

  if (rows.list.length === 0) return null;

  const usedCount = rows.list.filter((r) => r.allocated > 0).length;

  return (
    <div className={`rounded-[20px] bg-white p-4 card-shadow sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/6 pb-3">
        <h3 className="text-[14px] font-semibold text-ink">How this split was chosen</h3>
        <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-mist">
          Greedy set cover
        </span>
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
        The engine repeatedly takes the warehouse covering the most outstanding demand for the
        least shipping cost, because every extra warehouse is another shipment. It used{" "}
        <strong className="text-ink">
          {usedCount} of {rows.list.length}
        </strong>{" "}
        candidate{rows.list.length === 1 ? "" : "s"} to cover{" "}
        <strong className="text-ink">{rows.totalDemand} units</strong>
        {plan.estimated_cost ? (
          <>
            {" "}
            at <strong className="text-ink">{inr(plan.estimated_cost)}</strong> estimated freight
          </>
        ) : null}
        .
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[380px] text-left text-[12.5px]">
          <thead className="border-b border-ink/6 text-[11px] font-semibold text-mist">
            <tr>
              <th className="py-2 pr-3">Candidate warehouse</th>
              <th className="py-2 pr-3 text-right">Could cover</th>
              <th className="py-2 pr-3 text-right">Allocated</th>
              <th className="py-2 text-right">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.list.map((r) => {
              const used = r.allocated > 0;
              return (
                <tr key={r.id} className={used ? "" : "text-mist"}>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-ink">{r.name}</span>
                    {r.city ? <span className="ml-1.5 text-[11.5px] text-mist">{r.city}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.couldCover}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink">
                    {r.allocated}
                  </td>
                  <td className="py-2 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        used ? "tone-ok" : "bg-cream text-mist"
                      }`}
                    >
                      {used ? <Check className="size-3" /> : <Minus className="size-3" />}
                      {used ? "Used" : "Not needed"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(plan.backorders ?? []).length > 0 ? (
        <p className="mt-3 border-t border-ink/6 pt-3 text-[12px] text-warn">
          No warehouse could cover{" "}
          {(plan.backorders ?? []).map((b) => `${b.qty} × ${b.product_name}`).join(", ")} — that becomes a
          backorder rather than a shipment.
        </p>
      ) : null}
    </div>
  );
}
