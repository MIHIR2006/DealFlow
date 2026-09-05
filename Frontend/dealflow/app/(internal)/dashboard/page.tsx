"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Plus, ArrowUpRight, AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { useAuth, useFetch, inr } from "@/lib/hooks";
import type { Page, QuotationSummary, DealHealth } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  REP: "Sales Rep",
  MANAGER: "Sales Manager",
  FINANCE: "Finance & Ops",
  ADMIN: "Administrator",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const canSeeHealth = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "FINANCE";

  const { data: quotesPage, loading: quotesLoading } = useFetch<Page<QuotationSummary>>(
    "/v1/quotations?limit=8",
  );
  const { data: health } = useFetch<DealHealth>(canSeeHealth ? "/v1/dashboard/deal-health?limit=5" : null);

  const quotes = quotesPage?.data ?? [];

  const stats = useMemo(() => {
    const pipelineValue = quotes.reduce((sum, q) => sum + (parseFloat(q.grand_total) || 0), 0);
    const marginAvg =
      quotes.length > 0
        ? quotes.reduce((sum, q) => sum + (parseFloat(q.margin_pct) || 0), 0) / quotes.length
        : 0;
    const pending = quotes.filter((q) => q.status === "PENDING_APPROVAL").length;
    return { pipelineValue, marginAvg, pending };
  }, [quotes]);

  const atRiskCount = (health?.stalled.length ?? 0) + (health?.discount_anomalies.length ?? 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">
            Overview · {user ? (ROLE_LABEL[user.role] ?? user.role) : ""}
          </p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Good day{user ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[600px]">
            DealFlow360&apos;s self-governing engine is actively monitoring your pipeline, pending
            reviews, and fulfillment across every warehouse.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canSeeHealth ? (
            <Link
              href="/deal-health"
              className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-[13px] font-medium text-ink hover:bg-white transition-colors"
            >
              Review at-risk ({atRiskCount})
            </Link>
          ) : null}
          <Link
            href="/quotations/new"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone shadow-sm hover:bg-ink/90 transition-all"
          >
            <Plus className="size-4" />
            New Quotation
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[20px] bg-white p-5 card-shadow">
          <p className="text-[12.5px] font-medium text-mist">Active pipeline</p>
          <p className="mt-2 text-[30px] font-serif tracking-tight text-ink tabular-nums">
            {inr(stats.pipelineValue)}
          </p>
          <p className="mt-1 text-[12px] text-mist flex items-center font-medium">
            <ArrowUpRight className="size-3 mr-0.5" /> across {quotes.length} recent deals
          </p>
        </div>

        <div className="rounded-[20px] bg-white p-5 card-shadow">
          <p className="text-[12.5px] font-medium text-mist">Avg gross margin</p>
          <p className="mt-2 text-[30px] font-serif tracking-tight text-ok tabular-nums">
            {stats.marginAvg.toFixed(1)}%
          </p>
          <p className="mt-1 text-[12px] text-mist">Target: &gt;25% margin</p>
        </div>

        <Link
          href="/approvals"
          className="group rounded-[20px] bg-white p-5 card-shadow hover:border-transparent transition-colors"
        >
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-mist">Pending approval</p>
            <Clock className="size-4 text-warn group-hover:scale-110 transition-transform" />
          </div>
          <p className="mt-2 text-[30px] font-serif tracking-tight text-warn tabular-nums">
            {stats.pending}
          </p>
          <p className="mt-1 text-[12px] text-warn font-medium">
            Requires Manager &amp; Finance sign-off
          </p>
        </Link>

        {canSeeHealth ? (
          <Link
            href="/deal-health"
            className="group rounded-[20px] bg-white p-5 card-shadow hover:border-transparent transition-colors"
          >
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-mist">At-risk deals</p>
              <AlertTriangle className="size-4 text-bad group-hover:scale-110 transition-transform" />
            </div>
            <p className="mt-2 text-[30px] font-serif tracking-tight text-bad tabular-nums">
              {atRiskCount}
            </p>
            <p className="mt-1 text-[12px] text-bad font-medium">
              {health?.stalled.length ?? 0} stalled &middot; {health?.discount_anomalies.length ?? 0} anomaly
            </p>
          </Link>
        ) : (
          <div className="rounded-[20px] bg-white p-5 card-shadow">
            <p className="text-[12.5px] font-medium text-mist">Governance</p>
            <p className="mt-2 text-[18px] font-serif tracking-tight text-ink flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-ok" /> Active
            </p>
            <p className="mt-1 text-[12px] text-mist">Blended-risk auto-routing is live</p>
          </div>
        )}
      </div>

      {canSeeHealth && health ? (
        <div className="rounded-[24px] bg-white p-6 card-shadow">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink flex items-center gap-2">
              <span className="size-2 rounded-full fill-bad animate-pulse" />
              Proactive health alerts
            </h2>
            <span className="text-[11.5px] font-semibold text-bad tone-bad px-2 py-0.5 rounded-full">
              {atRiskCount} actionable
            </span>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {health.stalled.slice(0, 3).map((s) => (
              <li key={`stalled-${s.quotation_id}`} className="p-3 rounded-[16px] tone-warn">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Stalled &middot; {s.customer_name}
                    </p>
                    <p className="text-[12px] text-warn mt-0.5">
                      {s.reference}: no activity for {s.days_inactive} days.
                    </p>
                  </div>
                  <Link
                    href={`/quotations/${s.quotation_id}`}
                    className="text-[11.5px] font-semibold text-warn hover:underline shrink-0"
                  >
                    Inspect &rarr;
                  </Link>
                </div>
              </li>
            ))}
            {health.discount_anomalies.slice(0, 3).map((a) => (
              <li key={`anomaly-${a.quotation_id}`} className="p-3 rounded-[16px] tone-bad">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Discount spike &middot; {a.customer_name}
                    </p>
                    <p className="text-[12px] text-bad mt-0.5">
                      {a.rep_name} gave {a.discount_pct}% (vs {a.baseline_pct}% trailing avg).
                    </p>
                  </div>
                  <Link
                    href={`/quotations/${a.quotation_id}`}
                    className="text-[11.5px] font-semibold text-bad hover:underline shrink-0"
                  >
                    Inspect &rarr;
                  </Link>
                </div>
              </li>
            ))}
            {atRiskCount === 0 ? (
              <li className="p-3 rounded-[16px] bg-ink/4 text-[13px] text-mist sm:col-span-2">
                No stalled deals or discount anomalies right now.
              </li>
            ) : null}
          </ul>
          <Link
            href="/deal-health"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-ink/5 py-2 text-[12.5px] font-medium text-ink hover:bg-ink/10 transition-colors"
          >
            Open Deal Health Center &rarr;
          </Link>
        </div>
      ) : null}

      <div className="rounded-[24px] bg-white card-shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-ink/6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">Recent deal flow</h2>
            <p className="text-[12.5px] text-mist">
              Click any row to open the full Quotation Builder &amp; Governance Engine.
            </p>
          </div>
          <Link href="/quotations" className="text-[13px] font-medium text-ink hover:underline">
            View all &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
              <tr>
                <th className="px-6 py-3">Quote Ref</th>
                <th className="px-6 py-3">Customer &amp; Tier</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Grand Total</th>
                <th className="px-6 py-3">Blended Risk</th>
                <th className="px-6 py-3">Owner</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {quotesLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-mist">
                    Loading&hellip;
                  </td>
                </tr>
              ) : quotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-mist">
                    No quotations yet. Create your first one.
                  </td>
                </tr>
              ) : (
                quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-cream/40 transition-colors cursor-pointer group">
                    <td className="px-6 py-3.5 font-medium text-ink">
                      <Link href={`/quotations/${q.id}`} className="hover:underline">
                        {q.reference}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{q.customer_name}</span>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded tone-warn text-warn">
                          {q.customer_tier}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={q.status} size="sm" />
                    </td>
                    <td className="px-6 py-3.5 tabular-nums font-semibold text-ink">
                      {inr(q.grand_total)}
                    </td>
                    <td className="px-6 py-3.5">
                      <RiskBadge score={q.blended_risk_score} requiredLevel={q.required_level} size="sm" />
                    </td>
                    <td className="px-6 py-3.5 text-mist">{q.rep_name}</td>
                    <td className="px-6 py-3.5 text-right">
                      <Link
                        href={`/quotations/${q.id}`}
                        className="inline-flex items-center text-[12px] font-medium text-ink/70 group-hover:text-ink group-hover:underline"
                      >
                        Open Builder &rarr;
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
