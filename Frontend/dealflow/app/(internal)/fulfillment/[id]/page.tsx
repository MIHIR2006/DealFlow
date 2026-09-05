"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Warehouse,
  Truck,
  Package,
  CheckCircle,
  Sliders,
  Sparkles,
  Layers,
  Building2,
  MoveRight,
} from "lucide-react";
import { LifecycleBar, type DealStage } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { OrderApi, ApiError } from "@/lib/api";
import { inr, useAuth } from "@/lib/hooks";
import { OverrideDialog } from "@/components/workspace/override-dialog";
import { ShipmentMap } from "@/components/workspace/shipment-map";
import { SplitDecision } from "@/components/workspace/split-decision";
import type {
  SalesOrder,
  FulfillmentPlan,
  FulfillmentLine,
  FulfillmentOverride,
  Backorder,
} from "@/lib/types";

const STAGE_BY_STATUS: Record<string, DealStage> = {
  CONFIRMED: "FULFILLMENT",
  PARTIALLY_FULFILLED: "FULFILLMENT",
  BACKORDERED: "FULFILLMENT",
  FULFILLED: "BILLING",
};

function groupByShipment(lines: FulfillmentLine[]): Map<number, FulfillmentLine[]> {
  const groups = new Map<number, FulfillmentLine[]>();
  for (const line of lines) {
    const list = groups.get(line.shipment_group) ?? [];
    list.push(line);
    groups.set(line.shipment_group, list);
  }
  return new Map([...groups.entries()].sort((a, b) => a[0] - b[0]));
}

