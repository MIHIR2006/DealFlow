"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, LayoutList, Columns, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { useFetch, inr, timeAgo } from "@/lib/hooks";
import type { QuotationSummary } from "@/lib/types";

type ViewMode = "table" | "kanban";

const KANBAN_COLUMNS = [
  { id: "DRAFT", title: "Draft", bg: "bg-ink/[0.02]" },
  { id: "PENDING_APPROVAL", title: "Pending Approval", bg: "bg-amber-500/[0.04]" },
  { id: "UNDER_NEGOTIATION", title: "Under Negotiation", bg: "bg-purple-500/[0.04]" },
  { id: "APPROVED", title: "Approved / Ready", bg: "bg-blue-500/[0.04]" },
  { id: "CONFIRMED", title: "Confirmed / Won", bg: "bg-emerald-500/[0.04]" },
];

export default function QuotationsPage() {
  const { data: res, loading } = useFetch<{ data: QuotationSummary[] }>("/v1/quotations");
  const quotes = res?.data ?? [];

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");

  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const s = search.toLowerCase();
      const matchSearch =
        !s ||
        q.reference.toLowerCase().includes(s) ||
        q.customer_name.toLowerCase().includes(s) ||
        q.rep_name.toLowerCase().includes(s);

      const matchStage =
        stageFilter === "ALL" ||
        (stageFilter === "PENDING" && q.status === "PENDING_APPROVAL") ||
        q.status === stageFilter;

      const matchTier = tierFilter === "ALL" || q.customer_tier === tierFilter;

      return matchSearch && matchStage && matchTier;
    });
  }, [quotes, search, stageFilter, tierFilter]);

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    quotes.forEach((q) => { m[q.status] = (m[q.status] || 0) + 1; });
    return m;
  }, [quotes]);

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Sales Pipeline</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Quotations &amp; Deal Flow
          </h1>
          <p className="mt-1 text-[14.5px] text-mist">
            Manage living quotations, track blended discount risk thresholds, and monitor customer negotiations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-full border border-ink/10 bg-white/80 p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-ink text-bone shadow-xs"
                  : "text-mist hover:text-ink"
              }`}
            >
              <LayoutList className="size-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-ink text-bone shadow-xs"
                  : "text-mist hover:text-ink"
              }`}
            >
              <Columns className="size-3.5" />
              Pipeline
            </button>
          </div>

          <Link
            href="/quotations/new"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone shadow-sm hover:bg-ink/90 transition-all"
          >
            <Plus className="size-4" />
            New Quotation
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-3 border border-ink/8 shadow-xs">
        <div className="flex flex-1 items-center gap-2 min-w-[260px] max-w-md rounded-full bg-ink/[0.03] px-3.5 py-1.5 border border-ink/6">
          <Search className="size-4 text-mist" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals by quote #, customer, rep..."
            className="w-full bg-transparent text-[13px] placeholder:text-mist focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Stage Filter Pills */}
          <div className="flex items-center rounded-full bg-ink/[0.03] p-1 border border-ink/6">
            {[
              { id: "ALL", label: `All (${quotes.length})` },
              { id: "DRAFT", label: `Draft (${stageCounts["DRAFT"] || 0})` },
              { id: "PENDING", label: `Pending (${stageCounts["PENDING_APPROVAL"] || 0})` },
              { id: "UNDER_NEGOTIATION", label: "Negotiating" },
              { id: "APPROVED", label: "Approved" },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStageFilter(st.id)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  stageFilter === st.id
                    ? "bg-white text-ink shadow-xs"
                    : "text-mist hover:text-ink"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Tier Filter */}
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-[12px] text-ink font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="ALL">All Customer Tiers</option>
            <option value="GOLD">Gold Tier</option>
            <option value="SILVER">Silver Tier</option>
            <option value="BRONZE">Bronze Tier</option>
          </select>
        </div>
      </div>

      {/* VIEW A: DENSE TABLE */}
      {viewMode === "table" ? (
        <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-6 py-3.5">Quote Ref</th>
                <th className="px-6 py-3.5">Customer &amp; Tier</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Amount</th>
                <th className="px-6 py-3.5">Blended Risk</th>
                <th className="px-6 py-3.5">Owner</th>
                <th className="px-6 py-3.5">Updated</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {loading && (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-6 py-4">
                        <div className="h-5 w-full rounded bg-ink/5 animate-pulse" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {filteredQuotes.map((q) => (
                <tr
                  key={q.id}
                  className="hover:bg-cream/40 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4 font-mono font-medium text-ink">
                    <Link href={`/quotations/${q.id}`} className="hover:underline">
                      {q.reference}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{q.customer_name}</span>
                      <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800 border border-amber-500/20">
                        {q.customer_tier}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={q.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold tabular-nums text-ink">
                    {inr(q.grand_total)}
                  </td>
                  <td className="px-6 py-4">
                    <RiskBadge score={q.blended_risk_score} size="sm" />
                  </td>
                  <td className="px-6 py-4 text-mist">{q.rep_name}</td>
                  <td className="px-6 py-4 text-mist text-[12.5px]">{timeAgo(q.last_activity_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/quotations/${q.id}`}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-[12px] font-medium text-ink/80 hover:bg-ink hover:text-bone transition-colors"
                    >
                      Open Builder &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && filteredQuotes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-mist">
                    <p className="font-medium text-[14px] text-ink">No quotations match your filters</p>
                    <p className="text-[12px] mt-0.5">Try adjusting the search or stage filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* VIEW B: KANBAN PIPELINE VIEW */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {KANBAN_COLUMNS.map((col) => {
            const colQuotes = quotes.filter((q) => {
              // PENDING_APPROVAL covers both manager + finance pending
              return q.status === col.id;
            });

            return (
              <div
                key={col.id}
                className={`flex flex-col rounded-[20px] p-4 border border-ink/8 ${col.bg} min-h-[460px]`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                  <h3 className="text-[13.5px] font-semibold text-ink">
                    {col.title}
                  </h3>
                  <span className="flex size-5 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-mist shadow-xs">
                    {colQuotes.length}
                  </span>
                </div>

                <div className="mt-3 space-y-3 flex-1">
                  {colQuotes.map((q) => (
                    <Link
                      key={q.id}
                      href={`/quotations/${q.id}`}
                      className="block rounded-[16px] bg-white p-4 border border-ink/8 shadow-xs hover:border-ink/20 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-semibold text-mist group-hover:text-ink">
                          {q.reference}
                        </span>
                        <span className="text-mist">{timeAgo(q.last_activity_at)}</span>
                      </div>

                      <p className="mt-1.5 font-medium text-[14px] text-ink group-hover:underline">
                        {q.customer_name}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-mono font-semibold tabular-nums text-[13.5px] text-ink">
                          {inr(q.grand_total)}
                        </span>
                        <RiskBadge score={q.blended_risk_score} size="sm" />
                      </div>
                    </Link>
                  ))}

                  {colQuotes.length === 0 && (
                    <div className="flex h-32 items-center justify-center rounded-[16px] border border-dashed border-ink/10 text-[12px] text-mist">
                      No deals in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
