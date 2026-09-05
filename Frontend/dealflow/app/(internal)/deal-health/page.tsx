"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  TrendingDown,
  Truck,
  ArrowRight,
  Bell,
  CheckCircle,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { useFetch, useMutation, inr, timeAgo } from "@/lib/hooks";

interface DealHealthData {
  summary: {
    total_quotations: number;
    pipeline_value: string;
    won_value: string;
    avg_margin_pct: string;
    awaiting_approval: number;
    avg_risk_score: string;
  };
  statuses: { status: string; count: number; value: string }[];
  stalled: {
    quotation_id: number;
    reference: string;
    status: string;
    customer_name: string;
    rep_name: string;
    grand_total: string;
    days_inactive: number;
    last_activity_at: string;
  }[];
  anomalies: {
    quotation_id: number;
    reference: string;
    customer_name: string;
    rep_name: string;
    grand_total: string;
    discount_pct: string;
    baseline_pct: string;
    ratio: string;
  }[];
  slippage: {
    order_id: number;
    reference: string;
    customer_name: string;
    promised_date: string;
    days_late: number;
  }[];
  thresholds: {
    stall_days: number;
    anomaly_multiplier: string;
    anomaly_min_sample: number;
  };
}

export default function DealHealthDashboardPage() {
  const { data: healthRes, loading, refetch } = useFetch<{ data: DealHealthData }>(
    "/v1/dashboard/deal-health"
  );
  const health = healthRes?.data;

  const { trigger: nudge, loading: nudging } = useMutation();
  const [nudgedDeals, setNudgedDeals] = useState<number[]>([]);
  const [nudgeNotice, setNudgeNotice] = useState<string | null>(null);

  async function handleNudge(quoteId: number, ref: string) {
    try {
      await nudge(`/v1/quotations/${quoteId}/nudge`, {
        method: "POST",
        body: JSON.stringify({ note: "Stalled deal alert triggered via Deal Intelligence Center" }),
      });
      setNudgedDeals((prev) => [...prev, quoteId]);
      setNudgeNotice(`Nudge sent to rep for deal ${ref}! Deal activity timestamp refreshed.`);
      setTimeout(() => setNudgeNotice(null), 4000);
      refetch();
    } catch (e: any) {
      alert(`Nudge error: ${e.message}`);
    }
  }

  const stalled = health?.stalled ?? [];
  const anomalies = health?.anomalies ?? [];
  const slippage = health?.slippage ?? [];

  const atRiskCount = stalled.length + anomalies.length + slippage.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Proactive Revenue Intelligence</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Deal Health &amp; Anomaly Detection
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            The autonomous deal health engine continuously scans active quotations to uncover stalled pipeline, off-policy discount spikes, and supply-chain slippage.
          </p>
        </div>

        {/* Health Ribbon */}
        <div className="flex items-center gap-2 rounded-full bg-white p-1.5 border border-ink/8 shadow-xs text-[12px] font-semibold">
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900">
            {health?.summary?.total_quotations ? `${health.summary.total_quotations} Monitored` : "Active"}
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900">
            {atRiskCount} Flagged
          </span>
          <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-900">
            {anomalies.length} Spikes
          </span>
        </div>
      </div>

      {nudgeNotice && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-700" />
          {nudgeNotice}
        </div>
      )}

      {/* THREE FOCUSED ANOMALY STREAM CARDS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* STREAM 1: STALLED DEALS */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                <Clock className="size-4 text-amber-600" />
                Stalled Pipeline Deals
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                &gt;{health?.thresholds?.stall_days ?? 7}d Idle
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {stalled.map((s) => (
                <div key={s.quotation_id} className="rounded-[18px] bg-amber-50/50 p-4 border border-amber-200/60">
                  <div className="flex items-start justify-between text-[12px]">
                    <span className="font-mono font-semibold text-ink">{s.reference}</span>
                    <span className="font-bold text-amber-800">{s.days_inactive}d Inactive</span>
                  </div>

                  <h4 className="mt-1 font-semibold text-[14px] text-ink">
                    {s.customer_name}
                  </h4>
                  <p className="font-mono text-[12.5px] font-bold text-ink mt-0.5">
                    {inr(s.grand_total)}
                  </p>
                  <p className="text-[12px] text-mist mt-1">
                    Rep: {s.rep_name} &middot; Last active {timeAgo(s.last_activity_at)}
                  </p>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-amber-200/60">
                    <Link
                      href={`/quotations/${s.quotation_id}`}
                      className="text-[12px] font-semibold text-ink hover:underline"
                    >
                      Open Deal &rarr;
                    </Link>

                    <button
                      type="button"
                      disabled={nudgedDeals.includes(s.quotation_id) || nudging}
                      onClick={() => handleNudge(s.quotation_id, s.reference)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                        nudgedDeals.includes(s.quotation_id)
                          ? "bg-emerald-600 text-white cursor-default"
                          : "bg-amber-600 text-white hover:bg-amber-700 shadow-2xs"
                      }`}
                    >
                      {nudgedDeals.includes(s.quotation_id) ? (
                        <>
                          <CheckCircle className="size-3" /> Nudged
                        </>
                      ) : (
                        <>
                          <Bell className="size-3" /> Nudge Rep
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}

              {stalled.length === 0 && !loading && (
                <div className="p-8 text-center text-mist text-[13px]">
                  <CheckCircle className="size-6 text-emerald-600 mx-auto mb-1.5 opacity-60" />
                  No stalled quotations detected. All deals active.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
            Stall Threshold: Configured at {health?.thresholds?.stall_days ?? 7} business days
          </div>
        </div>

        {/* STREAM 2: DISCOUNT ANOMALIES */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                <TrendingDown className="size-4 text-rose-600" />
                Discount Anomalies
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900">
                &gt;{health?.thresholds?.anomaly_multiplier ?? "1.5"}x Mean
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {anomalies.map((a) => (
                <div key={a.quotation_id} className="rounded-[18px] bg-rose-50/50 p-4 border border-rose-200/60">
                  <div className="flex items-start justify-between text-[12px]">
                    <span className="font-mono font-semibold text-ink">{a.reference}</span>
                    <span className="font-bold text-rose-800 font-mono">{a.discount_pct}% Given</span>
                  </div>

                  <h4 className="mt-1 font-semibold text-[14px] text-ink">
                    {a.customer_name}
                  </h4>
                  <p className="font-mono text-[12.5px] font-bold text-ink mt-0.5">
                    {inr(a.grand_total)}
                  </p>
                  <p className="text-[12px] text-rose-900/80 mt-1">
                    Rep {a.rep_name} gave {a.discount_pct}% discount (baseline: {a.baseline_pct}%). Ratio: {a.ratio}x.
                  </p>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-rose-200/60">
                    <Link
                      href={`/quotations/${a.quotation_id}`}
                      className="text-[12px] font-semibold text-ink hover:underline"
                    >
                      Audit Deal &rarr;
                    </Link>
                    <Link
                      href="/governance"
                      className="text-[11.5px] font-semibold text-rose-800 hover:underline"
                    >
                      Review Ceiling
                    </Link>
                  </div>
                </div>
              ))}

              {anomalies.length === 0 && !loading && (
                <div className="p-8 text-center text-mist text-[13px]">
                  <CheckCircle className="size-6 text-emerald-600 mx-auto mb-1.5 opacity-60" />
                  All discounts adhere within statistical baselines.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
            Statistical Baseline: Peer-group trailing 30d discount mean
          </div>
        </div>

        {/* STREAM 3: DELIVERY SLIPPAGE */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                <Truck className="size-4 text-slate-700" />
                Delivery Slippage
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
                Promised Date Risk
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {slippage.map((sl) => (
                <div key={sl.order_id} className="rounded-[18px] bg-cream/40 p-4 border border-ink/6">
                  <div className="flex items-start justify-between text-[12px]">
                    <span className="font-mono font-semibold text-ink">{sl.reference}</span>
                    <span className="font-semibold text-rose-700">+{sl.days_late} Days Past</span>
                  </div>

                  <h4 className="mt-1 font-semibold text-[14px] text-ink">
                    {sl.customer_name}
                  </h4>
                  <p className="text-[12px] text-mist mt-1">
                    Promised delivery: {new Date(sl.promised_date).toLocaleDateString()}
                  </p>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-ink/6">
                    <Link
                      href={`/fulfillment/${sl.order_id}`}
                      className="text-[12px] font-semibold text-ink hover:underline"
                    >
                      Inspect Depot Split &rarr;
                    </Link>
                  </div>
                </div>
              ))}

              {slippage.length === 0 && !loading && (
                <div className="p-8 text-center text-mist text-[13px]">
                  <CheckCircle className="size-6 text-emerald-600 mx-auto mb-1.5 opacity-60" />
                  All confirmed orders on schedule. Zero delivery delays.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
            Logistics SLA: Tracked against warehouse reservation promises
          </div>
        </div>
      </div>
    </div>
  );
}
