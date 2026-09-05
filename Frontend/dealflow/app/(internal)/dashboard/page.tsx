"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, ArrowUpRight, AlertTriangle, ShieldCheck, CheckCircle2, Clock } from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { MarginBar } from "@/components/ui/margin-bar";
import { quotes, kpis } from "@/lib/demo/dashboard";

export default function DashboardPage() {
  const [userName, setUserName] = useState("J. Rao");
  const [userRole, setUserRole] = useState("Sales Rep");

  useEffect(() => {
    function loadPersona() {
      const p = localStorage.getItem("df360.active_persona");
      if (p === "mgr") {
        setUserName("M. Shah");
        setUserRole("Sales Manager");
      } else if (p === "fin") {
        setUserName("P. Nair");
        setUserRole("Finance & Ops");
      } else if (p === "admin") {
        setUserName("Admin");
        setUserRole("Administrator");
      } else {
        setUserName("J. Rao");
        setUserRole("Sales Rep");
      }
    }
    loadPersona();
    window.addEventListener("df360:persona-changed", loadPersona);
    return () => window.removeEventListener("df360:persona-changed", loadPersona);
  }, []);

  return (
    <div className="space-y-8">
      {/* Deal Lifecycle Stage Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Overview · {userRole}</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Good day, {userName}
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[600px]">
            DealFlow360 self-governing engine is actively monitoring 24 open pipelines, 4 pending reviews, and inventory across 3 fulfillment depots.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/deal-health"
            className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-[13px] font-medium text-ink shadow-xs hover:bg-white transition-colors"
          >
            Review At-Risk (3)
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
          <p className="mt-2 text-[30px] font-serif tracking-tight text-ink tabular-nums">
            {kpis.pipeline}
          </p>
          <p className="mt-1 text-[12px] text-emerald-800 flex items-center font-medium">
            <ArrowUpRight className="size-3 mr-0.5" /> +14.2% vs last month
          </p>
        </div>

        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12.5px] font-medium text-mist">Avg Gross Margin</p>
          <p className="mt-2 text-[30px] font-serif tracking-tight text-emerald-800 tabular-nums">
            {kpis.avgMargin}
          </p>
          <p className="mt-1 text-[12px] text-mist">Target: &gt;25% margin</p>
        </div>

        <Link
          href="/approvals"
          className="group rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs hover:border-amber-500/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-mist">Pending Approval</p>
            <Clock className="size-4 text-amber-600 group-hover:scale-110 transition-transform" />
          </div>
          <p className="mt-2 text-[30px] font-serif tracking-tight text-amber-700 tabular-nums">
            {kpis.pendingApprovals}
          </p>
          <p className="mt-1 text-[12px] text-amber-800 font-medium">
            Requires Manager &amp; Finance sign-off
          </p>
        </Link>

        <Link
          href="/deal-health"
          className="group rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs hover:border-rose-500/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-mist">At-Risk Deals</p>
            <AlertTriangle className="size-4 text-rose-600 group-hover:scale-110 transition-transform" />
          </div>
          <p className="mt-2 text-[30px] font-serif tracking-tight text-rose-700 tabular-nums">
            {kpis.atRisk}
          </p>
          <p className="mt-1 text-[12px] text-rose-800 font-medium">
            2 Stalled &middot; 1 Discount Anomaly
          </p>
        </Link>
      </div>

      {/* Main Split Row: Pipeline Funnel vs Deal Health Alert Box */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Pipeline Funnel (7 cols) */}
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
              <div>
                <div className="flex justify-between text-[13px] mb-1 font-medium">
                  <span>Draft &amp; Building</span>
                  <span className="tabular-nums text-mist">3 deals &middot; &#8377;4.2L</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                  <div className="h-full bg-ink/30 rounded-full" style={{ width: "30%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[13px] mb-1 font-medium">
                  <span>Pending Approval (Tier 1 &amp; 2)</span>
                  <span className="tabular-nums text-amber-700">4 deals &middot; &#8377;6.8L</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "50%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[13px] mb-1 font-medium">
                  <span>Under Customer Negotiation</span>
                  <span className="tabular-nums text-purple-700">2 deals &middot; &#8377;3.4L</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: "25%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[13px] mb-1 font-medium">
                  <span>Approved &amp; Ready for Fulfillment</span>
                  <span className="tabular-nums text-emerald-800">5 deals &middot; &#8377;8.0L</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: "70%" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between text-[12.5px] text-mist">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-emerald-600" />
              Blended Risk Auto-Routing: Active
            </span>
            <span>Avg Approval Cycle: 4.2h</span>
          </div>
        </div>

        {/* Right: Deal Health Triage Alerts (5 cols) */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-600 animate-pulse" />
                Proactive Health Alerts
              </h2>
              <span className="text-[11.5px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                3 Actionable
              </span>
            </div>
            <p className="mt-1 text-[13px] text-mist">
              Anomalies flagged by the system engine without human manual queries.
            </p>

            <ul className="mt-4 space-y-3">
              <li className="p-3 rounded-[16px] bg-rose-50/60 border border-rose-200/60">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Discount Spike &middot; Wayne Enterprises
                    </p>
                    <p className="text-[12px] text-rose-900 mt-0.5">
                      Rep gave 28% discount (vs 9.2% trailing avg).
                    </p>
                  </div>
                  <Link
                    href="/deal-health"
                    className="text-[11.5px] font-semibold text-rose-800 hover:underline shrink-0"
                  >
                    Inspect &rarr;
                  </Link>
                </div>
              </li>

              <li className="p-3 rounded-[16px] bg-amber-50/60 border border-amber-200/60">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Stalled Quotation &middot; Cyberdyne
                    </p>
                    <p className="text-[12px] text-amber-900 mt-0.5">
                      No customer activity for 11 days (stall limit: 7d).
                    </p>
                  </div>
                  <Link
                    href="/deal-health"
                    className="text-[11.5px] font-semibold text-amber-800 hover:underline shrink-0"
                  >
                    Nudge &rarr;
                  </Link>
                </div>
              </li>

              <li className="p-3 rounded-[16px] bg-ink/4 border border-ink/8">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Warehouse Stock Split Delay
                    </p>
                    <p className="text-[12px] text-mist mt-0.5">
                      Order SO-9042 backordered on East Depot units.
                    </p>
                  </div>
                  <Link
                    href="/fulfillment"
                    className="text-[11.5px] font-semibold text-ink hover:underline shrink-0"
                  >
                    View Split &rarr;
                  </Link>
                </div>
              </li>
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

          <Link
            href="/quotations"
            className="text-[13px] font-medium text-ink hover:underline"
          >
            View all 24 deals &rarr;
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
              {quotes.map((q) => (
                <tr
                  key={q.id}
                  className="hover:bg-cream/40 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-3.5 font-mono font-medium text-ink">
                    <Link href={`/quotations/${q.id}`} className="hover:underline">
                      {q.id}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{q.customer}</span>
                      <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800 border border-amber-500/20">
                        Gold
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge status={q.status} size="sm" />
                  </td>
                  <td className="px-6 py-3.5 font-mono tabular-nums font-semibold text-ink">
                    {q.amount}
                  </td>
                  <td className="px-6 py-3.5">
                    <RiskBadge score={q.risk} size="sm" />
                  </td>
                  <td className="px-6 py-3.5 text-mist">{q.owner}</td>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
