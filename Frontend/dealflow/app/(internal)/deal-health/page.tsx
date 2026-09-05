"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  TrendingDown,
  Truck,
  Bell,
  CheckCircle,
  ShieldOff,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useAuth, useFetch, inr, timeAgo } from "@/lib/hooks";
import { QuotationApi } from "@/lib/api";
import type { DealHealth } from "@/lib/types";

export default function DealHealthDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const canView = !!user && user.role !== "REP";

  const {
    data: health,
    loading: healthLoading,
    error,
    refetch,
  } = useFetch<DealHealth>(!authLoading && canView ? "/v1/dashboard/deal-health" : null);

  const [nudging, setNudging] = useState<Record<number, boolean>>({});
  const [nudged, setNudged] = useState<Record<number, boolean>>({});
  const [nudgeErrors, setNudgeErrors] = useState<Record<number, string>>({});

  async function handleNudge(quotationId: number) {
    setNudging((prev) => ({ ...prev, [quotationId]: true }));
    setNudgeErrors((prev) => {
      const next = { ...prev };
      delete next[quotationId];
      return next;
    });
    try {
      await QuotationApi.nudge(quotationId);
      setNudged((prev) => ({ ...prev, [quotationId]: true }));
    } catch (e) {
      setNudgeErrors((prev) => ({
        ...prev,
        [quotationId]: e instanceof Error ? e.message : "Nudge failed",
      }));
    } finally {
      setNudging((prev) => ({ ...prev, [quotationId]: false }));
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-mist" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="rounded-[24px] bg-white p-10 card-shadow flex flex-col items-center text-center gap-3">
        <ShieldOff className="size-8 text-mist" />
        <h1 className="font-serif text-[22px] text-ink">
          Deal Health &amp; Anomaly Dashboard
        </h1>
        <p className="text-[13.5px] text-mist max-w-[420px]">
          This dashboard is not available for your role. Deal health and anomaly
          detection is restricted to Admin, Sales Manager, and Finance accounts.
        </p>
      </div>
    );
  }

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

        <button
          type="button"
          onClick={refetch}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-medium text-ink hover:bg-cream transition-colors"
        >
          <RotateCcw className="size-3.5 text-mist" /> Rescan Pipeline
        </button>
      </div>

      {error && (
        <div className="rounded-[18px] tone-bad p-4 border border-transparent flex items-center justify-between gap-3">
          <p className="text-[13px] text-bad font-medium">
            Failed to load deal health data: {error.message}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-bad hover:bg-white/80 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {healthLoading && !health && (
        <div className="flex h-40 items-center justify-center rounded-[24px] bg-white card-shadow">
          <Loader2 className="size-6 animate-spin text-mist" />
        </div>
      )}

      {health && (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[20px] bg-white p-5 card-shadow">
              <p className="text-[12.5px] font-medium text-mist">Total Quotations</p>
              <p className="mt-2 text-[28px] font-serif tracking-tight text-ink tabular-nums">
                {health.summary.total_quotations}
              </p>
            </div>
            <div className="rounded-[20px] bg-white p-5 card-shadow">
              <p className="text-[12.5px] font-medium text-mist">Pipeline Value</p>
              <p className="mt-2 text-[28px] font-serif tracking-tight text-ink tabular-nums">
                {inr(health.summary.pipeline_value)}
              </p>
            </div>
            <div className="rounded-[20px] bg-white p-5 card-shadow">
              <p className="text-[12.5px] font-medium text-mist">Awaiting Approval</p>
              <p className="mt-2 text-[28px] font-serif tracking-tight text-warn tabular-nums">
                {health.summary.awaiting_approval}
              </p>
            </div>
            <div className="rounded-[20px] bg-white p-5 card-shadow">
              <p className="text-[12.5px] font-medium text-mist">Avg Blended Risk</p>
              <p className="mt-2 text-[28px] font-serif tracking-tight text-bad tabular-nums">
                {health.summary.avg_risk_score}%
              </p>
            </div>
          </div>

          {/* THREE FOCUSED ANOMALY STREAM CARDS */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* STREAM 1: STALLED DEALS */}
            <div className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                  <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                    <Clock className="size-4 text-warn" />
                    Stalled Pipeline Deals
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tone-warn text-warn">
                    {health.stalled.length} flagged
                  </span>
                </div>

                <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {health.stalled.map((deal) => (
                    <div
                      key={deal.quotation_id}
                      className="rounded-[18px] tone-warn p-4 border border-transparent"
                    >
                      <div className="flex items-start justify-between text-[12px]">
                        <span className="font-semibold text-ink">{deal.reference}</span>
                        <span className="font-bold text-warn">
                          {deal.days_inactive} Days Inactive
                        </span>
                      </div>

                      <h4 className="mt-1 font-semibold text-[14px] text-ink">
                        {deal.customer_name}
                      </h4>
                      <p className="text-[12.5px] font-bold text-ink mt-0.5">
                        {inr(deal.grand_total)}
                      </p>
                      <p className="text-[12px] text-mist mt-1 leading-relaxed">
                        Owner: {deal.rep_name} &middot; Last activity {timeAgo(deal.last_activity_at)}
                      </p>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-transparent/60">
                        <Link
                          href={`/quotations/${deal.quotation_id}`}
                          className="text-[12px] font-semibold text-ink hover:underline"
                        >
                          Open Deal &rarr;
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleNudge(deal.quotation_id)}
                          disabled={nudged[deal.quotation_id] || nudging[deal.quotation_id]}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                            nudged[deal.quotation_id]
                              ? "fill-ok text-white cursor-default"
                              : "fill-warn"
                          }`}
                        >
                          {nudged[deal.quotation_id] ? (
                            <>
                              <CheckCircle className="size-3" /> Nudged
                            </>
                          ) : nudging[deal.quotation_id] ? (
                            <>
                              <Loader2 className="size-3 animate-spin" /> Nudging...
                            </>
                          ) : (
                            <>
                              <Bell className="size-3" /> Nudge Rep &amp; Client
                            </>
                          )}
                        </button>
                      </div>
                      {nudgeErrors[deal.quotation_id] && (
                        <p className="mt-1.5 text-[11px] text-bad font-medium">
                          {nudgeErrors[deal.quotation_id]}
                        </p>
                      )}
                    </div>
                  ))}

                  {health.stalled.length === 0 && (
                    <p className="text-[12.5px] text-mist py-6 text-center">
                      No stalled deals right now.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
                Stall Threshold: Configured at {health.thresholds.stall_days} business days
              </div>
            </div>

            {/* STREAM 2: DISCOUNT ANOMALIES */}
            <div className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                  <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                    <TrendingDown className="size-4 text-bad" />
                    Discount Anomalies
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tone-bad text-bad">
                    {health.discount_anomalies.length} flagged
                  </span>
                </div>

                <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {health.discount_anomalies.map((a) => (
                    <div
                      key={a.quotation_id}
                      className="rounded-[18px] tone-bad p-4 border border-transparent"
                    >
                      <div className="flex items-start justify-between text-[12px]">
                        <span className="font-semibold text-ink">{a.reference}</span>
                        <span className="font-bold text-bad">
                          {a.discount_pct}% Discount Given
                        </span>
                      </div>

                      <h4 className="mt-1 font-semibold text-[14px] text-ink">
                        {a.customer_name}
                      </h4>
                      <p className="text-[12.5px] font-bold text-ink mt-0.5">
                        {inr(a.grand_total)} &middot; Owner: {a.rep_name}
                      </p>

                      <div className="mt-2 rounded-lg tone-bad p-2 text-[11.5px] text-bad">
                        Rep trailing baseline discount is <strong>{a.baseline_pct}%</strong>. This
                        quotation grants <strong>{a.ratio}x</strong> that baseline, triggering
                        margin dilution review.
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-transparent/60">
                        <Link
                          href={`/quotations/${a.quotation_id}`}
                          className="text-[12px] font-semibold text-ink hover:underline"
                        >
                          Inspect Deal &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}

                  {health.discount_anomalies.length === 0 && (
                    <p className="text-[12.5px] text-mist py-6 text-center">
                      No discount anomalies detected.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
                Anomaly Trigger: &gt;{health.thresholds.anomaly_multiplier}x rep trailing mean
                (min sample {health.thresholds.anomaly_min_sample})
              </div>
            </div>

            {/* STREAM 3: DELIVERY PROMISE SLIPPAGE */}
            <div className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                  <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                    <Truck className="size-4 text-lilac" />
                    Delivery Slippage Indicators
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tone-lilac text-lilac">
                    {health.delivery_slippage.length} flagged
                  </span>
                </div>

                <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {health.delivery_slippage.map((s) => (
                    <div
                      key={s.order_id}
                      className="rounded-[18px] tone-lilac p-4 border border-transparent"
                    >
                      <div className="flex items-start justify-between text-[12px]">
                        <span className="font-semibold text-ink">{s.reference}</span>
                        <span className="font-bold text-lilac">
                          +{s.days_late} Days Slippage
                        </span>
                      </div>

                      <h4 className="mt-1 font-semibold text-[14px] text-ink">
                        {s.customer_name}
                      </h4>
                      <p className="text-[12.5px] font-bold text-ink mt-0.5">
                        Promised: {s.promised_date}
                      </p>
                      <p className="text-[12px] text-mist mt-1 leading-relaxed">
                        Status: {s.status}
                      </p>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-transparent/60">
                        <Link
                          href={`/fulfillment/${s.order_id}`}
                          className="text-[12px] font-semibold text-lilac hover:underline"
                        >
                          Resolve Warehouse Split &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}

                  {health.delivery_slippage.length === 0 && (
                    <p className="text-[12.5px] text-mist py-6 text-center">
                      No delivery slippage detected.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-lilac" />
                Orders past their promised delivery date
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
