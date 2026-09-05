"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CreditCard, DollarSign, ArrowRight, CheckCircle, Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

const INVOICES = [
  {
    id: "INV-9042-OT",
    orderRef: "SO-9042",
    customer: "Acme Corp",
    type: "One-Time Hardware & Service",
    grandTotal: "₹4,85,000",
    paidAmount: "₹2,50,000",
    balanceDue: "₹2,35,000",
    dueDate: "Sep 15, 2026",
    status: "PARTIAL",
  },
  {
    id: "INV-9042-SUB-1",
    orderRef: "SO-9042",
    customer: "Acme Corp",
    type: "Subscription Period 1 (Monthly)",
    grandTotal: "₹59,000",
    paidAmount: "₹59,000",
    balanceDue: "₹0",
    dueDate: "Aug 22, 2026",
    status: "PAID",
  },
  {
    id: "INV-9038-OT",
    orderRef: "SO-9038",
    customer: "Beta Industries",
    type: "One-Time Hardware",
    grandTotal: "₹2,40,000",
    paidAmount: "₹2,40,000",
    balanceDue: "₹0",
    dueDate: "Aug 20, 2026",
    status: "PAID",
  },
  {
    id: "INV-9031-OT",
    orderRef: "SO-9031",
    customer: "Northwind Trading",
    type: "One-Time Service",
    grandTotal: "₹1,10,000",
    paidAmount: "₹0",
    balanceDue: "₹1,10,000",
    dueDate: "Sep 01, 2026",
    status: "POSTED",
  },
];

export default function InvoicesPage() {
  const [filter, setFilter] = useState("ALL");

  const filteredInvoices = INVOICES.filter((inv) => {
    if (filter === "ALL") return true;
    return inv.status === filter;
  });

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

        {/* Financial Summary */}
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink">
            Outstanding AR: <span className="text-warn">₹3,45,000</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-full bg-white p-1 card-shadow w-fit">
        {[
          { id: "ALL", label: `All Invoices (${INVOICES.length})` },
          { id: "POSTED", label: "Unpaid / Posted" },
          { id: "PARTIAL", label: "Partially Paid" },
          { id: "PAID", label: "Settled / Paid" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filter === f.id
                ? "bg-ink text-bone"
                : "text-mist hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Invoice #</th>
              <th className="px-6 py-3.5">Customer &amp; Type</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Total Amount</th>
              <th className="px-6 py-3.5">Paid Amount</th>
              <th className="px-6 py-3.5">Balance Due</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {filteredInvoices.map((inv) => (
              <tr
                key={inv.id}
                className="hover:bg-cream/40 transition-colors group cursor-pointer"
              >
                <td className="px-6 py-4 font-medium text-ink">
                  <Link href={`/invoices/${inv.id}`} className="hover:underline">
                    {inv.id}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <p className="font-semibold text-ink">{inv.customer}</p>
                  <p className="text-[11.5px] text-mist">{inv.type}</p>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={inv.status} size="sm" />
                </td>
                <td className="px-6 py-4 font-semibold tabular-nums text-ink">
                  {inv.grandTotal}
                </td>
                <td className="px-6 py-4 tabular-nums text-ok">
                  {inv.paidAmount}
                </td>
                <td className="px-6 py-4 font-bold tabular-nums text-ink">
                  {inv.balanceDue}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Record Payment <ArrowRight className="size-3" />
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
