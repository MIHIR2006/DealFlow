"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, LayoutList, Columns, Search, Filter, ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { MarginBar } from "@/components/ui/margin-bar";
import { quotes, QuoteRow } from "@/lib/demo/dashboard";

type ViewMode = "table" | "kanban";

const KANBAN_COLUMNS = [
  { id: "Draft", title: "Draft", bg: "bg-cream/50" },
  { id: "Pending Approval", title: "Pending Approval", bg: "bg-amber-500/5" },
  { id: "Under negotiation", title: "Under Negotiation", bg: "bg-purple-500/5" },
  { id: "Approved", title: "Approved / Ready", bg: "bg-cream/80" },
  { id: "Confirmed", title: "Confirmed / Won", bg: "bg-emerald-500/5" },
];

export default function QuotationsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");

  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const matchSearch =
        q.id.toLowerCase().includes(search.toLowerCase()) ||
        q.customer.toLowerCase().includes(search.toLowerCase()) ||
        q.owner.toLowerCase().includes(search.toLowerCase());

      const matchStage =
        stageFilter === "ALL" ||
        (stageFilter === "PENDING" &&
          (q.status === "Pending Manager" || q.status === "Pending Finance")) ||
        (stageFilter === "DRAFT" && q.status === "Draft") ||
        (stageFilter === "NEGOTIATION" && q.status === "Under negotiation") ||
        (stageFilter === "APPROVED" && q.status === "Approved");

      return matchSearch && matchStage;
    });
  }, [search, stageFilter]);

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
          <div className="flex items-center rounded-full border border-ink/10 bg-white/80 p-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-ink text-bone"
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
                  ? "bg-ink text-bone"
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-3 card-shadow">
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
              { id: "ALL", label: "All (6)" },
              { id: "DRAFT", label: "Draft" },
              { id: "PENDING", label: "Pending Approval" },
              { id: "NEGOTIATION", label: "Negotiating" },
              { id: "APPROVED", label: "Approved" },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStageFilter(st.id)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  stageFilter === st.id
                    ? "bg-white text-ink"
                    : "text-mist hover:text-ink"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Tier Filter */}
          <div className="relative">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="appearance-none rounded-full border border-ink/10 bg-white px-3.5 py-1.5 pr-8 text-[12px] text-ink font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Customer Tiers</option>
              <option value="GOLD">Gold Tier (15% Max)</option>
              <option value="SILVER">Silver Tier (10% Max)</option>
              <option value="BRONZE">Bronze Tier (5% Max)</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-mist pointer-events-none" />
          </div>
        </div>
      </div>

      {/* VIEW A: DENSE TABLE */}
      {viewMode === "table" ? (
        <div className="overflow-hidden rounded-[24px] bg-white card-shadow">
          <table className="w-full text-left text-[13.5px]">
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
                <tr
                  key={q.id}
                  className="hover:bg-cream/40 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-ink">
                    <Link href={`/quotations/${q.id}`} className="hover:underline">
                      {q.id}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{q.customer}</span>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded tone-warn text-warn border border-transparent">
                        Gold
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={q.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 font-semibold tabular-nums text-ink">
                    {q.amount}
                  </td>
                  <td className="px-6 py-4">
                    <RiskBadge score={q.risk} size="sm" />
                  </td>
                  <td className="px-6 py-4 text-mist">{q.owner}</td>
                  <td className="px-6 py-4 text-mist text-[12.5px]">{q.updated}</td>
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
            </tbody>
          </table>
        </div>
      ) : (
        /* VIEW B: KANBAN PIPELINE VIEW (SALES-03) */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {KANBAN_COLUMNS.map((col) => {
            const colQuotes = quotes.filter((q) => {
              if (col.id === "Draft") return q.status === "Draft";
              if (col.id === "Pending Approval")
                return (
                  q.status === "Pending Manager" || q.status === "Pending Finance"
                );
              if (col.id === "Under negotiation")
                return q.status === "Under negotiation";
              if (col.id === "Approved") return q.status === "Approved";
              return false;
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
                        <span className="font-semibold text-mist group-hover:text-ink">
                          {q.id}
                        </span>
                        <span className="text-mist">{q.updated}</span>
                      </div>

                      <p className="mt-1.5 font-medium text-[14px] text-ink group-hover:underline">
                        {q.customer}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-semibold tabular-nums text-[13.5px] text-ink">
                          {q.amount}
                        </span>
                        <RiskBadge score={q.risk} size="sm" />
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
