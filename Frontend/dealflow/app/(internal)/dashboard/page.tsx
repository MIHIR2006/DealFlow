"use client";

import React from "react";
import Link from "next/link";
import { Plus, ArrowUpRight, AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { useFetch, inr, timeAgo } from "@/lib/hooks";
import type { QuotationSummary } from "@/lib/types";

interface DealHealthResponse {
  summary: {
    total_quotations: number;
    pipeline_value: string;
    won_value: string;
    avg_margin_pct: string;
    awaiting_approval: number;
    avg_risk_score: string;
  };
  statuses: { status: string; count: number; value: string }[];
  stalled: { quotation_id: number; reference: string; customer_name: string; grand_total: string; days_inactive: number }[];
  discount_anomalies: { quotation_id: number; reference: string; customer_name: string; discount_pct: string; baseline_pct: string }[];
  delivery_slippage: { order_id: number; reference: string; customer_name: string; days_late: number }[];
}

export default function DashboardPage() {
  const { data: health, loading: healthLoading } = useFetch<{ data: DealHealthResponse }>("/v1/dashboard/deal-health");
  const { data: quotesRes, loading: quotesLoading } = useFetch<{ data: QuotationSummary[] }>("/v1/quotations?limit=8");

  const summary = health?.data?.summary;
  const statuses = health?.data?.statuses ?? [];
  const stalled = health?.data?.stalled ?? [];
  const anomalies = health?.data?.discount_anomalies ?? [];
  const slippage = health?.data?.delivery_slippage ?? [];
  const quotes = quotesRes?.data ?? [];

  const loading = healthLoading || quotesLoading;

  const atRiskCount = stalled.length + anomalies.length + slippage.length;

  // Status distribution for pipeline bars
  function statusCount(s: string) {
    return statuses.find((st) => st.status === s);
  }

  return (
    <div className="space-y-8">
      {/* Deal Lifecycle Stage Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Overview</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Deal Intelligence Center
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[600px]">
            DealFlow360 self-governing engine is actively monitoring{" "}
            {summary ? `${summary.total_quotations} open pipelines` : "..."},{" "}
            {summary ? `${summary.awaiting_approval} pending reviews` : "..."}, and
            inventory across fulfillment depots.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/deal-health"
            className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-[13px] font-medium text-ink shadow-xs hover:bg-white transition-colors"
          >
            Review At-Risk ({atRiskCount})
          </Link>
          <Link
            href="/quotations/new"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone shadow-sm hover:bg-ink/90 transition-all"
          >
            <Plus className="size-4" />
            New Quotation
          </Link>
        </div>
      </div>

      <LifecycleBar currentStage="QUOTE" />

      {/* Top 4 Primary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12.5px] font-medium text-mist">Active Pipeline</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 rounded bg-ink/5 animate-pulse" />
          ) : (
            <>
              <p className="mt-2 text-[30px] font-serif tracking-tight text-ink tabular-nums">
                {summary?.pipeline_value ? inr(summary.pipeline_value) : "—"}
              </p>
              <p className="mt-1 text-[12px] text-mist">
                {summary?.total_quotations ?? 0} active quotations
              </p>
            </>
          )}
        </div>

        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12.5px] font-medium text-mist">Avg Gross Margin</p>
          {loading ? (
            <div className="mt-2 h-8 w-16 rounded bg-ink/5 animate-pulse" />
          ) : (
            <>
              <p className="mt-2 text-[30px] font-serif tracking-tight text-emerald-800 tabular-nums">
                {summary?.avg_margin_pct ?? "—"}%
              </p>
              <p className="mt-1 text-[12px] text-mist">Target: &gt;25% margin</p>
            </>
          )}
        </div>

        <Link
          href="/approvals"
          className="group rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs hover:border-amber-500/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-mist">Pending Approval</p>
            <Clock className="size-4 text-amber-600 group-hover:scale-110 transition-transform" />
          </div>
          {loading ? (
            <div className="mt-2 h-8 w-10 rounded bg-ink/5 animate-pulse" />
          ) : (
            <>
              <p className="mt-2 text-[30px] font-serif tracking-tight text-amber-700 tabular-nums">
                {summary?.awaiting_approval ?? 0}
              </p>
              <p className="mt-1 text-[12px] text-amber-800 font-medium">
                Requires Manager &amp; Finance sign-off
              </p>
            </>
          )}
        </Link>

        <Link
          href="/deal-health"
          className="group rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs hover:border-rose-500/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-mist">At-Risk Deals</p>
            <AlertTriangle className="size-4 text-rose-600 group-hover:scale-110 transition-transform" />
          </div>
          {loading ? (
            <div className="mt-2 h-8 w-10 rounded bg-ink/5 animate-pulse" />
          ) : (
            <>
              <p className="mt-2 text-[30px] font-serif tracking-tight text-rose-700 tabular-nums">
                {atRiskCount}
              </p>
              <p className="mt-1 text-[12px] text-rose-800 font-medium">
                {stalled.length} Stalled &middot; {anomalies.length} Anomaly
              </p>
            </>
          )}
        </Link>
      </div>

      {/* Main Split Row: Pipeline Funnel vs Deal Health Alert Box */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Pipeline Funnel */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink">
                Deal Pipeline Stages
              </h2>
              <Link
                href="/quotations"
                className="text-[12.5px] font-medium text-mist hover:text-ink transition-colors"
              >
                View Pipeline &rarr;
              </Link>
            </div>
            <p className="mt-1 text-[13px] text-mist">
              Distribution of all active quotations moving through the self-governing cycle.
            </p>

            <div className="mt-6 space-y-4">
              {[
                { label: "Draft & Building", status: "DRAFT", color: "bg-ink/30" },
                { label: "Pending Approval", status: "PENDING_APPROVAL", color: "bg-amber-500" },
                { label: "Under Customer Negotiation", status: "UNDER_NEGOTIATION", color: "bg-purple-500" },
                { label: "Approved & Ready", status: "APPROVED", color: "bg-emerald-600" },
              ].map((stage) => {
                const sc = statusCount(stage.status);
                const total = summary?.total_quotations || 1;
                const pct = sc ? Math.round((sc.count / total) * 100) : 0;
                return (
                  <div key={stage.status}>
                    <div className="flex justify-between text-[13px] mb-1 font-medium">
                      <span>{stage.label}</span>
                      <span className="tabular-nums text-mist">
                        {sc?.count ?? 0} deals {sc?.value ? `· ${inr(sc.value)}` : ""}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                      <div className={`h-full ${stage.color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between text-[12.5px] text-mist">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-emerald-600" />
              Blended Risk Auto-Routing: Active
            </span>
            <span>Avg Risk: {summary?.avg_risk_score ?? "—"}%</span>
          </div>
        </div>

        {/* Right: Deal Health Triage Alerts */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-600 animate-pulse" />
                Proactive Health Alerts
              </h2>
              <span className="text-[11.5px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                {atRiskCount} Actionable
              </span>
            </div>
            <p className="mt-1 text-[13px] text-mist">
              Anomalies flagged by the system engine without human manual queries.
            </p>

            <ul className="mt-4 space-y-3">
              {anomalies.slice(0, 1).map((a) => (
                <li key={a.quotation_id} className="p-3 rounded-[16px] bg-rose-50/60 border border-rose-200/60">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-ink">
                        Discount Spike &middot; {a.customer_name}
                      </p>
                      <p className="text-[12px] text-rose-900 mt-0.5">
                        Rep gave {a.discount_pct}% discount (vs {a.baseline_pct}% trailing avg).
                      </p>
                    </div>
                    <Link href="/deal-health" className="text-[11.5px] font-semibold text-rose-800 hover:underline shrink-0">
                      Inspect &rarr;
                    </Link>
                  </div>
                </li>
              ))}

              {stalled.slice(0, 1).map((s) => (
                <li key={s.quotation_id} className="p-3 rounded-[16px] bg-amber-50/60 border border-amber-200/60">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-ink">
                        Stalled Quotation &middot; {s.customer_name}
                      </p>
                      <p className="text-[12px] text-amber-900 mt-0.5">
                        No activity for {s.days_inactive} days (stall limit: 7d).
                      </p>
                    </div>
                    <Link href="/deal-health" className="text-[11.5px] font-semibold text-amber-800 hover:underline shrink-0">
                      Nudge &rarr;
                    </Link>
                  </div>
                </li>
              ))}

              {slippage.slice(0, 1).map((sl) => (
                <li key={sl.order_id} className="p-3 rounded-[16px] bg-ink/4 border border-ink/8">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-ink">
                        Delivery Slippage &middot; {sl.customer_name}
                      </p>
                      <p className="text-[12px] text-mist mt-0.5">
                        Order {sl.reference} slipping +{sl.days_late} days.
                      </p>
                    </div>
                    <Link href={`/fulfillment/${sl.reference}`} className="text-[11.5px] font-semibold text-ink hover:underline shrink-0">
                      View Split &rarr;
                    </Link>
                  </div>
                </li>
              ))}

              {atRiskCount === 0 && !loading && (
                <li className="p-4 rounded-[16px] bg-emerald-50 border border-emerald-200 text-center text-[13px] text-emerald-900 font-medium">
                  <ShieldCheck className="size-5 text-emerald-600 mx-auto mb-1" />
                  All deals healthy — no anomalies detected.
                </li>
              )}
            </ul>
          </div>

          <Link
            href="/deal-health"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-ink/5 py-2 text-[12.5px] font-medium text-ink hover:bg-ink/10 transition-colors"
          >
            Open Deal Health Center &rarr;
          </Link>
        </div>
      </div>

      {/* Active Quotations Ledger Table */}
      <div className="rounded-[24px] bg-white border border-ink/8 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-ink/6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">
              Recent Deal Flow
            </h2>
            <p className="text-[12.5px] text-mist">
              Click any row to open the full Quotation Builder &amp; Governance Engine.
            </p>
          </div>
          <Link href="/quotations" className="text-[13px] font-medium text-ink hover:underline">
            View all deals &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
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
              {loading && quotes.length === 0 && (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-6 py-4">
                        <div className="h-5 w-full rounded bg-ink/5 animate-pulse" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {quotes.map((q) => (
                <tr key={q.id} className="hover:bg-cream/40 transition-colors cursor-pointer group">
                  <td className="px-6 py-3.5 font-mono font-medium text-ink">
                    <Link href={`/quotations/${q.id}`} className="hover:underline">
                      {q.reference}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{q.customer_name}</span>
                      <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800 border border-amber-500/20">
                        {q.customer_tier}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge status={q.status} size="sm" />
                  </td>
                  <td className="px-6 py-3.5 font-mono tabular-nums font-semibold text-ink">
                    {inr(q.grand_total)}
                  </td>
                  <td className="px-6 py-3.5">
                    <RiskBadge score={q.blended_risk_score} size="sm" />
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
              ))}
              {!loading && quotes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-mist">
                    <p className="font-medium text-[14px] text-ink">No quotations yet</p>
                    <p className="text-[12px] mt-0.5">
                      Create your first quotation to launch the deal flow engine.
                    </p>
                    <Link
                      href="/quotations/new"
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone"
                    >
                      <Plus className="size-4" />
                      New Quotation
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
