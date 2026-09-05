"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import {
  MessageSquare,
  CheckCircle,
  Clock,
  Send,
  Sliders,
  User,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { PortalApi, ApiError } from "@/lib/api";
import { inr } from "@/lib/hooks";
import type { PortalQuotation } from "@/lib/types";

type Tab = "QUOTE" | "MESSAGES" | "PROFILE";

export default function CustomerQuotationPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [activeTab, setActiveTab] = useState<Tab>("QUOTE");
  const [quote, setQuote] = useState<PortalQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [messageDraft, setMessageDraft] = useState("");
  const [targetLineId, setTargetLineId] = useState<number | "ORDER">("ORDER");
  const [proposedDiscount, setProposedDiscount] = useState(15);
  const [counterNote, setCounterNote] = useState("");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = await PortalApi.get(token);
      setQuote(q);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load this quotation.");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendMessage() {
    if (!messageDraft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const lineId = targetLineId === "ORDER" ? null : targetLineId;
      const updated = await PortalApi.postMessage(token, messageDraft, lineId);
      setQuote(updated);
      setMessageDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that message.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCounterOffer() {
    setBusy(true);
    setError(null);
    try {
      const lineId = targetLineId === "ORDER" ? null : targetLineId;
      const updated = await PortalApi.counterOffer(token, String(proposedDiscount), lineId, counterNote);
      setQuote(updated);
      setLastOutcome(updated.counter_offers[updated.counter_offers.length - 1]?.outcome ?? null);
      setCounterNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit that proposal.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmQuotation() {
    setBusy(true);
    setError(null);
    try {
      const updated = await PortalApi.confirm(token);
      setQuote(updated);
      setConfirmModalOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm this quotation.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="mx-auto max-w-[480px] rounded-[24px] bg-white p-8 text-center card-shadow">
        <p className="text-[16px] font-semibold text-ink">This link is invalid or has expired</p>
        <p className="mt-2 text-[13px] text-mist">
          Ask your sales representative to send a fresh link to your quotation.
        </p>
      </div>
    );
  }

  const confirmed = quote.status === "CONFIRMED";

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] bg-white p-6 card-shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-semibold text-mist bg-ink/5 px-2 py-0.5 rounded">
                Ref: {quote.reference}
              </span>
              <StatusBadge status={quote.status} size="md" />
            </div>
            <h1 className="font-serif mt-2 text-[28px] font-semibold tracking-tight text-ink sm:text-[34px]">
              Quotation for {quote.customer_name}
            </h1>
            <p className="text-[13px] text-mist mt-1">
              Issued by DealFlow360 &middot; Link valid until{" "}
              <strong>{new Date(quote.expires_at).toLocaleDateString()}</strong>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11.5px] uppercase font-semibold text-mist">
              Grand total (incl. taxes)
            </span>
            <p className="font-serif text-[28px] font-semibold text-ink tabular-nums mt-0.5">
              {inr(quote.totals.grand_total)}
            </p>
            {parseFloat(quote.totals.recurring_total_per_period) > 0 ? (
              <p className="text-[11.5px] text-mist">
                One-time {inr(quote.totals.one_time_total)} + {inr(quote.totals.recurring_total_per_period)}/period
                recurring
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 border-b border-ink/6 pb-2 overflow-x-auto">
          {([
            { id: "QUOTE", label: "My Quotation", icon: null },
            { id: "MESSAGES", label: "Messages", icon: MessageSquare },
            { id: "PROFILE", label: "Profile", icon: User },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap ${
                activeTab === t.id ? "bg-ink text-bone" : "text-mist hover:text-ink"
              }`}
            >
              {t.icon ? <t.icon className="size-3.5" /> : null}
              {t.label}
              {t.id === "MESSAGES" && quote.messages.length > 0 ? (
                <span className="size-4 rounded-full fill-lilac text-white text-[10px] flex items-center justify-center font-bold">
                  {quote.messages.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-[18px] tone-bad p-4 text-[13px] text-bad">{error}</div> : null}

      {quote.awaiting_review && !confirmed ? (
        <div className="rounded-[20px] tone-warn p-5 flex items-start gap-3">
          <Clock className="size-5 text-warn shrink-0 mt-0.5" />
          <div className="text-[13px] text-warn">
            <p className="font-semibold">Your proposal is under review</p>
            <p className="mt-0.5 text-warn/90 leading-relaxed">
              A recent request exceeded standard discretion and has been automatically routed to our
              sales management for authorization. You will see this update the moment terms are
              finalized — no need to follow up by email.
            </p>
          </div>
        </div>
      ) : null}

      {confirmed ? (
        <div className="rounded-[20px] tone-ok p-5 flex items-start gap-3">
          <CheckCircle className="size-5 text-ok shrink-0 mt-0.5" />
          <div className="text-[13px] text-ok">
            <p className="font-semibold">Quotation confirmed &amp; accepted</p>
            <p className="mt-0.5 text-ok/90 leading-relaxed">
              Thank you for confirming {quote.reference}. Your order has moved to fulfillment; invoices
              and tracking will follow to your registered billing email.
            </p>
          </div>
        </div>
      ) : null}

      {activeTab === "QUOTE" ? (
        <div className="space-y-6">
          <div className="rounded-[24px] bg-white card-shadow overflow-hidden">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
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
                {quote.lines.map((line) => (
                  <tr key={line.id} className="hover:bg-cream/20">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">{line.product_name}</p>
                      {line.plan_name ? (
                        <p className="text-[11px] text-mist">
                          {line.plan_name} &middot; {line.plan_period}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-[12px] text-mist">
                      {line.line_type === "RECURRING" ? "Recurring" : "One-time"}
                    </td>
                    <td className="px-6 py-4 font-medium text-ink">{line.qty}</td>
                    <td className="px-6 py-4 tabular-nums text-mist">{inr(line.unit_price)}</td>
                    <td className="px-6 py-4 tabular-nums text-ok font-semibold">
                      {parseFloat(line.discount_pct) > 0 ? `${line.discount_pct}%` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold tabular-nums text-ink">
                      {inr(line.net_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-6 bg-ink/[0.01] border-t border-ink/6 flex flex-col items-end text-[13px] space-y-2">
              <div className="flex justify-between w-64 text-mist">
                <span>Subtotal (excl. tax):</span>
                <span className="tabular-nums font-medium text-ink">{inr(quote.totals.net_subtotal)}</span>
              </div>
              <div className="flex justify-between w-64 text-mist">
                <span>Tax:</span>
                <span className="tabular-nums font-medium text-ink">{inr(quote.totals.tax_total)}</span>
              </div>
              <div className="pt-2 border-t border-ink/8 flex justify-between w-64 text-[16px] font-semibold text-ink">
                <span>Total amount:</span>
                <span className="tabular-nums">{inr(quote.totals.grand_total)}</span>
              </div>
            </div>
          </div>

          {!confirmed ? (
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-[20px] bg-white card-shadow">
              <button
                type="button"
                onClick={() => setActiveTab("MESSAGES")}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-5 py-2.5 text-[13px] font-semibold text-ink hover:bg-cream transition-colors"
              >
                <Sliders className="size-4" /> Request commercial revisions
              </button>

              <button
                type="button"
                disabled={!quote.can_confirm}
                onClick={() => setConfirmModalOpen(true)}
                title={!quote.can_confirm ? "This quotation isn't ready to confirm yet." : undefined}
                className="inline-flex items-center gap-2 rounded-full fill-ok px-6 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle className="size-4" /> Accept terms &amp; confirm quotation
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "MESSAGES" ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className="rounded-[24px] bg-white p-6 card-shadow md:col-span-6 flex flex-col justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
                Propose a counter-discount
              </h2>
              <p className="text-[12.5px] text-mist mt-2 leading-relaxed">
                Choose a line item (or the whole order) and the discount you&apos;re asking for. If it
                exceeds standard discretion, it is automatically routed to sales management.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-[12px] font-semibold text-ink block mb-1">Target</label>
                  <select
                    value={targetLineId}
                    onChange={(e) =>
                      setTargetLineId(e.target.value === "ORDER" ? "ORDER" : Number(e.target.value))
                    }
                    className="w-full rounded-xl border border-ink/15 p-2.5 text-[13px] font-medium bg-cream/30 focus:outline-hidden"
                  >
                    <option value="ORDER">Whole order</option>
                    {quote.lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.product_name} (current: {l.discount_pct}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[12.5px] font-medium mb-1.5">
                    <span className="text-ink">Proposed discount:</span>
                    <span className="text-[14px] font-bold text-lilac">{proposedDiscount}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={proposedDiscount}
                    onChange={(e) => setProposedDiscount(parseInt(e.target.value))}
                    className="w-full accent-ink cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-ink block mb-1">
                    Business justification
                  </label>
                  <textarea
                    value={counterNote}
                    onChange={(e) => setCounterNote(e.target.value)}
                    placeholder="Tell us why this discount makes sense..."
                    rows={3}
                    className="w-full rounded-xl border border-ink/15 p-3 text-[13px] bg-cream/30 focus:outline-hidden"
                  />
                </div>

                {lastOutcome === "ROUTED_FOR_APPROVAL" ? (
                  <div className="rounded-xl tone-warn p-3 text-[12px] text-warn">
                    Your last proposal exceeded standard discretion and was routed for approval.
                  </div>
                ) : lastOutcome === "AUTO_ACCEPTED" ? (
                  <div className="rounded-xl tone-ok p-3 text-[12px] text-ok">
                    Your last proposal was within policy and applied immediately.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-ink/6">
              <button
                type="button"
                onClick={submitCounterOffer}
                disabled={busy || confirmed}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                <Send className="size-3.5" /> Submit counter-offer
              </button>
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-6 card-shadow md:col-span-6 flex flex-col justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6 flex items-center gap-2">
                <MessageSquare className="size-4 text-mist" />
                Negotiation thread
              </h2>

              <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {quote.messages.length === 0 ? (
                  <p className="py-6 text-center text-[12.5px] text-mist">No messages yet.</p>
                ) : (
                  quote.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-[16px] p-3.5 text-[13px] ${
                        msg.author_type === "CUSTOMER"
                          ? "tone-lilac text-lilac ml-6"
                          : "bg-cream/50 text-ink mr-6 border border-ink/8"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-medium text-mist mb-1">
                        <span className="font-semibold text-ink">{msg.author_label}</span>
                        <span>{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <p className="leading-relaxed">{msg.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-ink/6 flex items-center gap-2">
              <input
                type="text"
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                placeholder="Type a message to your sales executive..."
                disabled={busy || confirmed}
                className="flex-1 rounded-full border border-ink/15 bg-cream/30 px-4 py-2 text-[12.5px] focus:outline-hidden disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={busy || confirmed}
                className="size-8 rounded-full bg-ink text-bone flex items-center justify-center hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "PROFILE" ? (
        <div className="rounded-[24px] bg-white p-6 card-shadow max-w-[520px]">
          <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
            Account &amp; link details
          </h2>
          <dl className="mt-4 space-y-3 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-mist">Company</dt>
              <dd className="font-medium text-ink">{quote.customer_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist">Quotation reference</dt>
              <dd className="font-medium text-ink">{quote.reference}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist">Status</dt>
              <dd className="font-medium text-ink">{quote.status.replace(/_/g, " ")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist">Link expires</dt>
              <dd className="font-medium text-ink">{new Date(quote.expires_at).toLocaleString()}</dd>
            </div>
          </dl>
          <p className="mt-5 text-[11.5px] text-mist leading-relaxed">
            This is a token-scoped view: it shows only your own quotation and nothing else in
            DealFlow360. It never exposes internal pricing, margin, or approval information.
          </p>
        </div>
      ) : null}

      {confirmModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl border border-ink/10">
            <h3 className="text-[18px] font-semibold text-ink">Confirm &amp; accept quotation terms</h3>
            <p className="text-[13px] text-mist mt-1">
              You are agreeing to enter into contract based on the following commercial terms:
            </p>

            <div className="mt-4 rounded-xl bg-cream/50 p-4 border border-ink/8 text-[13px] space-y-2">
              <div className="flex justify-between">
                <span className="text-mist">One-time charges:</span>
                <span className="font-semibold text-ink">{inr(quote.totals.one_time_total)}</span>
              </div>
              {parseFloat(quote.totals.recurring_total_per_period) > 0 ? (
                <div className="flex justify-between">
                  <span className="text-mist">Recurring, per period:</span>
                  <span className="font-semibold text-ok">
                    {inr(quote.totals.recurring_total_per_period)}
                  </span>
                </div>
              ) : null}
              <div className="pt-2 border-t border-ink/8 flex justify-between font-bold text-[14px]">
                <span>Grand total:</span>
                <span className="tabular-nums">{inr(quote.totals.grand_total)}</span>
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
                I confirm that I am an authorized purchasing signatory for {quote.customer_name} and
                agree to the payment and fulfillment conditions.
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
                disabled={!agreeTerms || busy}
                onClick={confirmQuotation}
                className="rounded-full fill-ok text-white px-5 py-2 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Confirm quotation &rarr;
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
