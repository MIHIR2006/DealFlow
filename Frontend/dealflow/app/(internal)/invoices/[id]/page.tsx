"use client";

import React, { useState, use } from "react";
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
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id || "INV-9042-OT";

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("235000");
  const [paymentMethod, setPaymentMethod] = useState("NEFT");
  const [paymentRef, setPaymentRef] = useState("UTR-2026-991823");

  // Invoice state
  const [invoice, setInvoice] = useState({
    id: invoiceId,
    customer: "Acme Corporation",
    orderRef: "SO-9042",
    date: "Aug 22, 2026",
    dueDate: "Sep 15, 2026",
    subtotal: 411016.95,
    taxTotal: 73983.05,
    grandTotal: 485000,
    paidAmount: 250000,
    status: "PARTIAL" as "POSTED" | "PARTIAL" | "PAID",
    payments: [
      {
        id: "pay_1",
        date: "Aug 22, 2026",
        amount: 250000,
        method: "Bank Transfer (NEFT)",
        reference: "UTR-8391024",
      },
    ],
  });

  const balanceDue = Math.max(0, invoice.grandTotal - invoice.paidAmount);

  function handleRecordPayment() {
    const amt = parseFloat(amountInput) || 0;
    const newPaid = invoice.paidAmount + amt;
    const newStatus = newPaid >= invoice.grandTotal ? "PAID" : "PARTIAL";

    setInvoice((prev) => ({
      ...prev,
      paidAmount: newPaid,
      status: newStatus,
      payments: [
        ...prev.payments,
        {
          id: `pay_${Date.now()}`,
          date: "Today, Just now",
          amount: amt,
          method: paymentMethod,
          reference: paymentRef,
        },
      ],
    }));

    setPaymentModalOpen(false);
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
                {invoice.id}
              </h1>
              <StatusBadge status={invoice.status} size="sm" />
            </div>
            <p className="text-[12.5px] text-mist">
              Customer: <strong>{invoice.customer}</strong> &middot; Order:{" "}
              <strong>{invoice.orderRef}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink shadow-xs hover:bg-cream transition-colors"
          >
            <Printer className="size-3.5" /> Print Invoice
          </button>

          {invoice.status !== "PAID" && (
            <button
              type="button"
              onClick={() => {
                setAmountInput(String(balanceDue));
                setPaymentModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-800 shadow-xs transition-colors"
            >
              <CreditCard className="size-3.5" /> Record Payment
            </button>
          )}
        </div>
      </div>

      <LifecycleBar currentStage="PAID" />

      {/* Main Invoice Card */}
      <div className="rounded-[24px] bg-white p-8 border border-ink/8 shadow-xs space-y-6 max-w-4xl mx-auto">
        {/* Invoice Header Details */}
        <div className="flex flex-wrap justify-between gap-4 pb-6 border-b border-ink/8">
          <div>
            <h2 className="font-headline font-bold text-[20px] text-ink">
              Tax Invoice
            </h2>
            <p className="font-mono text-[13px] text-mist mt-0.5">
              Invoice Ref: {invoice.id}
            </p>
            <div className="mt-3 text-[12.5px] text-ink/80">
              <p className="font-semibold text-ink">Billed To:</p>
              <p>{invoice.customer}</p>
              <p>7th Block, Koramangala Industrial Area</p>
              <p>Bengaluru, Karnataka 560095</p>
              <p className="font-mono text-[11.5px] text-mist mt-1">
                GSTIN: 29AAACA1234F1Z5
              </p>
            </div>
          </div>

          <div className="text-right text-[12.5px] space-y-1.5 text-mist">
            <div>
              <span>Issue Date:</span>{" "}
              <strong className="text-ink">{invoice.date}</strong>
            </div>
            <div>
              <span>Due Date:</span>{" "}
              <strong className="text-ink">{invoice.dueDate}</strong>
            </div>
            <div className="pt-2">
              <span className="text-[11px] uppercase font-semibold text-mist block">
                Balance Outstanding
              </span>
              <p className="font-serif text-[26px] font-bold text-ink tabular-nums mt-0.5">
                &#8377;{balanceDue.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>

        {/* Invoice Items Table */}
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] font-semibold uppercase tracking-wider text-mist border-b border-ink/8">
            <tr>
              <th className="py-2.5">Item Description</th>
              <th className="py-2.5">Qty</th>
              <th className="py-2.5">Rate</th>
              <th className="py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            <tr>
              <td className="py-3.5">
                <p className="font-medium text-ink">Laptop Pro 16&quot;</p>
                <p className="font-mono text-[11px] text-mist">HW-LP-16 (12% Discount Applied)</p>
              </td>
              <td className="py-3.5 font-mono">2</td>
              <td className="py-3.5 font-mono">&#8377;1,93,600</td>
              <td className="py-3.5 text-right font-mono font-semibold text-ink">
                &#8377;3,87,200
              </td>
            </tr>
            <tr>
              <td className="py-3.5">
                <p className="font-medium text-ink">Setup &amp; Migration Service</p>
                <p className="font-mono text-[11px] text-mist">SRV-SETUP-PRO (18% Discount Approved)</p>
              </td>
              <td className="py-3.5 font-mono">1</td>
              <td className="py-3.5 font-mono">&#8377;36,900</td>
              <td className="py-3.5 text-right font-mono font-semibold text-ink">
                &#8377;36,900
              </td>
            </tr>
          </tbody>
        </table>

        {/* Invoice Totals */}
        <div className="pt-4 border-t border-ink/8 flex flex-col items-end text-[13px] space-y-1.5">
          <div className="flex justify-between w-64 text-mist">
            <span>Taxable Subtotal:</span>
            <span className="font-mono font-medium text-ink">
              &#8377;{invoice.subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between w-64 text-mist">
            <span>GST (18%):</span>
            <span className="font-mono font-medium text-ink">
              &#8377;{invoice.taxTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between w-64 text-[15px] font-bold text-ink pt-1.5 border-t border-ink/6">
            <span>Invoice Total:</span>
            <span className="font-mono">
              &#8377;{invoice.grandTotal.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex justify-between w-64 text-emerald-800 font-semibold pt-1">
            <span>Total Paid to Date:</span>
            <span className="font-mono tabular-nums">
              &#8377;{invoice.paidAmount.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Payments Applied History Table */}
        <div className="pt-6 border-t border-ink/8">
          <h3 className="text-[14px] font-semibold text-ink mb-3">
            Payments Applied History
          </h3>

          <div className="rounded-[16px] bg-cream/30 border border-ink/6 overflow-hidden">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-[11px] text-mist border-b border-ink/6 bg-ink/[0.02]">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 text-mist">{p.date}</td>
                    <td className="px-4 py-2.5 font-medium text-ink">{p.method}</td>
                    <td className="px-4 py-2.5 font-mono text-mist">{p.reference}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-800">
                      &#8377;{p.amount.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl border border-ink/10">
            <h3 className="text-[17px] font-semibold text-ink">
              Record Commercial Payment
            </h3>
            <p className="text-[12.5px] text-mist mt-1">
              Apply customer funds against invoice {invoice.id}. Partial payments will update status to <strong>PARTIAL</strong>.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-ink block mb-1">
                  Payment Amount (INR)
                </label>
                <input
                  type="number"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 p-2.5 font-mono text-[14px] font-bold"
                />
                <span className="text-[11px] text-mist mt-1 block">
                  Remaining balance due: &#8377;{balanceDue.toLocaleString("en-IN")}
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
                  <option value="NEFT">Bank Transfer (NEFT / RTGS)</option>
                  <option value="CARD">Corporate Credit Card</option>
                  <option value="CHEQUE">Cheque / Demand Draft</option>
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-ink block mb-1">
                  Transaction / UTR Reference
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 p-2.5 font-mono text-[13px]"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/8">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-mist hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                className="rounded-full bg-emerald-700 text-white px-5 py-2 text-[13px] font-semibold hover:bg-emerald-800 shadow-xs"
              >
                Post Payment &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
