"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Package, Truck, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, timeAgo } from "@/lib/hooks";

interface OrderSummary {
  id: number;
  reference: string;
  quotation_id: number;
  quotation_reference: string;
  customer_id: number;
  customer_name: string;
  status: string;
  promised_date?: string | null;
  confirmed_at?: string | null;
  created_at: string;
  shipment_count: number;
  backorder_count: number;
}

export default function FulfillmentPage() {
  const { data: res, loading, error } = useFetch<{ data: OrderSummary[] }>("/v1/orders");
  const orders = res?.data ?? [];

  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredOrders = useMemo(() => {
    if (statusFilter === "ALL") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const activeBackordersTotal = orders.reduce((sum, o) => sum + (o.backorder_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Operations &amp; Logistics</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Warehouse Fulfillment &amp; Splits
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            The greedy set-cover heuristic splits confirmed orders across warehouses to minimize freight shipments and handle stock backorders automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeBackordersTotal > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-[12px] font-medium text-amber-900 border border-amber-500/20">
              <AlertCircle className="size-3.5 text-amber-700" />
              {activeBackordersTotal} Backorder lines pending restock
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-800 border border-emerald-500/20">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              All warehouse depots optimal
            </span>
          )}
        </div>
      </div>

      {/* Orders Ledger */}
      <div className="rounded-[24px] bg-white border border-ink/8 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-ink/6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Confirmed Sales Orders</h2>
            <p className="text-[12.5px] text-mist">
              Orders created from confirmed quotations awaiting fulfillment routing.
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-cream/40 p-1 border border-ink/8 text-[12px]">
            {["ALL", "OPEN", "ALLOCATED", "FULFILLED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  statusFilter === st
                    ? "bg-ink text-bone shadow-xs"
                    : "text-mist hover:text-ink"
                }`}
              >
                {st === "ALL" ? `All (${orders.length})` : st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-6 py-3">Order Ref</th>
                <th className="px-6 py-3">Quotation</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Fulfillment Status</th>
                <th className="px-6 py-3">Shipments</th>
                <th className="px-6 py-3">Backorders</th>
                <th className="px-6 py-3">Confirmed Date</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {loading && orders.length === 0 && (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-6 py-4">
                        <div className="h-5 w-full rounded bg-ink/5 animate-pulse" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-cream/40 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4 font-mono font-medium text-ink">
                    <Link href={`/fulfillment/${order.id}`} className="hover:underline">
                      {order.reference}
                    </Link>
                  </td>
                  <td className="px-6 py-4 font-mono text-[12.5px] text-mist">
                    <Link href={`/quotations/${order.quotation_id}`} className="hover:underline text-ink">
                      {order.quotation_reference}
                    </Link>
                  </td>
                  <td className="px-6 py-4 font-medium text-ink">
                    {order.customer_name}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={order.status} size="sm" />
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                      <Truck className="size-3.5 text-mist" />
                      {order.shipment_count > 0 ? `${order.shipment_count} shipments` : "Unsplit"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {order.backorder_count > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 text-[11.5px]">
                        <Package className="size-3" />
                        {order.backorder_count} backordered
                      </span>
                    ) : (
                      <span className="text-[12px] text-emerald-800 font-medium">None (In Stock)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-mist text-[12px]">
                    {timeAgo(order.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/fulfillment/${order.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors shadow-xs"
                    >
                      Open Plan <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}

              {!loading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-mist">
                    <Truck className="size-8 mx-auto mb-2 text-mist opacity-60" />
                    <p className="font-medium text-[14px] text-ink">No sales orders found</p>
                    <p className="text-[12.5px] mt-0.5">
                      Confirm an approved quotation to initialize its warehouse split plan.
                    </p>
                    <Link
                      href="/quotations"
                      className="mt-3 inline-flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-bone"
                    >
                      View Quotations &rarr;
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
