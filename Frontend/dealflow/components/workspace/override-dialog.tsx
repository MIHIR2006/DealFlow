"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Warehouse, X } from "lucide-react";
import type { FulfillmentOverride, FulfillmentPlan } from "@/lib/types";

/**
 * Manual override of the suggested warehouse split.
 *
 * The engine minimises shipments; a human sometimes knows better — a depot is
 * closing, a customer wants everything in one box, a warehouse is holding stock
 * for a different order. This is where that judgement is entered.
 *
 * Everything here comes from the same read the engine planned against: the
 * order's demand, and what each warehouse can actually contribute. The dialog
 * refuses to submit an allocation the server would reject, so a reviewer is
 * corrected while they are still deciding rather than after they commit.
 * The server re-checks under lock regardless — this is guidance, not the
 * boundary.
 */
export function OverrideDialog({
  plan,
  busy,
  onCancel,
  onApply,
}: {
  plan: FulfillmentPlan;
  busy: boolean;
  onCancel: () => void;
  onApply: (overrides: FulfillmentOverride[]) => void;
}) {
  // Seeded from the engine's own suggestion, so a reviewer adjusts a real
  // starting point rather than filling an empty grid.
  const [alloc, setAlloc] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const a of plan.allocations) seed[`${a.product_id}:${a.warehouse_id}`] = a.qty;
    return seed;
  });

  // The suggest response does not always carry demand and stock; without them
  // there is nothing to override, and the dialog says so rather than throwing.
  const demands = useMemo(() => plan.demands ?? [], [plan.demands]);

  const warehouses = useMemo(() => {
    const seen = new Map<number, string>();
    for (const a of plan.availability ?? []) seen.set(a.warehouse_id, a.warehouse_name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [plan.availability]);

  const availableFor = (productId: number, warehouseId: number) =>
    (plan.availability ?? []).find(
      (a) => a.product_id === productId && a.warehouse_id === warehouseId,
    )?.available ?? 0;

  const qtyFor = (productId: number, warehouseId: number) => alloc[`${productId}:${warehouseId}`] ?? 0;

  const allocatedFor = (productId: number) =>
    warehouses.reduce((sum, w) => sum + qtyFor(productId, w.id), 0);

  function setQty(productId: number, warehouseId: number, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setAlloc((prev) => ({ ...prev, [`${productId}:${warehouseId}`]: n }));
  }

  // The two things the server rejects, checked here so they are visible first.
  const problems = useMemo(() => {
    const out: string[] = [];
    for (const d of demands) {
      if (allocatedFor(d.product_id) > d.qty) {
        out.push(`${d.product_name}: allocating more than the order needs (${d.qty}).`);
      }
      for (const w of warehouses) {
        const q = qtyFor(d.product_id, w.id);
        if (q > availableFor(d.product_id, w.id)) {
          out.push(`${w.name} cannot cover ${q} × ${d.product_name}.`);
        }
      }
    }
    return out;
  }, [alloc, demands, warehouses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Anything left unallocated becomes a backorder — stated plainly, because it
  // is a real consequence of the split being chosen here.
  const shortfalls = demands
    .map((d) => ({ name: d.product_name, short: d.qty - allocatedFor(d.product_id) }))
    .filter((s) => s.short > 0);

  const overrides: FulfillmentOverride[] = demands.flatMap((d) =>
    warehouses
      .map((w) => ({ product_id: d.product_id, warehouse_id: w.id, qty: qtyFor(d.product_id, w.id) }))
      .filter((o) => o.qty > 0),
  );

  const blocked = problems.length > 0 || overrides.length === 0 || busy;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs p-3 sm:items-center sm:p-4">
      <div className="flex max-h-[min(680px,calc(100svh-1.5rem))] w-full max-w-2xl flex-col rounded-[24px] border border-ink/10 bg-white shadow-2xl sm:max-h-[min(680px,calc(100svh-2rem))]">
        <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <h3 className="text-[17px] font-semibold text-ink">Manual override</h3>
            <p className="mt-0.5 text-[12.5px] text-mist">
              Set how much of each product ships from each warehouse. Anything left over becomes a
              backorder.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-mist transition-colors hover:text-ink"
            title="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {demands.map((d) => {
            const allocated = allocatedFor(d.product_id);
            const over = allocated > d.qty;
            return (
              <div key={d.product_id} className="rounded-[18px] border border-ink/8 bg-cream/30 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/6 pb-2.5">
                  <span className="text-[13.5px] font-semibold text-ink">{d.product_name}</span>
                  <span className="text-[12px] tabular-nums text-mist">
                    allocated{" "}
                    <strong className={over ? "text-bad" : "text-ink"}>{allocated}</strong> of {d.qty}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {warehouses.map((w) => {
                    const available = availableFor(d.product_id, w.id);
                    const q = qtyFor(d.product_id, w.id);
                    const tooMuch = q > available;
                    return (
                      <div key={w.id} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink">
                          <Warehouse className="size-3.5 shrink-0 text-mist" />
                          <span className="truncate">{w.name}</span>
                          <span className="shrink-0 text-[11.5px] text-mist">
                            ({available} available)
                          </span>
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={available}
                          value={q}
                          disabled={busy || available === 0}
                          onChange={(e) => setQty(d.product_id, w.id, e.target.value)}
                          className={`w-20 shrink-0 rounded-full border bg-white px-3 py-1 text-right text-[12.5px] tabular-nums focus:outline-hidden disabled:opacity-40 ${
                            tooMuch ? "border-bad text-bad" : "border-ink/15 text-ink"
                          }`}
                        />
                      </div>
                    );
                  })}
                  {warehouses.length === 0 ? (
                    <p className="text-[12px] text-mist">No warehouse currently holds this product.</p>
                  ) : null}
                </div>
              </div>
            );
          })}

          {demands.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-mist">
              This plan did not come back with the per-product demand and stock the override
              needs. Accept the suggested split instead.
            </p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-ink/8 px-5 py-4 sm:px-6">
          {problems.length > 0 ? (
            <div className="rounded-[14px] tone-bad p-3 text-[12px] text-bad">
              {problems.map((msg) => (
                <p key={msg} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {msg}
                </p>
              ))}
            </div>
          ) : shortfalls.length > 0 ? (
            <div className="rounded-[14px] tone-warn p-3 text-[12px] text-warn">
              Will create a backorder for{" "}
              {shortfalls.map((s) => `${s.short} × ${s.name}`).join(", ")}.
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2.5 text-[13px] font-medium text-mist hover:text-ink sm:py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => onApply(overrides)}
              className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-bone transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40 sm:py-2"
            >
              {busy ? "Applying…" : "Apply override & reserve stock"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
