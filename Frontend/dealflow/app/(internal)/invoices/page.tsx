"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, inr } from "@/lib/hooks";
import type { Page, Invoice } from "@/lib/types";

const FILTERS: { id: string; label: string; status?: string }[] = [
  { id: "ALL", label: "All Invoices" },
  { id: "POSTED", label: "Unpaid / Posted", status: "POSTED" },
  { id: "PARTIAL", label: "Partially Paid", status: "PARTIAL" },
  { id: "PAID", label: "Settled / Paid", status: "PAID" },
  { id: "OVERDUE", label: "Overdue", status: "OVERDUE" },
];

export default function InvoicesPage() {
  const [filter, setFilter] = useState("ALL");
  const active = FILTERS.find((f) => f.id === filter);
  const path = active?.status
    ? `/v1/invoices?status=${encodeURIComponent(active.status)}&limit=100`
    : "/v1/invoices?limit=100";

  const { data, loading, error, refetch } = useFetch<Page<Invoice>>(path);
  const invoices = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Billing &amp; Collections</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Invoices &amp; Cash Settlement
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            Track posted invoices, record full or partial payments, and view cash flow reconciled against one-time orders and subscription schedules.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-full bg-white p-1 card-shadow w-fit overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filter === f.id ? "bg-ink text-bone" : "text-mist hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-[18px] tone-bad p-4 border border-transparent text-[13px] text-bad font-medium flex flex-wrap items-center justify-between gap-3">
          <span>Failed to load invoices: {error.message}</span>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors"
          >
            <RotateCcw className="size-3" /> Retry
          </button>
        </div>
      )}

      {/* Invoices Table */}
      <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Invoice #</th>
              <th className="px-6 py-3.5">Order</th>
              <th className="px-6 py-3.5">Customer &amp; Type</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Total Amount</th>
              <th className="px-6 py-3.5">Paid Amount</th>
              <th className="px-6 py-3.5">Due Date</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-6 py-4" colSpan={8}>
                    <div className="h-4 w-full max-w-md animate-pulse rounded bg-cream" />
                  </td>
                </tr>
              ))}

            {!loading && !error && invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-mist text-[13px]">
                  No invoices match this filter.
                </td>
              </tr>
            )}

            {!loading &&
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-cream/40 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 font-medium text-ink">
                    <Link href={`/invoices/${inv.id}`} className="hover:underline">
                      {inv.reference}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-mist text-[12.5px]">
                    {inv.order_reference ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-ink">{inv.customer_name ?? "—"}</p>
                    <p className="text-[11.5px] text-mist">
                      {inv.kind === "ONETIME" ? "One-Time" : "Recurring"}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={inv.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 font-semibold tabular-nums text-ink">
                    {inr(inv.total)}
                  </td>
                  <td className="px-6 py-4 tabular-nums text-ok">{inr(inv.amount_paid)}</td>
                  <td className="px-6 py-4 text-mist text-[12.5px]">{inv.due_date ?? "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      View <ArrowRight className="size-3" />
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
