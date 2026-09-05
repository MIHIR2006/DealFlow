"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Repeat, Calendar, ArrowRight, CheckCircle2, DollarSign } from "lucide-react";
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
  created_at: string;
}

export default function SubscriptionsPage() {
  const { data: res, loading } = useFetch<{ data: OrderSummary[] }>("/v1/orders");
  const orders = res?.data ?? [];

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
            Reconcile one-time hardware purchases alongside ongoing recurring SaaS/support contracts with automated day-count proration on mid-cycle changes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full border border-ink/10 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-xs">
            Billing Engine: <span className="text-emerald-800">Automated Day-Count (30/360)</span>
          </div>
        </div>
      </div>

      {/* Subscription Contracts Table */}
      <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
        <div className="px-6 py-4 border-b border-ink/6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Active Recurring Contracts</h2>
            <p className="text-[12.5px] text-mist">
              Click any order to inspect hybrid billing, upcoming invoice schedules, and perform seat prorations.
            </p>
          </div>
        </div>

        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Order Reference</th>
              <th className="px-6 py-3.5">Customer</th>
              <th className="px-6 py-3.5">Quotation Ref</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Contract Age</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {loading && orders.length === 0 && (
              <>
                {[1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-4">
                      <div className="h-5 w-full rounded bg-ink/5 animate-pulse" />
                    </td>
                  </tr>
                ))}
              </>
            )}

            {orders.map((sub) => (
              <tr
                key={sub.id}
                className="hover:bg-cream/40 transition-colors group cursor-pointer"
              >
                <td className="px-6 py-4 font-mono font-medium text-ink">
                  <Link href={`/subscriptions/${sub.id}`} className="hover:underline">
                    {sub.reference}
                  </Link>
                </td>
                <td className="px-6 py-4 font-semibold text-ink">
                  {sub.customer_name}
                </td>
                <td className="px-6 py-4 font-mono text-[12.5px] text-mist">
                  <Link href={`/quotations/${sub.quotation_id}`} className="hover:underline text-ink">
                    {sub.quotation_reference}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={sub.status} size="sm" />
                </td>
                <td className="px-6 py-4 text-mist text-[12.5px]">
                  {timeAgo(sub.created_at)}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/subscriptions/${sub.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 shadow-xs transition-colors"
                  >
                    Manage Billing <ArrowRight className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}

            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-mist">
                  <Repeat className="size-8 mx-auto mb-2 text-mist opacity-60" />
                  <p className="font-medium text-[14px] text-ink">No billing contracts open</p>
                  <p className="text-[12.5px] mt-0.5">
                    Confirm a quotation to initialize its hybrid billing track.
                  </p>
                  <Link
                    href="/quotations"
                    className="mt-3 inline-flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-bone"
                  >
                    View Deals &rarr;
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
