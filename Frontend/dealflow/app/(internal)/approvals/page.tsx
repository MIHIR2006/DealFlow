"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ShieldCheck, Filter, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { quotes } from "@/lib/demo/dashboard";

export default function ApprovalsInboxPage() {
  const [roleFilter, setRoleFilter] = useState<"ALL" | "MANAGER" | "FINANCE">("ALL");

  const pendingQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const isPending =
        q.status === "Pending Manager" || q.status === "Pending Finance";
      if (!isPending) return false;
      if (roleFilter === "MANAGER") return q.status === "Pending Manager";
      if (roleFilter === "FINANCE") return q.status === "Pending Finance";
      return true;
    });
  }, [roleFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Governance &amp; Controls</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Approvals Inbox
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[640px]">
            The risk engine automatically routes quotations here when discounts exceed category or customer tier ceilings. Reps never manually request approval.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Role Filter Pills */}
          <div className="flex items-center rounded-full bg-white p-1 card-shadow">
            {[
              { id: "ALL", label: `All Pending (${quotes.filter(q => q.status.includes("Pending")).length})` },
              { id: "MANAGER", label: "Sales Manager (Step 1)" },
              { id: "FINANCE", label: "Finance Review (Step 2)" },
            ].map((rf) => (
              <button
                key={rf.id}
                type="button"
                onClick={() => setRoleFilter(rf.id as any)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  roleFilter === rf.id
                    ? "bg-ink text-bone"
                    : "text-mist hover:text-ink"
                }`}
              >
                {rf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inbox Notice Card */}
      <div className="rounded-[20px] tone-warn p-4 border border-transparent flex items-start gap-3">
        <AlertTriangle className="size-5 text-warn shrink-0 mt-0.5" />
        <div className="text-[13px] text-warn">
          <p className="font-semibold">
            Blended Risk Governance Policy Active:
          </p>
          <p className="mt-0.5 text-warn/90 leading-relaxed">
            Deals with blended risk &ge;5.0% or single-line overages &ge;10pt require two-level sequential approval (Sales Manager first, then Finance). Reviewers can <strong>Approve</strong>, <strong>Return for Revision</strong> (back to Draft with notes), or <strong>Reject</strong>.
          </p>
        </div>
      </div>

      {/* Inbox Table */}
      <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Quote Ref</th>
              <th className="px-6 py-3.5">Customer &amp; Tier</th>
              <th className="px-6 py-3.5">Required Step</th>
              <th className="px-6 py-3.5">Order Amount</th>
              <th className="px-6 py-3.5">Blended Risk</th>
              <th className="px-6 py-3.5">Violation Summary</th>
              <th className="px-6 py-3.5 text-right">Review Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {pendingQuotes.map((q) => (
              <tr
                key={q.id}
                className="hover:bg-cream/40 transition-colors group cursor-pointer"
              >
                <td className="px-6 py-4 font-medium text-ink">
                  <Link href={`/approvals/${q.id}`} className="hover:underline">
                    {q.id}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{q.customer}</span>
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded tone-warn text-warn border border-transparent">
                      Gold
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={q.status} size="sm" />
                </td>
                <td className="px-6 py-4 font-semibold tabular-nums text-ink">
                  {q.amount}
                </td>
                <td className="px-6 py-4">
                  <RiskBadge score={q.risk} size="sm" />
                </td>
                <td className="px-6 py-4 text-[12.5px] text-mist">
                  {q.id === "Q-1042"
                    ? "Setup Service: 18% given vs 10% allowed (+8pt)"
                    : "Category ceiling exceeded on 2 lines"}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/approvals/${q.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors"
                  >
                    Open Review <ArrowRight className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}

            {pendingQuotes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-mist">
                  <ShieldCheck className="size-8 text-ok mx-auto mb-2 opacity-60" />
                  <p className="font-medium text-[14px] text-ink">All caught up</p>
                  <p className="text-[12px] mt-0.5">
                    No quotations currently pending {roleFilter === "ALL" ? "" : roleFilter.toLowerCase()} authorization.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
