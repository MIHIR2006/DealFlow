"use client";

import React, { useState, use } from "react";
import {
  FileCheck,
  MessageSquare,
  Sparkles,
  CheckCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Send,
  Sliders,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

export default function CustomerQuotationPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  // Active portal tab
  const [activeTab, setActiveTab] = useState<"QUOTE" | "NEGOTIATE">("QUOTE");

  // Portal Deal state (NO costs, NO margins, NO internal notes!)
  const [status, setStatus] = useState<string>("UNDER_NEGOTIATION");
  const [awaitingReview, setAwaitingReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Negotiation state
  const [proposedDiscount, setProposedDiscount] = useState(18);
  const [negotiationMessage, setNegotiationMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      author: "J. Rao (Sales Rep)",
      role: "Sales Executive",
      time: "Aug 21, 14:30",
      text: "Hello team Acme, please review the quotation below with the approved hardware discounts and our standard 24/7 SLA.",
    },
  ]);

  const [counterHistory, setCounterHistory] = useState<
    { id: number; proposed: number; note: string; date: string; status: string }[]
  >([]);

  // Confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Lines as visible to customer
  const lines = [
    {
      id: "l1",
      name: "Laptop Pro 16\" (64GB RAM, 1TB SSD)",
      sku: "HW-LP-16",
      qty: 2,
      unitPrice: 220000,
      discountPct: 12,
      netAmount: 387200,
      taxAmount: 69696,
      type: "One-Time Hardware",
    },
    {
      id: "l2",
      name: "Setup & Migration Service (On-Site Integration)",
      sku: "SRV-SETUP-PRO",
      qty: 1,
      unitPrice: 45000,
      discountPct: proposedDiscount, // Affected by counter-offer
      netAmount: 45000 * (1 - proposedDiscount / 100),
      taxAmount: 45000 * (1 - proposedDiscount / 100) * 0.18,
      type: "One-Time Service",
    },
    {
      id: "l3",
      name: "Enterprise Cloud Support 24/7 SLA",
      sku: "SUB-CLOUD-247",
      qty: 2,
      unitPrice: 25000,
      discountPct: 0,
      netAmount: 50000,
      taxAmount: 9000,
      type: "Monthly Subscription",
    },
  ];

  const subtotal = lines.reduce((acc, l) => acc + l.netAmount, 0);
  const totalTax = lines.reduce((acc, l) => acc + l.taxAmount, 0);
  const grandTotal = subtotal + totalTax;

  function handleSendChatMessage() {
    if (!negotiationMessage.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        author: "Acme Purchasing Team",
        role: "Client",
        time: "Just now",
        text: negotiationMessage,
      },
    ]);
    setNegotiationMessage("");
  }

  // The Magic Auto Re-Approval Loop (Spec §5 & B8)
  function handleSubmitCounterOffer() {
    // If proposed discount > 10% on setup service, this exceeds governance policy!
    const exceedsPolicy = proposedDiscount > 10;

    setCounterHistory((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        proposed: proposedDiscount,
        note: negotiationMessage || "Customer requested discount adjustment on Setup Service.",
        date: "Just now",
        status: exceedsPolicy ? "Routed for Executive Approval" : "Auto Accepted",
      },
    ]);

    if (exceedsPolicy) {
      setStatus("PENDING_APPROVAL");
      setAwaitingReview(true);
    } else {
      setStatus("UNDER_NEGOTIATION");
    }

    if (negotiationMessage.trim()) {
      handleSendChatMessage();
    }
  }

  function handleConfirmQuotation() {
    setConfirmModalOpen(false);
    setConfirmed(true);
    setStatus("CONFIRMED");
  }

  return (
    <div className="space-y-6">
      {/* Quotation Header Card */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[12px] font-semibold text-mist bg-ink/5 px-2 py-0.5 rounded">
                Ref: Q-1042
              </span>
              <StatusBadge status={status} size="md" />
            </div>
            <h1 className="font-serif mt-2 text-[28px] font-semibold tracking-tight text-ink sm:text-[34px]">
              Quotation for Acme Corporation
            </h1>
            <p className="text-[13px] text-mist mt-1">
              Issued by DealFlow360 Enterprises &middot; Offer Valid until <strong>Aug 28, 2026</strong>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11.5px] uppercase font-semibold text-mist">
              Grand Total (Incl. Taxes)
            </span>
            <p className="font-serif text-[28px] font-semibold text-ink tabular-nums mt-0.5">
              &#8377;{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11.5px] text-mist">
              Billing: One-Time Hardware + &#8377;59,000/mo Recurring
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-6 flex items-center gap-2 border-b border-ink/6 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("QUOTE")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              activeTab === "QUOTE"
                ? "bg-ink text-bone shadow-xs"
                : "text-mist hover:text-ink"
            }`}
          >
            Quotation Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("NEGOTIATE")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "NEGOTIATE"
                ? "bg-ink text-bone shadow-xs"
                : "text-mist hover:text-ink"
            }`}
          >
            <Sliders className="size-3.5" />
            Negotiate &amp; Request Changes
            {counterHistory.length > 0 && (
              <span className="size-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">
                {counterHistory.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Awaiting Review Notification Banner */}
      {awaitingReview && !confirmed && (
        <div className="rounded-[20px] bg-amber-500/10 p-5 border border-amber-500/25 flex items-start gap-3">
          <Clock className="size-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="text-[13px] text-amber-950">
            <p className="font-semibold">
              Counter-Offer Submitted &mdash; Under Executive Review
            </p>
            <p className="mt-0.5 text-amber-900/90 leading-relaxed">
              Your proposed <strong>{proposedDiscount}% discount</strong> on Setup &amp; Migration Service exceeds standard rep discretion. It has been automatically routed to senior sales management for commercial authorization. You will be notified the moment terms are finalized.
            </p>
          </div>
        </div>
      )}

      {confirmed && (
        <div className="rounded-[20px] bg-emerald-500/10 p-5 border border-emerald-500/25 flex items-start gap-3">
          <CheckCircle className="size-5 text-emerald-800 shrink-0 mt-0.5" />
          <div className="text-[13px] text-emerald-950">
            <p className="font-semibold">Quotation Officially Confirmed &amp; Accepted!</p>
            <p className="mt-0.5 text-emerald-900/90 leading-relaxed">
              Thank you for confirming order Q-1042. Sales order <strong>SO-9042</strong> has been generated and dispatched to our regional fulfillment centers. Invoices and tracking numbers will be delivered to your registered billing email.
            </p>
          </div>
        </div>
      )}

      {/* TAB 1: CLEAN QUOTATION TABLE (CUSTOMER-01) */}
      {activeTab === "QUOTE" && (
        <div className="space-y-6">
          <div className="rounded-[24px] bg-white border border-ink/8 shadow-xs overflow-hidden">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
                <tr>
                  <th className="px-6 py-3.5">Item Description</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Qty</th>
                  <th className="px-6 py-3.5">Unit Price</th>
                  <th className="px-6 py-3.5">Discount</th>
                  <th className="px-6 py-3.5 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-cream/20">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">{line.name}</p>
                      <p className="font-mono text-[11px] text-mist">{line.sku}</p>
                    </td>
                    <td className="px-6 py-4 text-[12px] text-mist">
                      {line.type}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-ink">
                      {line.qty}
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums text-mist">
                      &#8377;{line.unitPrice.toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums text-emerald-800 font-semibold">
                      {line.discountPct > 0 ? `${line.discountPct}%` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-semibold tabular-nums text-ink">
                      &#8377;{line.netAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Financial Rollup */}
            <div className="p-6 bg-ink/[0.01] border-t border-ink/6 flex flex-col items-end text-[13px] space-y-2">
              <div className="flex justify-between w-64 text-mist">
                <span>Subtotal (Excl. Tax):</span>
                <span className="font-mono tabular-nums font-medium text-ink">
                  &#8377;{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between w-64 text-mist">
                <span>Applicable GST (18%):</span>
                <span className="font-mono tabular-nums font-medium text-ink">
                  &#8377;{totalTax.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt-2 border-t border-ink/8 flex justify-between w-64 text-[16px] font-semibold text-ink">
                <span>Total Amount:</span>
                <span className="font-mono tabular-nums">
                  &#8377;{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          {!confirmed && (
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-[20px] bg-white border border-ink/8 shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab("NEGOTIATE")}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-5 py-2.5 text-[13px] font-semibold text-ink hover:bg-cream transition-colors"
              >
                <Sliders className="size-4" /> Request Commercial Revisions
              </button>

              <button
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-6 py-2.5 text-[13.5px] font-semibold text-white hover:bg-emerald-800 shadow-sm transition-all"
              >
                <CheckCircle className="size-4" /> Accept Terms &amp; Confirm Quotation
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTERACTIVE NEGOTIATION SUITE (CUSTOMER-02) */}
      {activeTab === "NEGOTIATE" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left: Counter-Discount Proposal Tool (6 cols) */}
          <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs md:col-span-6 flex flex-col justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
                Propose Counter-Discount
              </h2>
              <p className="text-[12.5px] text-mist mt-2 leading-relaxed">
                Select line item and specify the commercial discount requested. If your request exceeds policy thresholds, it will automatically enter senior executive review.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-[12px] font-semibold text-ink block mb-1">
                    Target Line Item
                  </label>
                  <select className="w-full rounded-xl border border-ink/15 p-2.5 text-[13px] font-medium bg-cream/30 focus:outline-hidden">
                    <option>Setup &amp; Migration Service (Current: 12% disc)</option>
                    <option>Laptop Pro 16&quot; (Current: 12% disc)</option>
                    <option>Enterprise Cloud Support 24/7 (Current: 0% disc)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[12.5px] font-medium mb-1.5">
                    <span className="text-ink">Proposed Discount:</span>
                    <span className="font-mono text-[14px] font-bold text-purple-800">
                      {proposedDiscount}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="1"
                    value={proposedDiscount}
                    onChange={(e) => setProposedDiscount(parseInt(e.target.value))}
                    className="w-full accent-ink cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-mist mt-1">
                    <span>5% (Standard)</span>
                    <span>18% (Executive Review)</span>
                    <span>30% (Max)</span>
                  </div>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-ink block mb-1">
                    Business Justification / Reason
                  </label>
                  <textarea
                    value={negotiationMessage}
                    onChange={(e) => setNegotiationMessage(e.target.value)}
                    placeholder="E.g., We are expanding team size next quarter and request an 18% concession on initial setup..."
                    rows={3}
                    className="w-full rounded-xl border border-ink/15 p-3 text-[13px] bg-cream/30 focus:outline-hidden"
                  />
                </div>

                {proposedDiscount > 10 && (
                  <div className="rounded-xl bg-amber-50 p-3 text-[12px] text-amber-900 border border-amber-200">
                    <strong>Notice:</strong> An 18% discount on services exceeds standard field discretion. Submitting this proposal will trigger automated managerial and financial approval routing.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-ink/6">
              <button
                type="button"
                onClick={handleSubmitCounterOffer}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors"
              >
                <Send className="size-3.5" /> Submit Counter-Offer &rarr;
              </button>
            </div>
          </div>

          {/* Right: Negotiation Thread (6 cols) */}
          <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs md:col-span-6 flex flex-col justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6 flex items-center gap-2">
                <MessageSquare className="size-4 text-mist" />
                Negotiation Thread
              </h2>

              <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-[16px] p-3.5 text-[13px] ${
                      msg.role === "Client"
                        ? "bg-purple-50 text-purple-950 ml-6 border border-purple-200"
                        : "bg-cream/50 text-ink mr-6 border border-ink/8"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium text-mist mb-1">
                      <span className="font-semibold text-ink">{msg.author}</span>
                      <span>{msg.time}</span>
                    </div>
                    <p className="leading-relaxed">{msg.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-ink/6 flex items-center gap-2">
              <input
                type="text"
                value={negotiationMessage}
                onChange={(e) => setNegotiationMessage(e.target.value)}
                placeholder="Type a message to your sales executive..."
                className="flex-1 rounded-full border border-ink/15 bg-cream/30 px-4 py-2 text-[12.5px] focus:outline-hidden"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendChatMessage();
                }}
              />
              <button
                type="button"
                onClick={handleSendChatMessage}
                className="size-8 rounded-full bg-ink text-bone flex items-center justify-center hover:bg-ink/90 transition-colors"
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER-03: LEGAL CONFIRMATION MODAL */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl border border-ink/10">
            <h3 className="text-[18px] font-semibold text-ink">
              Confirm &amp; Accept Quotation Terms
            </h3>
            <p className="text-[13px] text-mist mt-1">
              You are agreeing to enter into contract based on the following commercial terms:
            </p>

            <div className="mt-4 rounded-xl bg-cream/50 p-4 border border-ink/8 text-[13px] space-y-2">
              <div className="flex justify-between">
                <span className="text-mist">Total One-Time Charges:</span>
                <span className="font-mono font-semibold text-ink">
                  &#8377;{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-mist">Ongoing Monthly Support:</span>
                <span className="font-mono font-semibold text-emerald-800">
                  &#8377;59,000 / month
                </span>
              </div>
              <div className="pt-2 border-t border-ink/8 flex justify-between font-bold text-[14px]">
                <span>Immediate Payment Due:</span>
                <span className="font-mono">
                  &#8377;{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 text-[12px] text-ink/80">
              <input
                type="checkbox"
                id="terms"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 rounded accent-ink cursor-pointer"
              />
              <label htmlFor="terms" className="cursor-pointer">
                I confirm that I am an authorized purchasing signatory for Acme Corporation and agree to the payment and fulfillment conditions.
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/8">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-mist hover:text-ink"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!agreeTerms}
                onClick={handleConfirmQuotation}
                className="rounded-full bg-emerald-700 text-white px-5 py-2 text-[13px] font-semibold hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-colors"
              >
                Confirm Quotation &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
