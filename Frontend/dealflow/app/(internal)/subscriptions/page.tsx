"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch } from "@/lib/hooks";
import type { Page, OrderSummary } from "@/lib/types";

export default function SubscriptionsPage() {
  const { data, loading, error, refetch } = useFetch<Page<OrderSummary>>("/v1/orders?limit=100");
  const orders = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Finance &amp; Revenue</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Subscriptions &amp; Recurring Billing
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            Every confirmed order that may carry a one-time invoice, a recurring billing schedule, or both. Open one to manage billing and mid-cycle proration.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-[18px] tone-bad p-4 border border-transparent text-[13px] text-bad font-medium flex flex-wrap items-center justify-between gap-3">
          <span>Failed to load orders: {error.message}</span>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors"
          >
            <RotateCcw className="size-3" /> Retry
          </button>
        </div>
      )}

      {/* Orders Table */}
      <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Order #</th>
              <th className="px-6 py-3.5">Customer</th>
              <th className="px-6 py-3.5">Quotation</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Promised / Confirmed</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-6 py-4" colSpan={6}>
                    <div className="h-4 w-full max-w-md animate-pulse rounded bg-cream" />
                  </td>
                </tr>
              ))}

            {!loading && !error && orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-mist text-[13px]">
                  No orders yet. Confirmed quotations will appear here once billing can be set up.
                </td>
              </tr>
            )}

            {!loading &&
              orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-cream/40 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-ink">
                    <Link href={`/subscriptions/${order.id}`} className="hover:underline">
                      {order.reference}
                    </Link>
                  </td>
                  <td className="px-6 py-4 font-medium text-ink">{order.customer_name}</td>
                  <td className="px-6 py-4 text-mist text-[12.5px]">
                    {order.quotation_reference}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={order.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 text-mist text-[12.5px]">
                    {order.promised_date ?? order.confirmed_at ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/subscriptions/${order.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Manage Billing <ArrowRight className="size-3" />
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
