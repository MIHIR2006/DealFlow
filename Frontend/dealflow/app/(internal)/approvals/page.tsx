"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { useFetch, inr } from "@/lib/hooks";
import type { ApprovalInboxRow, Page } from "@/lib/types";

export default function ApprovalsInboxPage() {
  const [roleFilter, setRoleFilter] = useState<"ALL" | "MANAGER" | "FINANCE">("ALL");
  const { data, loading, error } = useFetch<Page<ApprovalInboxRow>>("/v1/approvals?limit=100");
  const rows = data?.data ?? [];

  const filtered = useMemo(() => {
    if (roleFilter === "ALL") return rows;
    return rows.filter((r) => r.required_role === roleFilter);
  }, [rows, roleFilter]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      manager: rows.filter((r) => r.required_role === "MANAGER").length,
      finance: rows.filter((r) => r.required_role === "FINANCE").length,
    }),
    [rows],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Governance &amp; Controls</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Approvals Inbox
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[640px]">
            The risk engine automatically routes quotations here when discounts exceed category or
            customer tier ceilings. Reps never manually request approval.
          </p>
        </div>

        <div className="flex items-center rounded-full bg-white p-1 card-shadow">
          {[
            { id: "ALL" as const, label: `All pending (${counts.all})` },
            { id: "MANAGER" as const, label: `Sales Manager (${counts.manager})` },
            { id: "FINANCE" as const, label: `Finance (${counts.finance})` },
          ].map((rf) => (
            <button
              key={rf.id}
              type="button"
              onClick={() => setRoleFilter(rf.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                roleFilter === rf.id ? "bg-ink text-bone" : "text-mist hover:text-ink"
              }`}
            >
              {rf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[20px] tone-warn p-4 flex items-start gap-3">
        <AlertTriangle className="size-5 text-warn shrink-0 mt-0.5" />
        <div className="text-[13px] text-warn">
          <p className="font-semibold">Blended risk governance policy active:</p>
          <p className="mt-0.5 text-warn/90 leading-relaxed">
            Deals matching a configured policy threshold require sequential approval (Sales Manager
            first, then Finance if the policy needs it). Reviewers can <strong>Approve</strong>,{" "}
            <strong>Return for Revision</strong>, or <strong>Reject</strong>.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-[16px] tone-bad p-3 text-[12.5px] text-bad">{error.message}</div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Quote Ref</th>
              <th className="px-6 py-3.5">Customer &amp; Tier</th>
              <th className="px-6 py-3.5">Required Step</th>
              <th className="px-6 py-3.5">Order Amount</th>
              <th className="px-6 py-3.5">Blended Risk</th>
              <th className="px-6 py-3.5">Rep</th>
              <th className="px-6 py-3.5 text-right">Review Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-mist">
                  Loading&hellip;
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-cream/40 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 font-medium text-ink">
                    <Link href={`/approvals/${r.quotation_id}`} className="hover:underline">
                      {r.reference}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{r.customer_name}</span>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded tone-warn text-warn">
                        {r.customer_tier}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={`PENDING_${r.required_role}`} size="sm" />
                  </td>
                  <td className="px-6 py-4 font-semibold tabular-nums text-ink">{inr(r.grand_total)}</td>
                  <td className="px-6 py-4">
                    <RiskBadge score={r.blended_risk_score} requiredLevel={r.required_level} size="sm" />
                  </td>
                  <td className="px-6 py-4 text-[12.5px] text-mist">{r.rep_name}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/approvals/${r.quotation_id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 transition-colors"
                    >
                      Open review <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}

            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-mist">
                  <ShieldCheck className="size-8 text-ok mx-auto mb-2 opacity-60" />
                  <p className="font-medium text-[14px] text-ink">All caught up</p>
                  <p className="text-[12px] mt-0.5">
                    No quotations currently pending {roleFilter === "ALL" ? "" : roleFilter.toLowerCase()}{" "}
                    authorization.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
