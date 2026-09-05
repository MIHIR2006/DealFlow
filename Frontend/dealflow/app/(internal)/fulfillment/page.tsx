"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Package, Truck, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

const ORDERS = [
  {
    id: "SO-9042",
    quoteRef: "Q-1042",
    customer: "Acme Corp",
    destination: "Bengaluru, KA",
    lineCount: 3,
    status: "SUGGESTED",
    shipmentCount: 2,
    backorderCount: 1,
    date: "Aug 22",
  },
  {
    id: "SO-9038",
    quoteRef: "Q-1031",
    customer: "Beta Industries",
    destination: "Mumbai, MH",
    lineCount: 2,
    status: "FULFILLED",
    shipmentCount: 1,
    backorderCount: 0,
    date: "Aug 21",
  },
  {
    id: "SO-9031",
    quoteRef: "Q-1018",
    customer: "Northwind Trading",
    destination: "Delhi, DL",
    lineCount: 4,
    status: "BACKORDERED",
    shipmentCount: 1,
    backorderCount: 3,
    date: "Aug 20",
  },
];

export default function FulfillmentPage() {
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-800 border border-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Stock Synchronized: 3 Depots Live
          </span>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Order #</th>
              <th className="px-6 py-3.5">Quote Ref</th>
              <th className="px-6 py-3.5">Customer &amp; City</th>
              <th className="px-6 py-3.5">Fulfillment Status</th>
              <th className="px-6 py-3.5">Shipments</th>
              <th className="px-6 py-3.5">Backorders</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {ORDERS.map((ord) => (
              <tr
                key={ord.id}
                className="hover:bg-cream/40 transition-colors group cursor-pointer"
              >
                <td className="px-6 py-4 font-mono font-medium text-ink">
                  <Link href={`/fulfillment/${ord.id}`} className="hover:underline">
                    {ord.id}
                  </Link>
                </td>
                <td className="px-6 py-4 font-mono text-mist text-[12.5px]">
                  {ord.quoteRef}
                </td>
                <td className="px-6 py-4">
                  <p className="font-medium text-ink">{ord.customer}</p>
                  <p className="text-[11.5px] text-mist">{ord.destination}</p>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={ord.status} size="sm" />
                </td>
                <td className="px-6 py-4 font-mono text-[13px] text-ink font-semibold">
                  {ord.shipmentCount} {ord.shipmentCount === 1 ? "depot" : "depots"}
                </td>
                <td className="px-6 py-4">
                  {ord.backorderCount > 0 ? (
                    <span className="text-[12px] font-semibold text-rose-700 font-mono">
                      {ord.backorderCount} line backordered
                    </span>
                  ) : (
                    <span className="text-[12px] text-emerald-700 font-medium">
                      Zero backorder
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/fulfillment/${ord.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 shadow-xs transition-colors"
                  >
                    Manage Split <ArrowRight className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
