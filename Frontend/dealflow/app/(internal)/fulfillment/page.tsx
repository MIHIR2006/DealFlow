"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch } from "@/lib/hooks";
import type { OrderSummary, Page } from "@/lib/types";

export default function FulfillmentPage() {
  const { data, loading, error } = useFetch<Page<OrderSummary>>("/v1/orders?limit=100");
  const orders = data?.data ?? [];

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
      </div>

      {error ? (
        <div className="rounded-[16px] tone-bad p-3 text-[12.5px] text-bad">{error.message}</div>
      ) : null}

      {/* Orders Table */}
      <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
        <table className="stack-table w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Order #</th>
              <th className="px-6 py-3.5">Quote Ref</th>
              <th className="px-6 py-3.5">Customer</th>
              <th className="px-6 py-3.5">Fulfillment Status</th>
              <th className="px-6 py-3.5">Shipments</th>
              <th className="px-6 py-3.5">Backorders</th>
              <th className="px-6 py-3.5">Promised Date</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-mist">
                  Loading&hellip;
                </td>
              </tr>
            ) : (
              orders.map((ord) => (
                <tr
                  key={ord.id}
                  className="hover:bg-cream/40 transition-colors group cursor-pointer"
                >
                  <td data-stack="primary" className="px-6 py-4 font-medium text-ink">
                    <Link href={`/fulfillment/${ord.id}`} className="hover:underline">
                      {ord.reference}
                    </Link>
                  </td>
                  <td data-label="Quote ref" className="px-6 py-4 text-mist text-[12.5px]">
                    {ord.quotation_reference}
                  </td>
                  <td data-label="Customer" className="px-6 py-4">
                    <p className="font-medium text-ink">{ord.customer_name}</p>
                  </td>
                  <td data-label="Fulfillment" className="px-6 py-4">
                    <StatusBadge status={ord.status} size="sm" />
                  </td>
                  <td data-label="Shipments" className="px-6 py-4 text-[13px] text-ink font-semibold">
                    {ord.shipment_count} {ord.shipment_count === 1 ? "depot" : "depots"}
                  </td>
                  <td data-label="Backorders" className="px-6 py-4">
                    {ord.backorder_count > 0 ? (
                      <span className="inline-flex items-center rounded-full tone-bad px-2 py-0.5 text-[12px] font-semibold text-bad">
                        {ord.backorder_count} line{ord.backorder_count === 1 ? "" : "s"} backordered
                      </span>
                    ) : (
                      <span className="text-[12px] text-ok font-medium">
                        Zero backorder
                      </span>
                    )}
                  </td>
                  <td data-label="Promised date" className="px-6 py-4 text-[12.5px] text-mist">
                    {ord.promised_date ? new Date(ord.promised_date).toLocaleDateString() : "—"}
                  </td>
                  <td data-stack="action" className="px-6 py-4 text-right">
                    <Link
                      href={`/fulfillment/${ord.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors"
                    >
                      Manage Split <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}

            {!loading && orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-mist">
                  No confirmed orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
