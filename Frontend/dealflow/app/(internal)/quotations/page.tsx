import Link from "next/link";
import { Plus } from "lucide-react";
import { quotes } from "@/lib/demo/dashboard";

export default function QuotationsPage() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist">Pipeline</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px]">
            Quotations
          </h1>
        </div>
        <Link
          href="/quotations"
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-bone"
        >
          <Plus className="size-3.5" />
          New Quotation
        </Link>
      </div>

      <div className="mt-8 overflow-hidden rounded-[20px] bg-white card-shadow">
        <table className="w-full min-w-[640px] text-left text-[13.5px]">
          <thead className="text-[12px] text-mist">
            <tr className="border-b border-ink/6">
              <th className="px-5 py-3 font-medium">Quote</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-b border-ink/5 last:border-0">
                <td className="px-5 py-3 font-medium">{q.id}</td>
                <td className="px-5 py-3">{q.customer}</td>
                <td className="px-5 py-3">{q.status}</td>
                <td className="px-5 py-3 tabular-nums">{q.amount}</td>
                <td
                  className="px-5 py-3 tabular-nums"
                  style={{
                    color: q.overage
                      ? "var(--color-status-warn)"
                      : "var(--color-status-ok)",
                  }}
                >
                  {q.risk}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
