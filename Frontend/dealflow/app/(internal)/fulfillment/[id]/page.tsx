"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Warehouse,
  Truck,
  Package,
  AlertTriangle,
  CheckCircle,
  Sliders,
  Sparkles,
  Layers,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";

export default function WarehouseSplitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id || "SO-9042";

  const [splitAccepted, setSplitAccepted] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [backorderConsolidated, setBackorderConsolidated] = useState(false);
  const [stockArrivalTriggered, setStockArrivalTriggered] = useState(true);

  // Allocations state
  const [mumbaiQty, setMumbaiQty] = useState(8);
  const [eastQty, setEastQty] = useState(2);

  function handleAcceptSplit() {
    setSplitAccepted(true);
  }

  function handleConsolidateBackorder() {
    setBackorderConsolidated(true);
    setStockArrivalTriggered(false);
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/fulfillment"
            className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white shadow-xs hover:bg-cream transition-colors text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[26px] font-medium tracking-tight text-ink sm:text-[30px]">
                Fulfillment Plan: {orderId} (Acme Corp)
              </h1>
              <StatusBadge
                status={splitAccepted ? "ALLOCATED" : "SUGGESTED"}
                size="sm"
              />
            </div>
            <p className="text-[12.5px] text-mist">
              Destination: <strong>Bengaluru Hub, KA</strong> &middot; Promised
              Delivery Date: <strong>Aug 28, 2026</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setOverrideModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink shadow-xs hover:bg-cream transition-colors"
          >
            <Sliders className="size-3.5" />
            Manual Override
          </button>

          <button
            type="button"
            disabled={splitAccepted}
            onClick={handleAcceptSplit}
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-semibold shadow-xs transition-colors ${
              splitAccepted
                ? "bg-emerald-700 text-white cursor-default"
                : "bg-ink text-bone hover:bg-ink/90"
            }`}
          >
            <CheckCircle className="size-3.5" />
            {splitAccepted ? "Split Confirmed & Reserved" : "Accept Suggested Split"}
          </button>
        </div>
      </div>

      <LifecycleBar currentStage="FULFILLMENT" />

      {/* Heuristic Evaluation Callout */}
      <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs flex items-start gap-3">
        <Sparkles className="size-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-[13px] text-ink">
          <p className="font-semibold">
            Heuristic Warehouse Split Decision (Objective: Fewest Shipments)
          </p>
          <p className="mt-0.5 text-mist leading-relaxed">
            Main Warehouse in Mumbai holds 8 of the 10 requested Laptop units. East Depot in Kolkata holds remaining stock. The split engine allocated 8 units to Mumbai and 2 to Kolkata, tie-breaking by lowest freight cost weight (1.0 vs 1.4). Total shipments minimized to <strong>2 packages</strong>.
          </p>
        </div>
      </div>

      {/* Reactive Backorder Stock Arrival Notification (Spec B6) */}
      {stockArrivalTriggered && !backorderConsolidated && (
        <div className="rounded-[20px] bg-emerald-500/10 p-4 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Package className="size-5 text-emerald-700" />
            <div className="text-[13px]">
              <span className="font-semibold text-emerald-950">
                New Stock Received Mid-Fulfillment:
              </span>{" "}
              <span className="text-emerald-900">
                5 units of <em>Docking Station Ultra Dual-4K</em> just arrived at Main Warehouse (Mumbai).
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConsolidateBackorder}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 text-white px-3.5 py-1.5 text-[12px] font-semibold hover:bg-emerald-800 shadow-xs transition-colors"
          >
            Consolidate Remaining Backorder &rarr;
          </button>
        </div>
      )}

      {backorderConsolidated && (
        <div className="rounded-[18px] bg-emerald-100/80 p-3.5 border border-emerald-300 text-[12.5px] text-emerald-950 font-medium flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-700" />
          Backorder consolidated! All docking station units merged into Shipment 1 (Main Warehouse). Total freight cost saved: ₹1,400.
        </div>
      )}

      {/* THREE DISPATCH CARDS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Shipment 1: Main Warehouse */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="flex items-center gap-2 font-semibold text-[14px] text-ink">
                <Warehouse className="size-4 text-ink/70" />
                Main Warehouse
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Mumbai Depot
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[16px] bg-cream/40 p-3 border border-ink/6">
                <p className="text-[13px] font-medium text-ink">
                  Laptop Pro 16&quot;
                </p>
                <div className="mt-1 flex items-center justify-between text-[12px]">
                  <span className="font-mono text-ink font-semibold">
                    Qty: {mumbaiQty} units
                  </span>
                  <span className="text-emerald-700 font-medium">In Stock</span>
                </div>
              </div>

              {backorderConsolidated && (
                <div className="rounded-[16px] bg-emerald-50/70 p-3 border border-emerald-200">
                  <p className="text-[13px] font-medium text-ink">
                    Docking Station Ultra Dual-4K
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[12px]">
                    <span className="font-mono text-emerald-900 font-semibold">
                      Qty: 5 units (Merged)
                    </span>
                    <span className="text-emerald-800 font-medium">Stock Arrived</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between text-[12px] text-mist">
            <span className="flex items-center gap-1">
              <Truck className="size-3.5" /> Shipment #1
            </span>
            <span className="font-mono font-semibold text-ink">
              Est. Freight: ₹3,200
            </span>
          </div>
        </div>

        {/* Shipment 2: East Depot */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="flex items-center gap-2 font-semibold text-[14px] text-ink">
                <Warehouse className="size-4 text-ink/70" />
                East Depot
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                Kolkata Depot
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[16px] bg-cream/40 p-3 border border-ink/6">
                <p className="text-[13px] font-medium text-ink">
                  Laptop Pro 16&quot;
                </p>
                <div className="mt-1 flex items-center justify-between text-[12px]">
                  <span className="font-mono text-ink font-semibold">
                    Qty: {eastQty} units
                  </span>
                  <span className="text-blue-700 font-medium">In Stock</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between text-[12px] text-mist">
            <span className="flex items-center gap-1">
              <Truck className="size-3.5" /> Shipment #2
            </span>
            <span className="font-mono font-semibold text-ink">
              Est. Freight: ₹2,800
            </span>
          </div>
        </div>

        {/* Shipment 3: Backorder Queue */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="flex items-center gap-2 font-semibold text-[14px] text-ink">
                <Layers className="size-4 text-ink/70" />
                Backorder Queue
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                {backorderConsolidated ? "Zero Pending" : "1 Item Shortfall"}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {!backorderConsolidated ? (
                <div className="rounded-[16px] bg-rose-50/50 p-3 border border-rose-200">
                  <p className="text-[13px] font-medium text-ink">
                    Docking Station Ultra Dual-4K
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[12px]">
                    <span className="font-mono text-rose-900 font-semibold">
                      Qty: 5 units
                    </span>
                    <span className="text-rose-700 font-medium">
                      Est. Restock: Aug 26
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-[16px] bg-cream/30 p-4 text-center text-[12px] text-mist">
                  All backorder lines resolved and consolidated into warehouse pickings.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between text-[12px] text-mist">
            <span>Network Stock Status</span>
            <span className="font-semibold text-ink">
              {backorderConsolidated ? "100% Ready" : "Partially Ready (80%)"}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl border border-ink/10">
            <h3 className="text-[18px] font-semibold text-ink">
              Manual Warehouse Allocation Override
            </h3>
            <p className="text-[13px] text-mist mt-1">
              Adjust quantities allocated to specific warehouses. The heuristic cost engine will re-evaluate freight charges.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[12.5px] font-medium text-ink block mb-1">
                  Main Warehouse (Mumbai Depot) — Laptop Qty
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={mumbaiQty}
                  onChange={(e) => setMumbaiQty(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-ink/15 p-2.5 font-mono text-[13.5px] font-semibold"
                />
              </div>

              <div>
                <label className="text-[12.5px] font-medium text-ink block mb-1">
                  East Depot (Kolkata Depot) — Laptop Qty
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={eastQty}
                  onChange={(e) => setEastQty(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-ink/15 p-2.5 font-mono text-[13.5px] font-semibold"
                />
              </div>

              <div className="rounded-xl bg-amber-500/10 p-3 text-[12px] text-amber-950 border border-amber-500/20">
                <strong>Cost Consequence:</strong> Overriding the automatic split preserves manual quantities, but may increase total freight charges by up to <strong>₹1,800</strong>.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/8">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-mist hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverrideModalOpen(false);
                  setSplitAccepted(true);
                }}
                className="rounded-full bg-ink text-bone px-5 py-2 text-[13px] font-semibold hover:bg-ink/90"
              >
                Apply Override Allocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
