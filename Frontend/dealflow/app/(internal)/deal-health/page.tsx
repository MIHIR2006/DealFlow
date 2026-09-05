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
        <div className="flex items-center gap-2 rounded-full bg-white p-1.5 card-shadow text-[12px] font-semibold">
          <span className="px-3 py-1 rounded-full tone-ok text-ok">
            68 Healthy
          </span>
          <span className="px-3 py-1 rounded-full tone-warn text-warn">
            14 At Risk
          </span>
          <span className="px-3 py-1 rounded-full tone-bad text-bad">
            3 Critical
          </span>
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
                &gt;7 Days Idle
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[18px] tone-warn p-4 border border-transparent">
                <div className="flex items-start justify-between text-[12px]">
                  <span className="font-semibold text-ink">Q-1038</span>
                  <span className="font-bold text-warn">11 Days Inactive</span>
                </div>

                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Cyberdyne Systems
                </h4>
                <p className="text-[12.5px] font-bold text-ink mt-0.5">
                  &#8377;8,40,000
                </p>
                <p className="text-[12px] text-mist mt-1 leading-relaxed">
                  Quote was sent to customer portal on Aug 11; no customer login or counter-offer recorded in 9 days.
                </p>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-transparent/60">
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
                        ? "fill-ok text-white cursor-default"
                        : "fill-warn"
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
                  <span className="font-semibold text-ink">Q-1018</span>
                  <span className="text-warn font-semibold">9 Days Inactive</span>
                </div>
                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Northwind Trading
                </h4>
                <p className="text-[12px] text-mist">
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
        <div className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                <TrendingDown className="size-4 text-bad" />
                Discount Anomalies
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tone-bad text-bad">
                &gt;1.5x Baseline
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[18px] tone-bad p-4 border border-transparent">
                <div className="flex items-start justify-between text-[12px]">
                  <span className="font-semibold text-ink">Q-1045</span>
                  <span className="font-bold text-bad">28.0% Discount Given</span>
                </div>

                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Wayne Enterprises
                </h4>
                <p className="text-[12.5px] font-bold text-ink mt-0.5">
                  &#8377;6,20,000 &middot; Owner: A. Mehta
                </p>

                <div className="mt-2 rounded-lg tone-bad p-2 text-[11.5px] text-bad">
                  Rep trailing baseline discount is <strong>9.2%</strong>. This quotation grants nearly <strong>3x standard discretion</strong>, triggering severe margin dilution.
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-transparent/60">
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
                        ? "fill-bad cursor-default opacity-80"
                        : "fill-bad"
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
        <div className="rounded-[24px] bg-white p-6 card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                <Truck className="size-4 text-lilac" />
                Delivery Slippage Indicators
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tone-lilac text-lilac">
                Logistics Alert
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[18px] tone-lilac p-4 border border-transparent">
                <div className="flex items-start justify-between text-[12px]">
                  <span className="font-semibold text-ink">SO-9042</span>
                  <span className="font-bold text-lilac">+3 Days Slippage</span>
                </div>

                <h4 className="mt-1 font-semibold text-[14px] text-ink">
                  Stark Industries
                </h4>
                <p className="text-[12.5px] font-bold text-ink mt-0.5">
                  Promised: Aug 24 &middot; Est: Aug 27
                </p>
                <p className="text-[12px] text-mist mt-1 leading-relaxed">
                  Warehouse split was delayed due to backorder on East Depot power modules. Restock expected Aug 26.
                </p>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-transparent/60">
                  <Link
                    href="/fulfillment/SO-9042"
                    className="text-[12px] font-semibold text-lilac hover:underline"
                  >
                    Resolve Warehouse Split &rarr;
                  </Link>

                  <span className="text-[11px] text-lilac font-semibold bg-white px-2 py-0.5 rounded border border-transparent">
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
