"use client";

import React, { useState, use, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Warehouse,
  Truck,
  Package,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Layers,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, useMutation, inr } from "@/lib/hooks";

interface FulfillmentLine {
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  product_name: string;
  qty: number;
  shipment_group: number;
}

interface Backorder {
  id?: number;
  product_id: number;
  product_name: string;
  qty: number;
  status?: string;
}

interface SalesOrder {
  id: number;
  reference: string;
  quotation_id: number;
  quotation_reference: string;
  customer_id: number;
  customer_name: string;
  status: string;
  promised_date?: string;
  created_at: string;
  fulfillment?: {
    id: number;
    strategy: string;
    shipment_count: number;
    estimated_cost: string;
    lines: FulfillmentLine[];
  };
  backorders: Backorder[];
}

interface FulfillmentPlan {
  strategy: string;
  shipment_count: number;
  estimated_cost: string;
  allocations: FulfillmentLine[];
  backorders: Backorder[];
}

export default function WarehouseSplitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;

  const {
    data: orderRes,
    loading: orderLoading,
    error: orderError,
    refetch: refetchOrder,
  } = useFetch<{ data: SalesOrder }>(`/v1/orders/${orderId}`);
  const order = orderRes?.data;

  const isFulfilled = !!order?.fulfillment;

  // Suggest plan if not yet fulfilled
  const {
    data: planRes,
    loading: planLoading,
    refetch: refetchPlan,
  } = useFetch<{ data: FulfillmentPlan }>(
    isFulfilled ? null : `/v1/orders/${orderId}/fulfillment/suggest`
  );
  const plan = planRes?.data;

  const { trigger: acceptSplit, loading: accepting } = useMutation();
  const { trigger: consolidate, loading: consolidating } = useMutation();

  const [actionNotice, setActionNotice] = useState<string | null>(null);

  async function handleAcceptSplit() {
    try {
      await acceptSplit(`/v1/orders/${orderId}/fulfillment`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActionNotice("Fulfillment plan accepted and inventory reserved across depots!");
      refetchOrder();
    } catch (e: any) {
      setActionNotice(`Error: ${e.message}`);
    }
  }

  async function handleConsolidate() {
    try {
      await consolidate(`/v1/orders/${orderId}/backorders/consolidate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActionNotice("Open backorders successfully consolidated with newly available stock!");
      refetchOrder();
    } catch (e: any) {
      setActionNotice(`Consolidation check: ${e.message}`);
    }
  }

  const activeLines: FulfillmentLine[] = useMemo(() => {
    if (order?.fulfillment?.lines?.length) return order.fulfillment.lines;
    if (plan?.allocations?.length) return plan.allocations;
    return [];
  }, [order, plan]);

  const activeBackorders: Backorder[] = useMemo(() => {
    if (order?.backorders?.length) return order.backorders;
    if (plan?.backorders?.length) return plan.backorders;
    return [];
  }, [order, plan]);

  // Group lines by warehouse
  const groupedByWarehouse = useMemo(() => {
    const map = new Map<number, { name: string; lines: FulfillmentLine[] }>();
    activeLines.forEach((line) => {
      const entry = map.get(line.warehouse_id) || {
        name: line.warehouse_name,
        lines: [],
      };
      entry.lines.push(line);
      map.set(line.warehouse_id, entry);
    });
    return Array.from(map.entries());
  }, [activeLines]);

  if (orderLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div className="space-y-4">
        <Link
          href="/fulfillment"
          className="inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to Fulfillment
        </Link>
        <div className="rounded-[20px] bg-rose-50 border border-rose-200 p-6 text-center">
          <p className="font-semibold text-rose-900">Failed to load sales order</p>
          <p className="text-[13px] text-rose-700 mt-1">{orderError?.message ?? "Order not found"}</p>
        </div>
      </div>
    );
  }

  const shipmentCount = order.fulfillment?.shipment_count ?? plan?.shipment_count ?? 1;
  const estimatedCost = order.fulfillment?.estimated_cost ?? plan?.estimated_cost ?? "0";
  const strategy = order.fulfillment?.strategy ?? plan?.strategy ?? "GREEDY_SET_COVER";

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
                Fulfillment Plan: {order.reference} ({order.customer_name})
              </h1>
              <StatusBadge
                status={isFulfilled ? "ALLOCATED" : "SUGGESTED"}
                size="sm"
              />
            </div>
            <p className="text-[12.5px] text-mist">
              Quotation:{" "}
              <Link href={`/quotations/${order.quotation_id}`} className="hover:underline font-mono text-ink">
                {order.quotation_reference}
              </Link>{" "}
              {order.promised_date && (
                <>
                  &middot; Promised Delivery:{" "}
                  <strong>{new Date(order.promised_date).toLocaleDateString()}</strong>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/subscriptions/${order.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink shadow-xs hover:bg-cream transition-colors"
          >
            View Billing &rarr;
          </Link>

          {!isFulfilled ? (
            <button
              type="button"
              disabled={accepting}
              onClick={handleAcceptSplit}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-bone hover:bg-ink/90 shadow-xs transition-colors disabled:opacity-50"
            >
              <CheckCircle className="size-3.5" />
              {accepting ? "Reserving Stock..." : "Accept Suggested Split"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 text-white px-4 py-2 text-[13px] font-semibold shadow-xs">
              <CheckCircle className="size-3.5" />
              Split Confirmed &amp; Stock Reserved
            </span>
          )}
        </div>
      </div>

      <LifecycleBar currentStage="FULFILLMENT" quoteId={String(order.quotation_id)} />

      {actionNotice && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium">
          {actionNotice}
        </div>
      )}

      {/* Heuristic Evaluation Callout */}
      <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs flex items-start gap-3">
        <Sparkles className="size-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-[13px] text-ink">
          <p className="font-semibold">
            Heuristic Warehouse Split Decision (Strategy: {strategy})
          </p>
          <p className="mt-0.5 text-mist leading-relaxed">
            The optimization engine analyzed depot inventory and grouped allocations to minimize total dispatch shipments ({shipmentCount} {shipmentCount === 1 ? "shipment" : "shipments"}). Estimated consolidated freight cost: <strong>{inr(estimatedCost)}</strong>.
          </p>
        </div>
      </div>

      {/* Reactive Backorder Stock Notice */}
      {activeBackorders.length > 0 && (
        <div className="rounded-[20px] bg-amber-500/10 p-4 border border-amber-500/25 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Package className="size-5 text-amber-700" />
            <div className="text-[13px]">
              <span className="font-semibold text-amber-950">
                {activeBackorders.length} Open Backorder {activeBackorders.length === 1 ? "Line" : "Lines"}:
              </span>{" "}
              <span className="text-amber-900">
                {activeBackorders.map((b) => `${b.qty}x ${b.product_name}`).join(", ")}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={consolidating}
            onClick={handleConsolidate}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 text-white px-3.5 py-1.5 text-[12px] font-semibold hover:bg-emerald-800 shadow-xs transition-colors disabled:opacity-50"
          >
            {consolidating ? "Checking Stock..." : "Consolidate When Stock Arrives \u2192"}
          </button>
        </div>
      )}

      {/* DISPATCH WAREHOUSE CARDS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {groupedByWarehouse.map(([warehouseId, data], idx) => (
          <div
            key={warehouseId}
            className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                <span className="flex items-center gap-2 font-semibold text-[14px] text-ink">
                  <Warehouse className="size-4 text-ink/70" />
                  {data.name}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Shipment #{idx + 1}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {data.lines.map((line, lIdx) => (
                  <div
                    key={lIdx}
                    className="rounded-[16px] bg-cream/40 p-3 border border-ink/6"
                  >
                    <p className="text-[13px] font-medium text-ink">
                      {line.product_name}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[12px]">
                      <span className="font-mono text-ink font-semibold">
                        Qty: {line.qty} units
                      </span>
                      <span className="text-emerald-700 font-medium">
                        {isFulfilled ? "Reserved" : "Available"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-ink/6 text-[12px] text-mist flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Truck className="size-3.5" /> Direct Freight Dispatch
              </span>
              <span className="font-medium text-ink">
                {data.lines.reduce((acc, l) => acc + l.qty, 0)} items
              </span>
            </div>
          </div>
        ))}

        {groupedByWarehouse.length === 0 && (
          <div className="col-span-3 p-12 text-center text-mist bg-white rounded-[24px] border border-ink/8">
            <Package className="size-8 mx-auto mb-2 text-mist opacity-60" />
            <p className="font-medium text-[14px] text-ink">No physical items to ship</p>
            <p className="text-[12.5px] mt-0.5">
              This order contains only digital/service subscriptions that bypass physical depots.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
