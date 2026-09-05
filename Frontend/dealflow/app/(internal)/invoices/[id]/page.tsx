"use client";

import React, { useState, use, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  CheckCircle,
  FileText,
  Clock,
  Printer,
  ShieldCheck,
  X,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, useMutation, inr, timeAgo } from "@/lib/hooks";

interface InvoiceLine {
  id: number;
  product_id: number;
  description: string;
  qty: string;
  unit_price: string;
  net_amount: string;
  tax_amount: string;
}

interface Payment {
  id: number;
  amount: string;
  method: string;
  reference: string;
  received_at: string;
}

interface InvoiceDetail {
  invoice: {
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
    created_at: string;
  };
  lines: InvoiceLine[];
  payments: Payment[];
}

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;

  const { data: invRes, loading, error, refetch } = useFetch<InvoiceDetail>(
    `/v1/invoices/${invoiceId}`
  );
  const detail = invRes;
  const invoice = detail?.invoice;
  const lines = detail?.lines ?? [];
  const payments = detail?.payments ?? [];

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [paymentRef, setPaymentRef] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const { trigger: recordPayment, loading: paying } = useMutation();

  const total = parseFloat(invoice?.total ?? "0") || 0;
  const paid = parseFloat(invoice?.amount_paid ?? "0") || 0;
  const balanceDue = Math.max(0, total - paid);

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    try {
      await recordPayment(`/v1/invoices/${invoice.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(amountInput).toFixed(2),
          method: paymentMethod,
          reference: paymentRef.trim() || `PAY-${Date.now().toString().slice(-4)}`,
        }),
      });
      setPaymentModalOpen(false);
      setNotice(`Payment of ${inr(amountInput)} recorded successfully!`);
      refetch();
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(`Payment error: ${err.message}`);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to Invoices
        </Link>
        <div className="rounded-[20px] bg-rose-50 border border-rose-200 p-6 text-center">
          <p className="font-semibold text-rose-900">Failed to load invoice</p>
          <p className="text-[13px] text-rose-700 mt-1">{error?.message ?? "Invoice not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white shadow-xs hover:bg-cream transition-colors text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[26px] font-medium tracking-tight text-ink sm:text-[30px]">
                Invoice {invoice.reference} ({invoice.customer_name})
              </h1>
              <StatusBadge status={invoice.status} size="sm" />
            </div>
            <p className="text-[12.5px] text-mist">
              Order:{" "}
              <Link href={`/subscriptions/${invoice.sales_order_id}`} className="hover:underline font-mono text-ink font-semibold">
                {invoice.order_reference}
              </Link>{" "}
              &middot; Issued: <strong>{new Date(invoice.issue_date).toLocaleDateString()}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink shadow-xs hover:bg-cream transition-colors"
          >
            <Printer className="size-3.5" /> Print / PDF
          </button>

          {balanceDue > 0 && (
            <button
              type="button"
              onClick={() => {
                setAmountInput(String(balanceDue));
                setPaymentRef(`UTR-${Date.now().toString().slice(-6)}`);
                setPaymentModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 shadow-xs transition-colors"
            >
              <CreditCard className="size-3.5" /> Record Payment
            </button>
          )}
        </div>
      </div>

      <LifecycleBar currentStage="BILLING" quoteId={String(invoice.sales_order_id)} />

      {notice && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-700" />
          {notice}
        </div>
      )}

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12px] font-medium text-mist">Total Invoiced</p>
          <p className="mt-2 text-[26px] font-serif font-bold text-ink tabular-nums">
            {inr(invoice.total)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-mist">Including tax subtotal</p>
        </div>

        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12px] font-medium text-mist">Amount Settled</p>
          <p className="mt-2 text-[26px] font-serif font-bold text-emerald-800 tabular-nums">
            {inr(invoice.amount_paid)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-emerald-900 font-medium">Reconciled payments</p>
        </div>

        <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs">
          <p className="text-[12px] font-medium text-mist">Balance Outstanding</p>
          <p className="mt-2 text-[26px] font-serif font-bold text-ink tabular-nums">
            {inr(balanceDue)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-amber-800 font-medium">
            {balanceDue > 0 ? "Pending remittance" : "Settled in full"}
          </p>
        </div>
      </div>

      {/* Itemized Lines */}
      <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
        <div className="px-6 py-4 border-b border-ink/6 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Itemized Billed Deliverables</h2>
          <span className="text-[12px] font-mono text-mist">{lines.length} lines</span>
        </div>

        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
            <tr>
              <th className="px-6 py-3">Description</th>
              <th className="px-6 py-3">Qty</th>
              <th className="px-6 py-3">Unit Price</th>
              <th className="px-6 py-3">Tax</th>
              <th className="px-6 py-3 text-right">Net Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {lines.map((l) => (
              <tr key={l.id} className="hover:bg-cream/30">
                <td className="px-6 py-3.5 font-medium text-ink">{l.description}</td>
                <td className="px-6 py-3.5 font-mono">{l.qty}</td>
                <td className="px-6 py-3.5 font-mono tabular-nums text-mist">{inr(l.unit_price)}</td>
                <td className="px-6 py-3.5 font-mono text-[12px] text-mist">{inr(l.tax_amount)}</td>
                <td className="px-6 py-3.5 font-mono font-bold tabular-nums text-ink text-right">
                  {inr(l.net_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Subtotals */}
        <div className="bg-ink/[0.015] px-6 py-4 border-t border-ink/6 flex flex-col items-end gap-1.5 text-[13px]">
          <div className="flex justify-between w-64 text-mist">
            <span>Subtotal:</span>
            <span className="font-mono">{inr(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between w-64 text-mist">
            <span>Tax Total:</span>
            <span className="font-mono">{inr(invoice.tax_total)}</span>
          </div>
          <div className="flex justify-between w-64 pt-2 border-t border-ink/10 font-bold text-[16px] text-ink">
            <span>Invoice Total:</span>
            <span className="font-mono">{inr(invoice.total)}</span>
          </div>
        </div>
      </div>

      {/* Payment Settlement History */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <h2 className="text-[16px] font-semibold text-ink pb-3 border-b border-ink/6">
          Remittance &amp; Payment Trail
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Reference / UTR</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5 text-right">Amount Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 text-mist text-[12px]">
                    {timeAgo(p.received_at)}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-ink">{p.reference}</td>
                  <td className="px-4 py-3 text-mist">{p.method}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-800 text-right">
                    {inr(p.amount)}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-mist">
                    No payments received yet for this invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-xl border border-ink/10 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <div>
                <h3 className="font-semibold text-[16px] text-ink">Record Remittance</h3>
                <p className="text-[12px] text-mist">{invoice.reference} &middot; Balance Due: {inr(balanceDue)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="size-7 rounded-full flex items-center justify-center text-mist hover:text-ink hover:bg-cream"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-ink mb-1">
                  Amount Received (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-cream/30 p-2.5 font-mono text-[14px] text-ink focus:outline-hidden focus:border-ink"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-ink mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-cream/30 p-2.5 text-[13px] text-ink focus:outline-hidden focus:border-ink"
                >
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT / RTGS</option>
                  <option value="UPI">UPI Instant</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-ink mb-1">
                  Reference / UTR Number
                </label>
                <input
                  type="text"
                  required
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. UTR-8291038"
                  className="w-full rounded-xl border border-ink/15 bg-cream/30 p-2.5 font-mono text-[13px] text-ink focus:outline-hidden focus:border-ink"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/6">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[12.5px] font-medium text-mist hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paying || !amountInput}
                  className="rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
                >
                  {paying ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
