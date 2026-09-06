"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, Printer } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, inr, useAuth } from "@/lib/hooks";
import { InvoiceApi, ApiError } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank Transfer" },
];

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;

  const { data, loading, error, refetch } = useFetch<InvoiceDetail>(`/v1/invoices/${invoiceId}`);

  // Reconciling billing is Finance & Operations' duty; an admin keeps it for
  // platform administration. Other roles read the invoice without settling it.
  const { user } = useAuth();
  const canRecordPayment = user?.role === "FINANCE" || user?.role === "ADMIN";

  // Local invoice override — set wholesale with the server's response after
  // a payment is recorded. Never patched by hand: amount_paid and status are
  // server-computed (a partial payment correctly yields PARTIAL, not PAID).
  // Until a payment is recorded, the effective view is just what was fetched.
  const [invoiceOverride, setInvoice] = useState<InvoiceDetail | null>(null);
  const invoice = invoiceOverride ?? data ?? null;

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK");
  const [paymentRef, setPaymentRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const balanceDue = invoice
    ? Math.max(0, parseFloat(invoice.total) - parseFloat(invoice.amount_paid))
    : 0;

  function openPaymentModal() {
    setAmountInput(balanceDue > 0 ? balanceDue.toString() : "");
    setPaymentMethod("BANK");
    setPaymentRef("");
    setSubmitError(null);
    setPaymentModalOpen(true);
  }

  async function handleRecordPayment() {
    if (!invoice) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await InvoiceApi.recordPayment(invoice.id, {
        amount: amountInput,
        method: paymentMethod,
        reference: paymentRef || undefined,
      });
      setInvoice(updated);
      setPaymentModalOpen(false);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-[13px] text-mist font-medium">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-[14px] font-medium text-bad">Failed to load invoice</p>
          <p className="text-[12px] text-mist mt-1">{error?.message ?? "Invoice not found."}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:items-center">
          <Link
            href="/invoices"
            className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-cream transition-colors text-ink sm:mt-0"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-[26px] font-medium tracking-tight text-ink sm:text-[30px]">
                {invoice.reference}
              </h1>
              <StatusBadge status={invoice.status} size="sm" />
            </div>
            <p className="text-[12.5px] text-mist">
              Customer: <strong>{invoice.customer_name ?? "—"}</strong> &middot; Order:{" "}
              <strong>{invoice.order_reference ?? "—"}</strong>
            </p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-2.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink hover:bg-cream transition-colors sm:flex-none"
          >
            <Printer className="size-3.5" /> Print Invoice
          </button>

          {invoice.status !== "PAID" && canRecordPayment && (
            <button
              type="button"
              onClick={openPaymentModal}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full fill-ok px-5 py-2 text-[13px] font-semibold text-white hover:fill-ok transition-colors sm:flex-none"
            >
              <CreditCard className="size-3.5" /> Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Main Invoice Card */}
      <div className="rounded-[24px] bg-white p-5 card-shadow space-y-6 max-w-4xl mx-auto sm:p-8">
        {/* Invoice Header Details */}
        <div className="flex flex-wrap justify-between gap-4 pb-6 border-b border-ink/8">
          <div>
            <h2 className="font-headline font-bold text-[20px] text-ink">Tax Invoice</h2>
            <p className="text-[13px] text-mist mt-0.5">Invoice Ref: {invoice.reference}</p>
            <div className="mt-3 text-[12.5px] text-ink/80">
              <p className="font-semibold text-ink">Billed To:</p>
              <p>{invoice.customer_name ?? "—"}</p>
            </div>
          </div>

          <div className="text-[12.5px] space-y-1.5 text-mist sm:text-right">
            <div>
              <span>Issue Date:</span> <strong className="text-ink">{invoice.issue_date}</strong>
            </div>
            <div>
              <span>Due Date:</span> <strong className="text-ink">{invoice.due_date ?? "—"}</strong>
            </div>
            <div className="pt-2">
              <span className="text-[11px] uppercase font-semibold text-mist block">
                Balance Outstanding
              </span>
              <p className="font-serif text-[26px] font-bold text-ink tabular-nums mt-0.5">
                {inr(balanceDue)}
              </p>
            </div>
          </div>
        </div>

        {/* Invoice Items Table */}
        <table className="stack-table w-full text-left text-[13px]">
          <thead className="text-[11px] font-semibold text-mist border-b border-ink/8">
            <tr>
              <th className="py-2.5">Item Description</th>
              <th className="py-2.5">Qty</th>
              <th className="py-2.5">Rate</th>
              <th className="py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {invoice.lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-mist text-[12.5px]">
                  No line items on this invoice.
                </td>
              </tr>
            ) : (
              invoice.lines.map((line) => (
                <tr key={line.id} className="max-md:rounded-[16px] max-md:bg-cream/30">
                  <td data-stack="primary" className="py-3.5">
                    <p className="font-medium text-ink">{line.description}</p>
                  </td>
                  <td data-label="Qty" className="py-3.5">
                    {line.qty}
                  </td>
                  <td data-label="Rate" className="py-3.5">
                    {inr(line.unit_price)}
                  </td>
                  <td data-label="Amount" className="py-3.5 text-right font-semibold text-ink">
                    {inr(line.net_amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Invoice Totals */}
        <div className="pt-4 border-t border-ink/8 flex flex-col items-stretch text-[13px] space-y-1.5 sm:items-end">
          <div className="flex w-full justify-between sm:w-64 text-mist">
            <span>Taxable Subtotal:</span>
            <span className="font-medium text-ink">{inr(invoice.subtotal)}</span>
          </div>
          <div className="flex w-full justify-between sm:w-64 text-mist">
            <span>Tax:</span>
            <span className="font-medium text-ink">{inr(invoice.tax_total)}</span>
          </div>
          <div className="flex w-full justify-between sm:w-64 text-[15px] font-bold text-ink pt-1.5 border-t border-ink/6">
            <span>Invoice Total:</span>
            <span className="tabular-nums">{inr(invoice.total)}</span>
          </div>
          <div className="flex w-full justify-between sm:w-64 text-ok font-semibold pt-1">
            <span>Total Paid to Date:</span>
            <span className="tabular-nums">{inr(invoice.amount_paid)}</span>
          </div>
        </div>

        {/* Payments Applied History Table */}
        <div className="pt-6 border-t border-ink/8">
          <h3 className="text-[14px] font-semibold text-ink mb-3">Payments Applied History</h3>

          <div className="rounded-[16px] bg-cream/30 border border-ink/6 overflow-hidden">
            <table className="stack-table w-full text-left text-[12.5px]">
              <thead className="text-[11px] text-mist border-b border-ink/6 bg-cream/50">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {invoice.payments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-mist text-[12px]">
                      No payments recorded yet.
                    </td>
                  </tr>
                ) : (
                  invoice.payments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Date" className="px-4 py-2.5 text-mist">
                        {p.received_at}
                      </td>
                      <td data-label="Method" className="px-4 py-2.5 font-medium text-ink">
                        {p.method}
                      </td>
                      <td data-label="Reference" className="px-4 py-2.5 text-mist">
                        {p.reference || "—"}
                      </td>
                      <td data-label="Amount" className="px-4 py-2.5 text-right font-semibold text-ok">
                        {inr(p.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 backdrop-blur-xs p-3 sm:items-center sm:p-4">
          <div className="max-h-[calc(100svh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl border border-ink/10 sm:p-6">
            <h3 className="text-[17px] font-semibold text-ink">Record Payment</h3>
            <p className="text-[12.5px] text-mist mt-1">
              Apply customer funds against invoice {invoice.reference}. Partial payments will
              update status to <strong>PARTIAL</strong>.
            </p>

            {submitError && (
              <div className="mt-3 rounded-lg tone-bad p-2.5 text-[12px] text-bad font-medium">
                {submitError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-ink block mb-1">
                  Payment Amount (INR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 p-2.5 text-[14px] font-bold"
                />
                <span className="text-[11px] text-mist mt-1 block">
                  Remaining balance due: {inr(balanceDue)}
                </span>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-ink block mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 p-2.5 text-[13px] bg-cream/30"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-ink block mb-1">
                  Reference (optional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="UTR / transaction reference"
                  className="w-full rounded-xl border border-ink/15 p-2.5 text-[13px]"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 pt-3 border-t border-ink/8 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                disabled={submitting}
                className="rounded-full px-4 py-2.5 text-[13px] font-medium text-mist hover:text-ink disabled:opacity-50 sm:py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={submitting || !amountInput.trim()}
                className="rounded-full fill-ok text-white px-5 py-2.5 text-[13px] font-semibold hover:fill-ok disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 sm:py-2"
              >
                {submitting ? (
                  <>
                    <span className="size-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>Post Payment &rarr;</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
