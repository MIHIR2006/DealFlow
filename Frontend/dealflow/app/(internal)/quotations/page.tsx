"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, LayoutList, Columns, Search, ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { useFetch, inr, timeAgo } from "@/lib/hooks";
import type { QuotationSummary, Page } from "@/lib/types";

type ViewMode = "table" | "kanban";

const KANBAN_COLUMNS: { id: string; title: string; statuses: string[]; bg: string }[] = [
  { id: "DRAFT", title: "Draft", statuses: ["DRAFT"], bg: "bg-cream/50" },
  { id: "PENDING", title: "Pending Approval", statuses: ["PENDING_APPROVAL"], bg: "bg-amber-500/5" },
  { id: "NEGOTIATION", title: "Under Negotiation", statuses: ["SENT", "UNDER_NEGOTIATION"], bg: "bg-purple-500/5" },
  { id: "APPROVED", title: "Approved / Ready", statuses: ["APPROVED"], bg: "bg-cream/80" },
  { id: "CONFIRMED", title: "Confirmed / Won", statuses: ["CONFIRMED"], bg: "bg-emerald-500/5" },
];

export default function QuotationsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");

  const { data, loading } = useFetch<Page<QuotationSummary>>("/v1/quotations?limit=100");
  const quotes = data?.data ?? [];

  const filteredQuotes = useMemo(() => {
    const stageGroup = KANBAN_COLUMNS.find((c) => c.id === stageFilter);
    return quotes.filter((q) => {
      const matchSearch =
        q.reference.toLowerCase().includes(search.toLowerCase()) ||
        q.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        q.rep_name.toLowerCase().includes(search.toLowerCase());
      const matchStage = stageFilter === "ALL" || (stageGroup?.statuses.includes(q.status) ?? true);
      const matchTier = tierFilter === "ALL" || q.customer_tier === tierFilter;
      return matchSearch && matchStage && matchTier;
    });
  }, [quotes, search, stageFilter, tierFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Sales Pipeline</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Quotations &amp; Deal Flow
          </h1>
          <p className="mt-1 text-[14.5px] text-mist">
            Manage living quotations, track blended discount risk thresholds, and monitor customer
            negotiations.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          <div className="flex items-center rounded-full border border-ink/10 bg-white/80 p-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                viewMode === "table" ? "bg-ink text-bone" : "text-mist hover:text-ink"
              }`}
            >
              <LayoutList className="size-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                viewMode === "kanban" ? "bg-ink text-bone" : "text-mist hover:text-ink"
              }`}
            >
              <Columns className="size-3.5" />
              Pipeline
            </button>
          </div>

          <Link
            href="/quotations/new"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone whitespace-nowrap shadow-sm hover:bg-ink/90 transition-all"
          >
            <Plus className="size-4" />
            New Quotation
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-3 card-shadow">
        <div className="flex w-full flex-1 items-center gap-2 rounded-full border border-ink/6 bg-ink/[0.03] px-3.5 py-1.5 sm:w-auto sm:min-w-[260px] sm:max-w-md">
          <Search className="size-4 text-mist" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals by quote #, customer, rep..."
            className="w-full bg-transparent text-[13px] placeholder:text-mist focus:outline-hidden"
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="scroll-x flex max-w-full items-center rounded-full bg-ink/[0.03] p-1 border border-ink/6">
            {[{ id: "ALL", label: `All (${quotes.length})` }, ...KANBAN_COLUMNS.map((c) => ({ id: c.id, label: c.title }))].map(
              (st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStageFilter(st.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                    stageFilter === st.id ? "bg-white text-ink" : "text-mist hover:text-ink"
                  }`}
                >
                  {st.label}
                </button>
              ),
            )}
          </div>

          <div className="relative">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="appearance-none rounded-full border border-ink/10 bg-white px-3.5 py-1.5 pr-8 text-[12px] text-ink font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Customer Tiers</option>
              <option value="GOLD">Gold Tier</option>
              <option value="SILVER">Silver Tier</option>
              <option value="BRONZE">Bronze Tier</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-mist pointer-events-none" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-[24px] bg-white card-shadow">
          <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === "table" ? (
        <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
          <table className="stack-table w-full text-left text-[13.5px]">
            <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
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
              {filteredQuotes.map((q) => (
                <tr key={q.id} className="hover:bg-cream/40 transition-colors group cursor-pointer">
                  <td data-stack="primary" className="px-6 py-4 font-medium text-ink">
                    <Link href={`/quotations/${q.id}`} className="hover:underline">
                      {q.reference}
                    </Link>
                  </td>
                  <td data-label="Customer" className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{q.customer_name}</span>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded tone-warn text-warn">
                        {q.customer_tier}
                      </span>
                    </div>
                  </td>
                  <td data-label="Status" className="px-6 py-4">
                    <StatusBadge status={q.status} size="sm" />
                  </td>
                  <td data-label="Amount" className="px-6 py-4 font-semibold tabular-nums text-ink">
                    {inr(q.grand_total)}
                  </td>
                  <td data-label="Blended risk" className="px-6 py-4">
                    <RiskBadge score={q.blended_risk_score} requiredLevel={q.required_level} size="sm" />
                  </td>
                  <td data-label="Owner" className="px-6 py-4 text-mist">
                    {q.rep_name}
                  </td>
                  <td data-label="Updated" className="px-6 py-4 text-mist text-[12.5px]">
                    {timeAgo(q.last_activity_at)}
                  </td>
                  <td data-stack="action" className="px-6 py-4 text-right">
                    <Link
                      href={`/quotations/${q.id}`}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-[12px] font-medium text-ink/80 hover:bg-ink hover:text-bone transition-colors"
                    >
                      Open Builder &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-mist">
                    No quotations match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {KANBAN_COLUMNS.map((col) => {
            const colQuotes = filteredQuotes.filter((q) => col.statuses.includes(q.status));
            return (
              <div
                key={col.id}
                className={`flex flex-col rounded-[20px] p-4 border border-ink/8 ${col.bg} sm:min-h-[460px]`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                  <h3 className="text-[13.5px] font-semibold text-ink">{col.title}</h3>
                  <span className="flex size-5 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-mist">
                    {colQuotes.length}
                  </span>
                </div>

                <div className="mt-3 space-y-3 flex-1">
                  {colQuotes.map((q) => (
                    <Link
                      key={q.id}
                      href={`/quotations/${q.id}`}
                      className="block rounded-[16px] bg-white p-4 card-shadow hover:border-ink/20 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-mist group-hover:text-ink">{q.reference}</span>
                        <span className="text-mist">{timeAgo(q.last_activity_at)}</span>
                      </div>
                      <p className="mt-1.5 font-medium text-[14px] text-ink group-hover:underline">
                        {q.customer_name}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-semibold tabular-nums text-[13.5px] text-ink">
                          {inr(q.grand_total)}
                        </span>
                        <RiskBadge score={q.blended_risk_score} requiredLevel={q.required_level} size="sm" />
                      </div>
                    </Link>
                  ))}
                  {colQuotes.length === 0 ? (
                    <div className="flex h-32 items-center justify-center rounded-[16px] border border-dashed border-ink/10 text-[12px] text-mist">
                      No deals in this stage
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
