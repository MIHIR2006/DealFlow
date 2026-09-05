"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  User,
  CheckCircle,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { useFetch, inr } from "@/lib/hooks";

interface ReportRow {
  rep_name: string;
  sales_team: string;
  category_name: string;
  quotation_count: number;
  net_revenue: string;
  margin: string;
  discount_given: string;
}

interface SalesReportData {
  summary: {
    total_quotations: number;
    pipeline_value: string;
    won_value: string;
    avg_margin_pct: string;
    awaiting_approval: number;
    avg_risk_score: string;
  };
  rows: ReportRow[];
}

export default function ReportsPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.append("status", statusFilter);
    const qs = params.toString();
    return `/v1/reports${qs ? `?${qs}` : ""}`;
  }, [statusFilter]);

  const { data: reportRes, loading } = useFetch<SalesReportData>(queryPath);
  const report = reportRes;
  const summary = report?.summary;
  const rows = report?.rows ?? [];

  function handleExportCSV() {
    if (!rows.length) return;
    let csv = "Rep Name,Sales Team,Category,Deals,Net Revenue,Margin %,Discount Given\n";
    rows.forEach((r) => {
      csv += `"${r.rep_name}","${r.sales_team}","${r.category_name}",${r.quotation_count},${r.net_revenue},${r.margin},${r.discount_given}\n`;
    });
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "DealFlow360_Sales_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Business Intelligence &amp; Audit</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Executive Sales &amp; Governance Reports
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            Comprehensive reporting across discount discipline, approval velocity, gross margin health, and product revenue mix.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-medium text-ink shadow-xs hover:bg-cream transition-colors"
          >
            <FileSpreadsheet className="size-3.5 text-emerald-700" /> Export CSV / XLS
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 shadow-xs transition-colors"
          >
            <Printer className="size-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* KPI Highlight Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12px] font-medium text-mist">Closed Won Revenue</p>
          <p className="mt-2 text-[26px] font-serif font-bold text-ink tracking-tight tabular-nums">
            {summary?.won_value ? inr(summary.won_value) : "—"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-emerald-800 font-medium">Contracted Deal Volume</p>
        </div>

        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12px] font-medium text-mist">Active Pipeline</p>
          <p className="mt-2 text-[26px] font-serif font-bold text-ink tracking-tight tabular-nums">
            {summary?.pipeline_value ? inr(summary.pipeline_value) : "—"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-mist font-medium">
            {summary?.total_quotations ?? 0} active quotations
          </p>
        </div>

        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12px] font-medium text-mist">Average Margin</p>
          <p className="mt-2 text-[26px] font-serif font-bold text-emerald-800 tracking-tight tabular-nums">
            {summary?.avg_margin_pct ?? "—"}%
          </p>
          <p className="mt-0.5 text-[11.5px] text-mist font-medium">Across all categories</p>
        </div>

        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12px] font-medium text-mist">Avg Blended Risk</p>
          <p className="mt-2 text-[26px] font-serif font-bold text-ink tracking-tight tabular-nums">
            {summary?.avg_risk_score ?? "—"}%
          </p>
          <p className="mt-0.5 text-[11.5px] text-mist font-medium">Discount overage index</p>
        </div>
      </div>

      {/* Interactive Filter Bar */}
      <div className="rounded-[20px] bg-white p-4 border border-ink/8 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-mist" />
          <span className="text-[13px] font-semibold text-ink">Quotation Status Filter:</span>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-cream/40 p-1 border border-ink/8 text-[12px]">
          {["ALL", "DRAFT", "PENDING_APPROVAL", "UNDER_NEGOTIATION", "APPROVED", "CONFIRMED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                statusFilter === st
                  ? "bg-ink text-bone shadow-xs"
                  : "text-mist hover:text-ink"
              }`}
            >
              {st === "ALL" ? "All Deals" : st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Aggregate Report Breakdown Table */}
      <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
        <div className="px-6 py-4 border-b border-ink/6 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">
            Sales Performance by Rep, Team &amp; Category
          </h2>
          <span className="text-[12px] font-mono text-mist">
            {rows.length} {rows.length === 1 ? "entry" : "entries"} aggregated
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-6 py-3.5">Sales Rep</th>
                <th className="px-6 py-3.5">Team</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Deals</th>
                <th className="px-6 py-3.5">Net Revenue</th>
                <th className="px-6 py-3.5">Discount Given</th>
                <th className="px-6 py-3.5 text-right">Gross Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {loading && rows.length === 0 && (
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

              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-cream/40 transition-colors">
                  <td className="px-6 py-4 font-semibold text-ink">{row.rep_name}</td>
                  <td className="px-6 py-4 text-mist text-[12.5px]">{row.sales_team}</td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-ink">{row.category_name}</span>
                  </td>
                  <td className="px-6 py-4 font-mono font-medium">{row.quotation_count}</td>
                  <td className="px-6 py-4 font-mono font-bold text-ink">
                    {inr(row.net_revenue)}
                  </td>
                  <td className="px-6 py-4 font-mono text-amber-800">
                    {inr(row.discount_given)}
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold text-right text-emerald-800">
                    {row.margin}%
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-mist">
                    <BarChart3 className="size-8 mx-auto mb-2 text-mist opacity-60" />
                    <p className="font-medium text-[14px] text-ink">No report records found</p>
                    <p className="text-[12.5px] mt-0.5">
                      No quotations currently match the selected status filter.
                    </p>
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
