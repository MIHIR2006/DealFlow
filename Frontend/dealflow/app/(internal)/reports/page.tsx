"use client";

import React, { useState } from "react";
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

export default function ReportsPage() {
  const [period, setPeriod] = useState("MONTH");
  const [rep, setRep] = useState("ALL");
  const [approvalStatus, setApprovalStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");

  const [downloading, setDownloading] = useState(false);

  function handleExportPDF() {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      window.print();
    }, 800);
  }

  function handleExportCSV() {
    const csvContent =
      "data:text/csv;charset=utf-8,Quote Ref,Customer,Grand Total,Margin %,Blended Risk,Status\nQ-1042,Acme Corp,482000,21.4,5.6,Approved\nQ-1031,Beta Industries,240000,28.0,3.2,Under negotiation\nQ-1018,Northwind Trading,110000,14.0,14.0,Stalled";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "DealFlow360_Sales_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 shadow-xs transition-colors"
          >
            <Printer className="size-3.5" />
            {downloading ? "Preparing Report..." : "Export Executive PDF"}
          </button>
        </div>
      </div>

      {/* 4 MANDATORY FILTERS (Spec A7) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 rounded-[20px] bg-white p-4 border border-ink/8 shadow-xs">
        {/* Filter 1: Period */}
        <div>
          <label className="text-[11.5px] font-semibold text-mist uppercase tracking-wider block mb-1">
            Period Date Range
          </label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-cream/30 p-2 text-[12.5px] font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="TODAY">Today (Live)</option>
            <option value="WEEK">This Week</option>
            <option value="MONTH">This Month (Trailing 30d)</option>
            <option value="QUARTER">This Quarter (Q3 2026)</option>
          </select>
        </div>

        {/* Filter 2: Sales Team / Rep */}
        <div>
          <label className="text-[11.5px] font-semibold text-mist uppercase tracking-wider block mb-1">
            Sales Team / Rep
          </label>
          <select
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-cream/30 p-2 text-[12.5px] font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="ALL">All Sales Teams (Global)</option>
            <option value="RAO">J. Rao (Enterprise Rep)</option>
            <option value="MEHTA">A. Mehta (Mid-Market Rep)</option>
            <option value="IYER">S. Iyer (Commercial Rep)</option>
          </select>
        </div>

        {/* Filter 3: Approval Status */}
        <div>
          <label className="text-[11.5px] font-semibold text-mist uppercase tracking-wider block mb-1">
            Approval Routing Status
          </label>
          <select
            value={approvalStatus}
            onChange={(e) => setApprovalStatus(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-cream/30 p-2 text-[12.5px] font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED_DIRECT">Direct In-Policy (No Review)</option>
            <option value="MANAGER_APPROVED">Manager Approved (Tier 1)</option>
            <option value="FINANCE_APPROVED">Finance Approved (Tier 2)</option>
            <option value="REJECTED">Rejected Quotations</option>
          </select>
        </div>

        {/* Filter 4: Product / Category */}
        <div>
          <label className="text-[11.5px] font-semibold text-mist uppercase tracking-wider block mb-1">
            Product Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-cream/30 p-2 text-[12.5px] font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="HARDWARE">Hardware Products</option>
            <option value="SERVICE">Professional Services</option>
            <option value="SUBSCRIPTION">Recurring Subscriptions</option>
          </select>
        </div>
      </div>

      {/* ANALYTICS VISUALS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Visual 1: Discount Distribution & Margin Discipline */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
          <h3 className="text-[15px] font-semibold text-ink">
            Discount Distribution Histogram
          </h3>
          <p className="text-[12.5px] text-mist mt-0.5">
            Quotation clustering against allowed ceilings (10% &amp; 15% thresholds).
          </p>

          <div className="mt-6 space-y-3">
            <div>
              <div className="flex justify-between text-[12.5px] mb-1 font-medium">
                <span>0% &ndash; 5% (Within Bronze Ceiling)</span>
                <span className="font-mono text-ink">14 deals (58%)</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-cream/80 overflow-hidden">
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: "58%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[12.5px] mb-1 font-medium">
                <span>5% &ndash; 10% (Silver Tier Ceiling)</span>
                <span className="font-mono text-ink">6 deals (25%)</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-cream/80 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: "25%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[12.5px] mb-1 font-medium">
                <span>10% &ndash; 15% (Gold / Manager Approval Zone)</span>
                <span className="font-mono text-amber-700">3 deals (13%)</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-cream/80 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: "13%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[12.5px] mb-1 font-medium">
                <span>&gt;15% (High Risk / Finance Approval Required)</span>
                <span className="font-mono text-rose-700 font-bold">1 deal (4%)</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-cream/80 overflow-hidden">
                <div className="h-full bg-rose-600 rounded-full" style={{ width: "4%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Visual 2: Approval Cycle Velocity */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">
              Approval Turnaround Velocity
            </h3>
            <p className="text-[12.5px] text-mist mt-0.5">
              Average elapsed hours from rep submission to final decision.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6 text-center">
                <span className="text-[11.5px] text-mist uppercase font-semibold">
                  Tier 1: Manager
                </span>
                <p className="font-serif text-[32px] font-bold text-ink mt-1 tabular-nums">
                  3.8h
                </p>
                <p className="text-[11px] text-emerald-800 mt-0.5 font-medium">
                  -1.4h vs last quarter
                </p>
              </div>

              <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6 text-center">
                <span className="text-[11.5px] text-mist uppercase font-semibold">
                  Tier 2: Finance
                </span>
                <p className="font-serif text-[32px] font-bold text-ink mt-1 tabular-nums">
                  11.2h
                </p>
                <p className="text-[11px] text-mist mt-0.5">
                  Target SLA: &lt;24 hours
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between text-[12px] text-mist">
            <span>Governance Integrity: 100% Policy Adherence</span>
            <span>Zero manual overrides bypassed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
