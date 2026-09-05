"use client";

import React from "react";
import Link from "next/link";
import { Repeat, Calendar, ArrowRight, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

const SUBSCRIPTIONS = [
  {
    id: "SUB-8021",
    orderRef: "SO-9042",
    customer: "Acme Corp",
    planName: "Enterprise Cloud Support 24/7",
    cadence: "Monthly",
    qty: 2,
    mrr: "₹50,000",
    nextBillingDate: "Sep 01, 2026",
    status: "ACTIVE",
  },
  {
    id: "SUB-8019",
    orderRef: "SO-9038",
    customer: "Beta Industries",
    planName: "Telemetry & Performance Observability",
    cadence: "Monthly",
    qty: 5,
    mrr: "₹62,500",
    nextBillingDate: "Sep 15, 2026",
    status: "ACTIVE",
  },
  {
    id: "SUB-8012",
    orderRef: "SO-9014",
    customer: "Stark Industries",
    planName: "Dedicated Security SRE Retainer",
    cadence: "Annual",
    qty: 1,
    mrr: "₹1,20,000",
    nextBillingDate: "Jan 01, 2027",
    status: "ACTIVE",
  },
];

export default function SubscriptionsPage() {
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
          <div className="rounded-full border border-ink/10 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink">
            Total Active MRR: <span className="text-ok">₹2,32,500</span>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Subscription #</th>
              <th className="px-6 py-3.5">Customer</th>
              <th className="px-6 py-3.5">Plan &amp; Cadence</th>
              <th className="px-6 py-3.5">Seats / Qty</th>
              <th className="px-6 py-3.5">Recurring MRR</th>
              <th className="px-6 py-3.5">Next Billing</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {SUBSCRIPTIONS.map((sub) => (
              <tr
                key={sub.id}
                className="hover:bg-cream/40 transition-colors group cursor-pointer"
              >
                <td className="px-6 py-4 font-medium text-ink">
                  <Link href={`/subscriptions/${sub.id}`} className="hover:underline">
                    {sub.id}
                  </Link>
                </td>
                <td className="px-6 py-4 font-medium text-ink">
                  {sub.customer}
                </td>
                <td className="px-6 py-4">
                  <p className="font-medium text-ink">{sub.planName}</p>
                  <p className="text-[11.5px] text-mist">{sub.cadence} billing</p>
                </td>
                <td className="px-6 py-4 tabular-nums text-ink font-semibold">
                  {sub.qty} seats
                </td>
                <td className="px-6 py-4 font-semibold tabular-nums text-ok">
                  {sub.mrr}
                </td>
                <td className="px-6 py-4 text-mist text-[12.5px]">
                  {sub.nextBillingDate}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tone-ok text-ok border border-transparent">
                    <span className="size-1.5 rounded-full fill-ok mr-1.5" />
                    {sub.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/subscriptions/${sub.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Manage &amp; Prorate <ArrowRight className="size-3" />
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
