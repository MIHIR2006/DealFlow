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

export default function DealHealthDashboardPage() {
  const [nudgedDeals, setNudgedDeals] = useState<string[]>([]);
  const [escalatedDeals, setEscalatedDeals] = useState<string[]>([]);

  function handleNudge(quoteId: string) {
    setNudgedDeals((prev) => [...prev, quoteId]);
  }

  function handleEscalate(quoteId: string) {
    setEscalatedDeals((prev) => [...prev, quoteId]);
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

        {/* Health Ribbon */}
        <div className="flex items-center gap-2 rounded-full bg-white p-1.5 border border-ink/8 shadow-xs text-[12px] font-semibold">
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900">
            68 Healthy
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900">
            14 At Risk
          </span>
          <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-900">
            3 Critical
          </span>
        </div>
      </div>

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
                &gt;7 Days Idle
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[18px] bg-amber-50/50 p-4 border border-amber-200/60">
                <div className="flex items-start justify-between text-[12px]">
                  <span className="font-mono font-semibold text-ink">Q-1038</span>
                  <span className="font-bold text-amber-800">11 Days Inactive</span>
                </div>

                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Cyberdyne Systems
                </h4>
                <p className="font-mono text-[12.5px] font-bold text-ink mt-0.5">
                  &#8377;8,40,000
                </p>
                <p className="text-[12px] text-mist mt-1 leading-relaxed">
                  Quote was sent to customer portal on Aug 11; no customer login or counter-offer recorded in 9 days.
                </p>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-amber-200/60">
                  <Link
                    href="/quotations/Q-1038"
                    className="text-[12px] font-semibold text-ink hover:underline"
                  >
                    Open Deal &rarr;
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleNudge("Q-1038")}
                    disabled={nudgedDeals.includes("Q-1038")}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                      nudgedDeals.includes("Q-1038")
                        ? "bg-emerald-600 text-white cursor-default"
                        : "bg-amber-600 text-white hover:bg-amber-700 shadow-2xs"
                    }`}
                  >
                    {nudgedDeals.includes("Q-1038") ? (
                      <>
                        <CheckCircle className="size-3" /> Nudged
                      </>
                    ) : (
                      <>
                        <Bell className="size-3" /> Nudge Rep &amp; Client
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-[18px] bg-cream/40 p-4 border border-ink/6">
                <div className="flex items-start justify-between text-[12px]">
                  <span className="font-mono font-semibold text-ink">Q-1018</span>
                  <span className="text-amber-800 font-semibold">9 Days Inactive</span>
                </div>
                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Northwind Trading
                </h4>
                <p className="font-mono text-[12px] text-mist">
                  &#8377;1,10,000 &middot; Awaiting customer response
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
            Stall Threshold: Configured at 7 business days
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
                &gt;1.5x Baseline
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[18px] bg-rose-50/50 p-4 border border-rose-200/60">
                <div className="flex items-start justify-between text-[12px]">
                  <span className="font-mono font-semibold text-ink">Q-1045</span>
                  <span className="font-bold text-rose-800">28.0% Discount Given</span>
                </div>

                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Wayne Enterprises
                </h4>
                <p className="font-mono text-[12.5px] font-bold text-ink mt-0.5">
                  &#8377;6,20,000 &middot; Owner: A. Mehta
                </p>

                <div className="mt-2 rounded-lg bg-rose-100/60 p-2 text-[11.5px] text-rose-950">
                  Rep trailing baseline discount is <strong>9.2%</strong>. This quotation grants nearly <strong>3x standard discretion</strong>, triggering severe margin dilution.
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-rose-200/60">
                  <Link
                    href="/quotations/Q-1045"
                    className="text-[12px] font-semibold text-ink hover:underline"
                  >
                    Inspect Deal &rarr;
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleEscalate("Q-1045")}
                    disabled={escalatedDeals.includes("Q-1045")}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                      escalatedDeals.includes("Q-1045")
                        ? "bg-rose-800 text-white cursor-default"
                        : "bg-rose-700 text-white hover:bg-rose-800 shadow-2xs"
                    }`}
                  >
                    {escalatedDeals.includes("Q-1045") ? (
                      <>
                        <ShieldAlert className="size-3" /> Escalated to VP
                      </>
                    ) : (
                      <>
                        <Zap className="size-3" /> Escalate to VP
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
            Anomaly Trigger: &gt;1.5x rep trailing 90-day mean
          </div>
        </div>

        {/* STREAM 3: DELIVERY PROMISE SLIPPAGE */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                <Truck className="size-4 text-purple-700" />
                Delivery Slippage Indicators
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900">
                Logistics Alert
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[18px] bg-purple-50/50 p-4 border border-purple-200/60">
                <div className="flex items-start justify-between text-[12px]">
                  <span className="font-mono font-semibold text-ink">SO-9042</span>
                  <span className="font-bold text-purple-800">+3 Days Slippage</span>
                </div>

                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Stark Industries
                </h4>
                <p className="font-mono text-[12.5px] font-bold text-ink mt-0.5">
                  Promised: Aug 24 &middot; Est: Aug 27
                </p>
                <p className="text-[12px] text-mist mt-1 leading-relaxed">
                  Warehouse split was delayed due to backorder on East Depot power modules. Restock expected Aug 26.
                </p>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-purple-200/60">
                  <Link
                    href="/fulfillment/SO-9042"
                    className="text-[12px] font-semibold text-purple-900 hover:underline"
                  >
                    Resolve Warehouse Split &rarr;
                  </Link>

                  <span className="text-[11px] font-mono text-purple-800 font-semibold bg-white px-2 py-0.5 rounded border border-purple-200">
                    Auto-Tracked
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 text-[12px] text-mist">
            Inventory Sync: Live across 3 fulfillment nodes
          </div>
        </div>
      </div>
    </div>
  );
}
