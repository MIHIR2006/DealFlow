"use client";

import React, { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useFetch, inr } from "@/lib/hooks";
import type { Category, Page, SalesReport } from "@/lib/types";

const STATUS_OPTIONS = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "UNDER_NEGOTIATION",
  "CONFIRMED",
  "REJECTED",
];

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function ReportsPage() {
  // Draft filter inputs (only take effect once "Apply filters" is pressed).
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [salesTeamInput, setSalesTeamInput] = useState("");
  const [statusInput, setStatusInput] = useState("ALL");
  const [categoryInput, setCategoryInput] = useState("ALL");

  // Applied filters — this is what actually drives the fetch.
  const [applied, setApplied] = useState({
    from: "",
    to: "",
    sales_team: "",
    status: "",
    category_id: "",
  });

  const { data: categoriesPage } = useFetch<Page<Category>>("/v1/categories");
  const categories = categoriesPage?.data ?? [];

  const reportPath = useMemo(
    () => `/v1/reports${buildQuery(applied)}`,
    [applied],
  );

  const {
    data: report,
    loading,
    error,
    refetch,
  } = useFetch<SalesReport>(reportPath);

  function applyFilters() {
    setApplied({
      from: fromInput,
      to: toInput,
      sales_team: salesTeamInput,
      status: statusInput === "ALL" ? "" : statusInput,
      category_id: categoryInput === "ALL" ? "" : categoryInput,
    });
  }

  function handleExportCSV() {
    const rows = report?.rows ?? [];
    const header = [
      "Rep",
      "Sales Team",
      "Category",
      "Quotation Count",
      "Net Revenue",
      "Margin",
      "Discount Given",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.rep_name,
          r.sales_team,
          r.category_name,
          r.quotation_count,
          r.net_revenue,
          r.margin,
          r.discount_given,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "DealFlow360_Sales_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleExportPDF() {
    window.print();
  }

  const appliedCategoryName = useMemo(() => {
    if (!report?.applied_filter.category_id) return null;
    return (
      categories.find((c) => c.id === report.applied_filter.category_id)?.name ??
      `#${report.applied_filter.category_id}`
    );
  }, [report, categories]);

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
            Aggregate performance across sales teams, reps, and product categories, computed
            server-side over the current filter set.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-medium text-ink whitespace-nowrap hover:bg-cream transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="size-3.5 text-ok" /> Export CSV / XLS
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone whitespace-nowrap hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            <Printer className="size-3.5" />
            Export Executive PDF
          </button>
        </div>
      </div>

      {/* 4 MANDATORY FILTERS (Spec A7) */}
      <div className="rounded-[20px] bg-white p-4 card-shadow space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Filter 1: Period */}
          <div>
            <label className="text-[11.5px] font-semibold text-mist block mb-1">
              Period &mdash; From
            </label>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="w-full rounded-xl border border-ink/10 bg-cream/30 p-2 text-[12.5px] font-medium focus:outline-hidden text-ink"
            />
          </div>
          <div>
            <label className="text-[11.5px] font-semibold text-mist block mb-1">
              Period &mdash; To
            </label>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="w-full rounded-xl border border-ink/10 bg-cream/30 p-2 text-[12.5px] font-medium focus:outline-hidden text-ink"
            />
          </div>

          {/* Filter 2: Sales Team / Rep */}
          <div className="col-span-2 md:col-span-1">
            <label className="text-[11.5px] font-semibold text-mist block mb-1">
              Sales Team / Rep
            </label>
            <input
              type="text"
              value={salesTeamInput}
              onChange={(e) => setSalesTeamInput(e.target.value)}
              placeholder="e.g. Enterprise"
              className="w-full rounded-xl border border-ink/10 bg-cream/30 p-2 text-[12.5px] font-medium focus:outline-hidden text-ink"
            />
          </div>

          {/* Filter 3: Approval Status */}
          <div className="col-span-2 md:col-span-1">
            <label className="text-[11.5px] font-semibold text-mist block mb-1">
              Approval / Quotation Status
            </label>
            <div className="relative">
              <select
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                className="w-full appearance-none rounded-xl border border-ink/10 bg-cream/30 p-2 pr-8 text-[12.5px] font-medium focus:outline-hidden cursor-pointer text-ink"
              >
                <option value="ALL">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-mist pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {/* Filter 4: Product / Category */}
          <div>
            <label className="text-[11.5px] font-semibold text-mist block mb-1">
              Product Category
            </label>
            <div className="relative">
              <select
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                className="w-full appearance-none rounded-xl border border-ink/10 bg-cream/30 p-2 pr-8 text-[12.5px] font-medium focus:outline-hidden cursor-pointer text-ink"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-mist pointer-events-none" />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={applyFilters}
              className="w-full rounded-xl bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {report && (
          <p className="text-[12px] text-mist pt-1">
            Showing: {report.applied_filter.from || "any date"} &ndash;{" "}
            {report.applied_filter.to || "any date"} &middot; Team:{" "}
            {report.applied_filter.sales_team || "All"} &middot; Status:{" "}
            {report.applied_filter.status || "All"} &middot; Category:{" "}
            {appliedCategoryName || "All"}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-[18px] tone-bad p-4 border border-transparent flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-bad font-medium">
            Failed to load report: {error.message}
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

      {loading && !report && (
        <div className="flex h-40 items-center justify-center rounded-[24px] bg-white card-shadow">
          <Loader2 className="size-6 animate-spin text-mist" />
        </div>
      )}

      {report && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[20px] bg-white p-4 card-shadow sm:p-5">
              <p className="text-[12.5px] font-medium text-mist">Quotations</p>
              <p className="mt-2 text-[22px] font-serif tracking-tight text-ink tabular-nums sm:text-[26px]">
                {report.summary.total_quotations}
              </p>
            </div>
            <div className="rounded-[20px] bg-white p-4 card-shadow sm:p-5">
              <p className="text-[12.5px] font-medium text-mist">Pipeline Value</p>
              <p className="mt-2 text-[22px] font-serif tracking-tight text-ink tabular-nums sm:text-[26px]">
                {inr(report.summary.pipeline_value)}
              </p>
            </div>
            <div className="rounded-[20px] bg-white p-4 card-shadow sm:p-5">
              <p className="text-[12.5px] font-medium text-mist">Won Value</p>
              <p className="mt-2 text-[22px] font-serif tracking-tight text-ok tabular-nums sm:text-[26px]">
                {inr(report.summary.won_value)}
              </p>
            </div>
            <div className="rounded-[20px] bg-white p-4 card-shadow sm:p-5">
              <p className="text-[12.5px] font-medium text-mist">Avg Margin</p>
              <p className="mt-2 text-[22px] font-serif tracking-tight text-ok tabular-nums sm:text-[26px]">
                {report.summary.avg_margin_pct}%
              </p>
            </div>
          </div>

          {/* Rows table */}
          <div className="rounded-[24px] bg-white card-shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-ink/6">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink">
                Performance by Rep, Team &amp; Category
              </h2>
              <p className="text-[12.5px] text-mist">
                {report.rows.length} row{report.rows.length === 1 ? "" : "s"} matching the current
                filters.
              </p>
            </div>

            <div className="md:overflow-x-auto">
              <table className="stack-table w-full text-left text-[13px]">
                <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
                  <tr>
                    <th className="px-6 py-3">Rep</th>
                    <th className="px-6 py-3">Sales Team</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3 text-right">Quotations</th>
                    <th className="px-6 py-3 text-right">Net Revenue</th>
                    <th className="px-6 py-3 text-right">Margin</th>
                    <th className="px-6 py-3 text-right">Discount Given</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {report.rows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-cream/40 transition-colors">
                      <td data-stack="primary" className="px-6 py-3.5 font-medium text-ink">
                        {r.rep_name}
                      </td>
                      <td data-label="Sales team" className="px-6 py-3.5 text-mist">
                        {r.sales_team}
                      </td>
                      <td data-label="Category" className="px-6 py-3.5 text-mist">
                        {r.category_name}
                      </td>
                      <td data-label="Quotations" className="px-6 py-3.5 text-right tabular-nums text-ink">
                        {r.quotation_count}
                      </td>
                      <td
                        data-label="Net revenue"
                        className="px-6 py-3.5 text-right tabular-nums font-semibold text-ink"
                      >
                        {inr(r.net_revenue)}
                      </td>
                      <td data-label="Margin" className="px-6 py-3.5 text-right tabular-nums text-ok">
                        {r.margin}%
                      </td>
                      <td data-label="Discount given" className="px-6 py-3.5 text-right tabular-nums text-warn">
                        {r.discount_given}%
                      </td>
                    </tr>
                  ))}

                  {report.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-mist">
                        <Download className="size-8 mx-auto mb-2 opacity-40" />
                        <p className="font-medium text-[14px] text-ink">No data for this filter</p>
                        <p className="text-[12px] mt-0.5">
                          Try widening the date range or clearing a filter.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
