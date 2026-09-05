"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  type DashFilter,
  filterQuotes,
  kpis,
  quotes,
} from "@/lib/demo/dashboard";

const filters: { id: DashFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "open", label: "Open" },
  { id: "risk", label: "At-risk" },
];

export function AnalyticsPanel() {
  const [filter, setFilter] = useState<DashFilter>("all");
  const rows = useMemo(() => filterQuotes(quotes, filter), [filter]);

  return (
    <section className="rounded-[24px] bg-white p-4 sm:p-5 card-shadow">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[18px] font-semibold tracking-tight">Analytics</h2>
        <div className="flex items-center rounded-full bg-cream/80 p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-[13px] ${
                filter === f.id ? "bg-white text-ink card-shadow" : "text-mist"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/approvals"
            className="hidden rounded-full border border-ink/10 px-3.5 py-2 text-[13px] font-medium text-ink sm:inline-flex"
          >
            View Approvals
          </Link>
          <Link
            href="/quotations"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-bone"
          >
            <Plus className="size-3.5" />
            New Quotation
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat href="/approvals" label="Pending Approvals" value={String(kpis.pendingApprovals)} hint="quotations waiting" />
        <Stat href="/quotations" label="Open Quotations" value={String(kpis.openQuotations)} hint="active deals" />
        <Stat href="/deal-health" label="At-Risk Deals" value={String(kpis.atRisk)} hint="flagged by Deal Health" warn />
        <Stat label="Pipeline" value={kpis.pipeline} hint="open + pending" />
        <Stat label="Avg. margin" value={kpis.avgMargin} hint="on open quotes" />
        <Stat label="Blended risk" value={kpis.blended} hint="Q-1042 live" warn />
      </div>

      <div className="mt-4 overflow-x-auto rounded-[16px] border border-ink/6">
        <table className="w-full min-w-[720px] text-left text-[13.5px]">
          <thead className="text-[12px] text-mist">
            <tr className="border-b border-ink/6">
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Quote</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id} className="border-b border-ink/5 last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-full bg-cream text-[11px] font-semibold">
                      {q.customer[0]}
                    </span>
                    {q.customer}
                  </span>
                </td>
                <td className="px-4 py-3 text-mist">{q.id}</td>
                <td className="px-4 py-3">{q.status}</td>
                <td className="px-4 py-3 tabular-nums">{q.amount}</td>
                <td
                  className="px-4 py-3 tabular-nums font-medium"
                  style={{
                    color: q.overage
                      ? "var(--color-status-warn)"
                      : "var(--color-status-ok)",
                  }}
                >
                  {q.risk}
                </td>
                <td className="px-4 py-3 text-mist">{q.owner}</td>
                <td className="px-4 py-3 text-mist">{q.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
  warn?: boolean;
}) {
  const inner = (
    <>
      <p className="text-[12px] text-mist">{label}</p>
      <p
        className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums"
        style={warn ? { color: "var(--color-status-warn)" } : undefined}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11.5px] text-mist">{hint}</p>
    </>
  );

  const cls = "block rounded-[16px] bg-cream/70 px-3.5 py-3";
  if (href) {
    return (
      <Link href={href} className={`${cls} transition-colors hover:bg-cream`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