export default function WarehouseSplitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = use(params);
  const orderId = Number(idParam);

  // Warehouse splits and backorder decisions belong to Finance & Operations
  // (a manager may override too). A rep opens this screen to track progress,
  // which is what their role calls for, and sees no decision controls.
  const { user } = useAuth();
  const canDecideFulfillment =
    user?.role === "FINANCE" || user?.role === "MANAGER" || user?.role === "ADMIN";

  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const [plan, setPlan] = useState<FulfillmentPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const o = await OrderApi.get(orderId);
      setOrder(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const p = await OrderApi.suggestFulfillment(orderId);
      setPlan(p);
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : "Could not compute a suggested split.");
    } finally {
      setPlanLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (order && !order.fulfillment) {
      loadPlan();
    }
  }, [order, loadPlan]);

  async function acceptSplit(overrides?: FulfillmentOverride[]) {
    setBusy(true);
    setError(null);
    try {
      const o = await OrderApi.acceptFulfillment(orderId, overrides);
      setOrder(o);
      setPlan(null);
      setOverrideOpen(false);
      setNotice(
        overrides && overrides.length > 0
          ? "Manual split applied and stock reserved."
          : "Split confirmed and stock reserved.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept this split.");
    } finally {
      setBusy(false);
    }
  }

  async function consolidateBackorders() {
    setBusy(true);
    setError(null);
    try {
      const o = await OrderApi.consolidateBackorders(orderId);
      setOrder(o);
      setNotice("Backorders consolidated against newly available stock.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not consolidate backorders.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-[480px] py-16 text-center">
        <p className="text-[14px] font-medium text-rose-800">{error ?? "Order not found."}</p>
        <Link href="/fulfillment" className="mt-3 inline-block text-[13px] text-ink underline">
          Back to fulfillment
        </Link>
      </div>
    );
  }

  const persisted = order.fulfillment;
  const isPreview = !persisted;
  const displayLines: FulfillmentLine[] = persisted?.lines ?? plan?.allocations ?? [];
  const shipmentGroups = groupByShipment(displayLines);
  const shipmentCount = persisted?.shipment_count ?? plan?.shipment_count ?? 0;
  const estimatedCost = persisted?.estimated_cost ?? plan?.estimated_cost ?? null;
  // Before the split is accepted the shortfall lives on the preview; after it,
  // on the order. Reading only the persisted list meant a preview that would
  // clearly backorder stock announced "Zero Pending" right up until the moment
  // someone accepted it, which is the one point at which the shortfall still
  // could have been avoided.
  // A projected backorder has no persisted row yet, so it carries no id.
  // Negative synthetic ids keep React keys unique without pretending these
  // are rows that exist.
  const previewBackorders: Backorder[] = (plan?.backorders ?? []).map((b, i) => ({
    ...b,
    id: -(i + 1),
    status: b.status || "PROJECTED",
  }));
  const openBackorders: Backorder[] = isPreview ? previewBackorders : (order.backorders ?? []);
  const hasOpenBackorders = openBackorders.length > 0;

  // Consolidation reconciles a *persisted* backorder against stock that has
  // since arrived. There is nothing to consolidate against a preview.
  const canConsolidate = !isPreview && hasOpenBackorders;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/fulfillment"
            className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-cream transition-colors text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[26px] font-medium tracking-tight text-ink sm:text-[30px]">
                Fulfillment Plan: {order.reference} ({order.customer_name})
              </h1>
              <StatusBadge status={order.status} size="sm" />
            </div>
            <p className="text-[12.5px] text-mist">
              Quote: <strong>{order.quotation_reference}</strong>
              {order.promised_date ? (
                <>
                  {" "}
                  &middot; Promised Delivery Date:{" "}
                  <strong>{new Date(order.promised_date).toLocaleDateString()}</strong>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {canDecideFulfillment && isPreview ? (
            <button
              type="button"
              disabled={busy || planLoading || !plan}
              onClick={() => setOverrideOpen(true)}
              title="Choose the warehouses yourself instead of taking the engine's split"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sliders className="size-3.5" />
              Manual Override
            </button>
          ) : null}

          {!isPreview ? (
            <span className="inline-flex items-center gap-1.5 rounded-full fill-ok px-5 py-2 text-[13px] font-semibold text-white">
              <CheckCircle className="size-3.5" />
              Split Confirmed &amp; Reserved
            </span>
          ) : canDecideFulfillment ? (
            <button
              type="button"
              disabled={busy || planLoading || !plan}
              onClick={() => acceptSplit()}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="size-3.5" />
              {busy ? "Accepting…" : "Accept Suggested Split"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-medium text-mist">
              Awaiting Finance &amp; Operations
            </span>
          )}
        </div>
      </div>

      <LifecycleBar currentStage={STAGE_BY_STATUS[order.status] ?? "FULFILLMENT"} />

      {error ? (
        <div className="rounded-[16px] tone-bad p-3 text-[12.5px] text-bad">{error}</div>
      ) : null}

      {notice ? (
        <div className="rounded-[18px] tone-ok p-3.5 text-[12.5px] font-medium flex items-center gap-2">
          <CheckCircle className="size-4 text-ok" />
          {notice}
        </div>
      ) : null}

      {/* Heuristic / Persisted Evaluation Callout */}
      <div className="rounded-[20px] bg-white p-5 card-shadow flex items-start gap-3">
        <Sparkles className="size-5 text-ok shrink-0 mt-0.5" />
        <div className="text-[13px] text-ink">
          <p className="font-semibold">
            {isPreview
              ? "Suggested Warehouse Split (preview — not yet applied)"
              : "Confirmed Warehouse Split"}
          </p>
          {planLoading ? (
            <p className="mt-0.5 text-mist">Computing the suggested split&hellip;</p>
          ) : planError && isPreview ? (
            <p className="mt-0.5 text-bad">{planError}</p>
          ) : (
            <p className="mt-0.5 text-mist leading-relaxed">
              Strategy <strong>{(persisted?.strategy ?? plan?.strategy) || "—"}</strong> across{" "}
              <strong>{shipmentCount} shipment{shipmentCount === 1 ? "" : "s"}</strong>
              {estimatedCost ? (
                <>
                  {" "}
                  at an estimated freight cost of <strong>{inr(estimatedCost)}</strong>
                </>
              ) : null}
              {isPreview
                ? ". This is a live preview from the split engine — accept it to reserve stock."
                : ". This split has been accepted and stock has been reserved."}
            </p>
          )}
        </div>
      </div>

      {/* Consolidate Remaining Backorder prompt */}
      {canConsolidate && (
        <div className="rounded-[20px] tone-warn p-4 border border-transparent flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Package className="size-5 text-warn" />
            <div className="text-[13px]">
              <span className="font-semibold text-warn">Open backorder on this order:</span>{" "}
              <span className="text-warn">
                {openBackorders.length} line{openBackorders.length === 1 ? "" : "s"} awaiting stock.
                If new stock has arrived, consolidate it into this order&apos;s shipments.
              </span>
            </div>
          </div>

          {canDecideFulfillment ? (
            <button
              type="button"
              disabled={busy}
              onClick={consolidateBackorders}
              className="inline-flex items-center gap-1.5 rounded-full fill-warn text-white px-3.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50"
            >
              {busy ? "Consolidating…" : "Consolidate Remaining Backorder →"}
            </button>
          ) : null}
        </div>
      )}

      {/* Where the goods move, and why the engine routed them that way. */}
      {displayLines.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ShipmentMap lines={displayLines} destination={order.destination} />
          {plan ? <SplitDecision plan={plan} chosen={displayLines} /> : null}
        </div>
      ) : null}

      {/* SHIPMENT CARDS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[...shipmentGroups.entries()].map(([group, lines]) => (
          <div
            key={group}
            className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                <span className="flex items-center gap-2 font-semibold text-[14px] text-ink">
                  <Warehouse className="size-4 text-ink/70" />
                  {lines[0]?.warehouse_name ?? "Warehouse"}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tone-ok text-ok border border-transparent">
                  Shipment #{group}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {lines.map((line, idx) => (
                  <div
                    key={`${line.product_id}-${idx}`}
                    className="rounded-[16px] bg-cream/40 p-3 border border-ink/6"
                  >
                    <p className="text-[13px] font-medium text-ink">{line.product_name}</p>
                    <div className="mt-1 flex items-center justify-between text-[12px]">
                      <span className="text-ink font-semibold">Qty: {line.qty} units</span>
                      <span className="text-mist font-medium">{line.warehouse_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Where this shipment starts and where it ends. The split engine
                decides the origin, and every shipment on an order goes to the
                one customer who placed it — stating both is what turns a list
                of warehouse rows into a movement someone can follow. */}
            <div className="mt-6 border-t border-ink/6 pt-4">
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-cream/60 px-2.5 py-1">
                  <Warehouse className="size-3 shrink-0 text-mist" />
                  <span className="truncate font-medium text-ink">
                    {lines[0]?.warehouse_name ?? "Warehouse"}
                  </span>
                </span>
                <MoveRight className="size-3.5 shrink-0 text-mist" />
                <span className="flex min-w-0 items-center gap-1.5 rounded-full tone-ok px-2.5 py-1">
                  <Building2 className="size-3 shrink-0" />
                  <span className="truncate font-medium">{order.customer_name}</span>
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-[12px] text-mist">
                <span className="flex items-center gap-1">
                  <Truck className="size-3.5" /> Shipment #{group}
                </span>
                <span className="font-medium text-ink">
                  {lines.reduce((sum, l) => sum + l.qty, 0)} units total
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Backorder Queue card */}
        <div className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="flex items-center gap-2 font-semibold text-[14px] text-ink">
                <Layers className="size-4 text-ink/70" />
                Backorder Queue
              </span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border border-transparent ${
                  hasOpenBackorders ? "tone-bad text-bad" : "tone-ok text-ok"
                }`}
              >
                {hasOpenBackorders
                  ? `${openBackorders.length} Item${openBackorders.length === 1 ? "" : "s"} Shortfall`
                  : isPreview
                    ? "Fully Covered"
                    : "Zero Pending"}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {hasOpenBackorders ? (
                openBackorders.map((b) => (
                  <div key={b.id} className="rounded-[16px] tone-bad p-3 border border-transparent">
                    <p className="text-[13px] font-medium text-ink">{b.product_name}</p>
                    <div className="mt-1 flex items-center justify-between text-[12px]">
                      <span className="text-bad font-semibold">Qty: {b.qty}</span>
                      <span className="text-bad font-medium">{b.status}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[16px] bg-cream/30 p-4 text-center text-[12px] text-mist">
                  {isPreview
                    ? "Every line on this order is covered by available stock."
                    : "All backorder lines resolved and consolidated into warehouse pickings."}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between text-[12px] text-mist">
            <span>{isPreview ? "Projected on accept" : "Backorder Status"}</span>
            <span className="font-semibold text-ink">
              {hasOpenBackorders
                ? `${openBackorders.reduce((sum, b) => sum + b.qty, 0)} units short`
                : "100% Ready"}
            </span>
          </div>
        </div>

        {shipmentGroups.size === 0 ? (
          <div className="rounded-[24px] bg-white p-6 card-shadow text-[13px] text-mist md:col-span-2">
            {planLoading
              ? "Computing the suggested split…"
              : isPreview
                ? "No split has been suggested yet."
                : "This order has no allocated shipment lines."}
          </div>
        ) : null}
      </div>

      {overrideOpen && plan ? (
        <OverrideDialog
          plan={plan}
          busy={busy}
          onCancel={() => setOverrideOpen(false)}
          onApply={(overrides) => acceptSplit(overrides)}
        />
      ) : null}
    </div>
  );
}
