"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { CreditCard, DollarSign, ArrowRight, CheckCircle, Clock, Plus, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, useMutation, inr } from "@/lib/hooks";

interface InvoiceRow {
  id: number;
  reference: string;
  sales_order_id: number;
  order_reference: string;
  customer_name: string;
  kind: string;
  status: string;
  issue_date: string;
  due_date?: string;
  subtotal: string;
  tax_total: string;
  total: string;
  amount_paid: string;
}

export default function InvoicesPage() {
  const { data: res, loading, error, refetch } = useFetch<{ data: InvoiceRow[] }>("/v1/invoices");
  const invoices = res?.data ?? [];

  const [filter, setFilter] = useState("ALL");

  // Payment Modal state
  const [payingInvoice, setPayingInvoice] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("BANK_TRANSFER");
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  const { trigger: recordPayment, loading: paying } = useMutation();

  const filteredInvoices = useMemo(() => {
    if (filter === "ALL") return invoices;
    return invoices.filter((inv) => inv.status === filter);
  }, [invoices, filter]);

  const totalOutstanding = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      const tot = parseFloat(inv.total) || 0;
      const paid = parseFloat(inv.amount_paid) || 0;
      return sum + Math.max(0, tot - paid);
    }, 0);
  }, [invoices]);

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payingInvoice) return;
    try {
      await recordPayment(`/v1/invoices/${payingInvoice.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(payAmount).toFixed(2),
          method: payMethod,
          reference: `PAY-${Date.now().toString().slice(-4)}`,
        }),
      });
      setPaymentNotice(`Payment of ${inr(payAmount)} successfully recorded for ${payingInvoice.reference}!`);
      setPayingInvoice(null);
      setPayAmount("");
      refetch();
      setTimeout(() => setPaymentNotice(null), 5000);
    } catch (err: any) {
      alert(`Payment error: ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Billing &amp; Collections</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Invoices &amp; Cash Settlement
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            Track posted invoices, record full or partial payments, and view cash flow reconciled against one-time orders and subscription schedules.
          </p>
        </div>

        {/* Financial Summary */}
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink shadow-xs">
            Outstanding AR:{" "}
            <span className="text-amber-800 font-mono">{inr(totalOutstanding)}</span>
          </div>
        </div>
      </div>

      {paymentNotice && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-700" />
          {paymentNotice}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-full bg-white p-1 border border-ink/8 shadow-xs w-fit">
        {[
          { id: "ALL", label: `All Invoices (${invoices.length})` },
          { id: "POSTED", label: "Unpaid / Posted" },
          { id: "PARTIAL", label: "Partially Paid" },
          { id: "PAID", label: "Settled / Paid" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              filter === f.id
                ? "bg-ink text-bone shadow-xs"
                : "text-mist hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
            <tr>
              <th className="px-6 py-3.5">Invoice #</th>
              <th className="px-6 py-3.5">Customer &amp; Order</th>
              <th className="px-6 py-3.5">Kind</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Total Amount</th>
              <th className="px-6 py-3.5">Paid Amount</th>
              <th className="px-6 py-3.5">Balance Due</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {loading && invoices.length === 0 && (
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

            {filteredInvoices.map((inv) => {
              const total = parseFloat(inv.total) || 0;
              const paid = parseFloat(inv.amount_paid) || 0;
              const due = Math.max(0, total - paid);

              return (
                <tr
                  key={inv.id}
                  className="hover:bg-cream/40 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4 font-mono font-medium text-ink">
                    {inv.reference}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-ink">{inv.customer_name}</p>
                    <p className="text-[11.5px] text-mist font-mono">
                      Order: {inv.order_reference}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-mist font-medium">
                    {inv.kind === "RECURRING_PERIOD" ? "Subscription Cycle" : "One-Time Order"}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={inv.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold tabular-nums text-ink">
                    {inr(inv.total)}
                  </td>
                  <td className="px-6 py-4 font-mono tabular-nums text-emerald-800">
                    {inr(inv.amount_paid)}
                  </td>
                  <td className="px-6 py-4 font-mono font-bold tabular-nums text-ink">
                    {inr(due)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {due > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPayingInvoice(inv);
                          setPayAmount(String(due));
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-bone hover:bg-ink/90 shadow-xs transition-colors"
                      >
                        Record Payment <ArrowRight className="size-3" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-800">
                        <CheckCircle className="size-3.5" /> Paid in Full
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {!loading && filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-mist">
                  <CreditCard className="size-8 mx-auto mb-2 text-mist opacity-60" />
                  <p className="font-medium text-[14px] text-ink">No invoices found</p>
                  <p className="text-[12.5px] mt-0.5">
                    Generate an invoice from an active order to start cash reconciliation.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Recording Modal */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-xl border border-ink/10 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <div>
                <h3 className="font-semibold text-[16px] text-ink">Record Payment</h3>
                <p className="text-[12px] text-mist">{payingInvoice.reference} &middot; {payingInvoice.customer_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPayingInvoice(null)}
                className="size-7 rounded-full flex items-center justify-center text-mist hover:text-ink hover:bg-cream"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-ink mb-1">
                  Payment Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-cream/30 p-2.5 font-mono text-[14px] text-ink focus:outline-hidden focus:border-ink"
                />
                <p className="text-[11px] text-mist mt-1">
                  Invoice total: {inr(payingInvoice.total)} &middot; Outstanding: {inr(Math.max(0, parseFloat(payingInvoice.total) - parseFloat(payingInvoice.amount_paid)))}
                </p>
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-ink mb-1">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-cream/30 p-2.5 text-[13px] text-ink focus:outline-hidden focus:border-ink"
                >
                  <option value="BANK_TRANSFER">Direct Bank Transfer / NEFT / RTGS</option>
                  <option value="UPI">UPI / Instant Settlement</option>
                  <option value="CREDIT_CARD">Corporate Credit Card</option>
                  <option value="CHEQUE">Commercial Cheque</option>
                </select>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/6">
                <button
                  type="button"
                  onClick={() => setPayingInvoice(null)}
                  className="rounded-full px-4 py-2 text-[12.5px] font-medium text-mist hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paying || !payAmount}
                  className="rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
                >
                  {paying ? "Submitting..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
