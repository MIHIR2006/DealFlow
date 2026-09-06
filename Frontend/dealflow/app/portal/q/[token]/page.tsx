"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, use } from "react";
import {
  MessageSquare,
  CheckCircle,
  Clock,
  Send,
  Sliders,
  User,
  Info,
} from "lucide-react";
import { PortalApi, ApiError } from "@/lib/api";
import { inr } from "@/lib/hooks";
import type { PortalQuotation } from "@/lib/types";
import { PortalStatusBadge, portalStatusLabel } from "./portal-status";
import { NegotiationTable } from "./negotiation-table";
import { AssistantDock } from "./assistant-dock";

type Tab = "QUOTE" | "MESSAGES" | "PROFILE";

/** A comment or a counter-offer is either about one line or about the order. */
type Target = number | "ORDER";

// How often the portal re-checks a quotation that is sitting with our team.
// The customer's own counter-offer is what put it there, so they are actively
// waiting on an answer; polling only in that state keeps the page live for the
// one moment it matters and idle the rest of the time.
const REVIEW_POLL_MS = 15_000;

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

  // The chat composer and the counter-offer form each carry their own target.
  // Sharing one piece of state meant picking a line to negotiate on silently
  // re-scoped every subsequent chat message to that line.
  const [messageTarget, setMessageTarget] = useState<Target>("ORDER");
  const [counterTarget, setCounterTarget] = useState<Target>("ORDER");

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

  // Re-read after the assistant has acted. Quiet on purpose: the customer is
  // looking at the chat panel, and blanking the document behind it for a
  // spinner would be worse than a moment of stale figures.
  const refresh = useCallback(async () => {
    try {
      setQuote(await PortalApi.get(token));
    } catch {
      // The next poll or interaction picks it up.
    }
  }, [token]);

  const confirmed = quote?.status === "CONFIRMED";
  const awaitingReview = !!quote?.awaiting_review;

  // While the deal is with our team, refresh quietly so the decision lands on
  // the customer's screen without them reloading. No spinner: nothing they did
  // triggered this.
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!awaitingReview || confirmed) return;

    const id = setInterval(async () => {
      if (busyRef.current) return;
      try {
        setQuote(await PortalApi.get(token));
      } catch {
        // A transient failure here is not worth interrupting the customer
        // over; the next tick tries again.
      }
    }, REVIEW_POLL_MS);

    return () => clearInterval(id);
  }, [awaitingReview, confirmed, token]);

  // The discount a target currently carries, which is what a counter-offer
  // would be moving away from.
  const currentDiscountOf = useCallback(
    (target: Target): number => {
      if (!quote) return 0;
      if (target === "ORDER") return parseFloat(quote.order_discount_pct) || 0;
      const line = quote.lines.find((l) => l.id === target);
      return line ? parseFloat(line.discount_pct) || 0 : 0;
    },
    [quote],
  );

  // Seed the slider from whatever the target is on today rather than a fixed
  // 15%, so the form opens at the real starting point of the negotiation.
  //
  // Seeding is keyed to the target, not to the quotation: a refresh that
  // arrives while the customer is mid-adjustment -- their own chat message
  // returns a fresh document -- must not drag the slider back under them.
  const seededFor = useRef<Target | null>(null);
  useEffect(() => {
    if (!quote || seededFor.current === counterTarget) return;
    seededFor.current = counterTarget;
    setProposedDiscount(Math.round(currentDiscountOf(counterTarget)));
  }, [counterTarget, quote, currentDiscountOf]);

  const messagesByLine = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of quote?.messages ?? []) {
      if (m.line_id != null) counts.set(m.line_id, (counts.get(m.line_id) ?? 0) + 1);
    }
    return counts;
  }, [quote?.messages]);

  const lineName = useCallback(
    (id?: number | null) => {
      if (id == null) return null;
      return quote?.lines.find((l) => l.id === id)?.product_name ?? "A line item";
    },
    [quote?.lines],
  );

  /** Jump to the negotiation tab with a line already in hand. */
  function discussLine(lineId: number) {
    setMessageTarget(lineId);
    setCounterTarget(lineId);
    setActiveTab("MESSAGES");
  }

  async function sendMessage() {
    if (!messageDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const lineId = messageTarget === "ORDER" ? null : messageTarget;
      const updated = await PortalApi.postMessage(token, messageDraft.trim(), lineId);
      setQuote(updated);
      setMessageDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that message.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCounterOffer() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const lineId = counterTarget === "ORDER" ? null : counterTarget;
      const updated = await PortalApi.counterOffer(
        token,
        String(proposedDiscount),
        lineId,
        counterNote.trim(),
      );
      setQuote(updated);
      // Counter-offers come back newest first, so the proposal just made is
      // at the head of the list.
      setLastOutcome(updated.counter_offers[0]?.outcome ?? null);
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
      setConfirmModalOpen(false);
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

  // Negotiation is closed once the deal is confirmed, and paused while our
  // team is reviewing terms the customer themselves proposed.
  const negotiationOpen = !confirmed && !awaitingReview;

  const confirmBlockedReason = confirmed
    ? null
    : quote.can_confirm
      ? null
      : awaitingReview
        ? "Your latest request is with our team. You will be able to confirm as soon as it is finalized."
        : "This quotation is not open for confirmation right now.";

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] bg-white p-5 card-shadow sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[12px] font-semibold text-mist bg-ink/5 px-2 py-0.5 rounded">
                Ref: {quote.reference}
              </span>
              <PortalStatusBadge status={quote.status} size="md" />
            </div>
            <h1 className="font-serif mt-2 text-[24px] font-semibold tracking-tight text-ink sm:text-[34px]">
              Quotation for {quote.customer_name}
            </h1>
            <p className="text-[13px] text-mist mt-1">
              Issued by DealFlow360 &middot; Link valid until{" "}
              <strong>{new Date(quote.expires_at).toLocaleDateString()}</strong>
            </p>
          </div>

          <div className="w-full sm:w-auto sm:text-right">
            <span className="text-[11.5px] uppercase font-semibold text-mist">
              Grand total (incl. taxes)
            </span>
            <p className="font-serif text-[26px] font-semibold text-ink tabular-nums mt-0.5 sm:text-[28px]">
              {inr(quote.totals.grand_total)}
            </p>
            {parseFloat(quote.totals.recurring_total_per_period) > 0 ? (
              <p className="text-[11.5px] text-mist">
                One-time {inr(quote.totals.one_time_total)} +{" "}
                {inr(quote.totals.recurring_total_per_period)}/period recurring
              </p>
            ) : null}
          </div>
        </div>

        <div className="scroll-x mt-6 flex items-center gap-2 border-b border-ink/6 pb-2">
          {([
            { id: "QUOTE", label: "My Quotation", icon: null },
            { id: "MESSAGES", label: "Messages", icon: MessageSquare },
            { id: "PROFILE", label: "Profile", icon: User },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap ${
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

      {awaitingReview && !confirmed ? (
        <div className="rounded-[20px] tone-warn p-5 flex items-start gap-3">
          <Clock className="size-5 text-warn shrink-0 mt-0.5" />
          <div className="text-[13px] text-warn">
            <p className="font-semibold">Your proposal is under review</p>
            <p className="mt-0.5 text-warn/90 leading-relaxed">
              A recent request exceeded standard discretion and has been automatically routed to our
              sales management for authorization. This page updates itself the moment terms are
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
            <div className="md:overflow-x-auto">
              <table className="stack-table w-full text-left text-[13.5px]">
                <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
                  <tr>
                    <th className="px-6 py-3.5">Item Description</th>
                    <th className="px-6 py-3.5">Type</th>
                    <th className="px-6 py-3.5">Qty</th>
                    <th className="px-6 py-3.5">Unit Price</th>
                    <th className="px-6 py-3.5">Discount</th>
                    <th className="px-6 py-3.5 text-right">Net Amount</th>
                    <th className="px-6 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {quote.lines.map((line) => {
                    const comments = messagesByLine.get(line.id) ?? 0;
                    return (
                      <tr key={line.id} className="group hover:bg-cream/20">
                        <td data-stack="primary" className="px-6 py-4">
                          <p className="font-semibold text-ink">{line.product_name}</p>
                          {line.plan_name ? (
                            <p className="text-[11px] text-mist">
                              {line.plan_name} &middot; {line.plan_period}
                            </p>
                          ) : null}
                        </td>
                        <td data-label="Type" className="px-6 py-4 text-[12px] text-mist">
                          {line.line_type === "RECURRING" ? "Recurring" : "One-time"}
                        </td>
                        <td data-label="Qty" className="px-6 py-4 font-medium text-ink">
                          {line.qty}
                        </td>
                        <td data-label="Unit price" className="px-6 py-4 tabular-nums text-mist">
                          {inr(line.unit_price)}
                        </td>
                        <td data-label="Discount" className="px-6 py-4 tabular-nums text-ok font-semibold">
                          {parseFloat(line.discount_pct) > 0 ? `${line.discount_pct}%` : "—"}
                        </td>
                        <td data-label="Net amount" className="px-6 py-4 text-right font-semibold tabular-nums text-ink">
                          {inr(line.net_amount)}
                        </td>
                        <td data-stack="action" className="px-6 py-4 text-right">
                          {negotiationOpen ? (
                            <button
                              type="button"
                              onClick={() => discussLine(line.id)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-ink/12 px-3 py-1 text-[11.5px] font-semibold text-mist transition-colors hover:border-ink/25 hover:text-ink whitespace-nowrap"
                            >
                              <MessageSquare className="size-3" />
                              {comments > 0 ? `Discuss (${comments})` : "Discuss"}
                            </button>
                          ) : comments > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-mist whitespace-nowrap">
                              <MessageSquare className="size-3" />
                              {comments}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-stretch space-y-2 border-t border-ink/6 bg-ink/[0.01] p-5 text-[13px] sm:items-end sm:p-6">
              <div className="flex w-full justify-between text-mist sm:w-64">
                <span>Subtotal (excl. tax):</span>
                <span className="tabular-nums font-medium text-ink">
                  {inr(quote.totals.net_subtotal)}
                </span>
              </div>
              <div className="flex w-full justify-between text-mist sm:w-64">
                <span>Tax:</span>
                <span className="tabular-nums font-medium text-ink">{inr(quote.totals.tax_total)}</span>
              </div>
              <div className="flex w-full justify-between border-t border-ink/8 pt-2 text-[16px] font-semibold text-ink sm:w-64">
                <span>Total amount:</span>
                <span className="tabular-nums">{inr(quote.totals.grand_total)}</span>
              </div>
            </div>
          </div>

          <NegotiationTable offers={quote.counter_offers} lines={quote.lines} />

          {!confirmed ? (
            <div className="rounded-[20px] bg-white card-shadow p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("MESSAGES")}
                  disabled={!negotiationOpen}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/15 px-5 py-2.5 text-[13px] font-semibold text-ink hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sliders className="size-4" /> Request commercial revisions
                </button>

                <button
                  type="button"
                  disabled={!quote.can_confirm || busy}
                  onClick={() => setConfirmModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full fill-ok px-6 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="size-4" /> Accept terms &amp; confirm quotation
                </button>
              </div>

              {confirmBlockedReason ? (
                <p className="mt-3 flex items-start gap-1.5 border-t border-ink/6 pt-3 text-[12px] text-mist">
                  <Info className="size-3.5 shrink-0 mt-0.5" />
                  {confirmBlockedReason}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "MESSAGES" ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className="rounded-[24px] bg-white p-5 card-shadow md:col-span-6 flex flex-col justify-between sm:p-6">
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
                  <label
                    htmlFor="counter-target"
                    className="text-[12px] font-semibold text-ink block mb-1"
                  >
                    Target
                  </label>
                  <select
                    id="counter-target"
                    value={counterTarget}
                    onChange={(e) =>
                      setCounterTarget(e.target.value === "ORDER" ? "ORDER" : Number(e.target.value))
                    }
                    disabled={!negotiationOpen}
                    className="w-full rounded-xl border border-ink/15 p-2.5 text-[13px] font-medium bg-cream/30 focus:outline-hidden disabled:opacity-50"
                  >
                    <option value="ORDER">
                      Whole order (current: {quote.order_discount_pct}%)
                    </option>
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
                    <span className="tabular-nums text-mist">
                      {currentDiscountOf(counterTarget)}% &rarr;{" "}
                      <span className="text-[14px] font-bold text-lilac">{proposedDiscount}%</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={proposedDiscount}
                    disabled={!negotiationOpen}
                    onChange={(e) => setProposedDiscount(parseInt(e.target.value))}
                    className="h-6 w-full touch-pan-y accent-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed sm:h-auto"
                  />
                </div>

                <div>
                  <label
                    htmlFor="counter-note"
                    className="text-[12px] font-semibold text-ink block mb-1"
                  >
                    Business justification
                  </label>
                  <textarea
                    id="counter-note"
                    value={counterNote}
                    onChange={(e) => setCounterNote(e.target.value)}
                    placeholder="Tell us why this discount makes sense..."
                    rows={3}
                    disabled={!negotiationOpen}
                    className="w-full rounded-xl border border-ink/15 p-3 text-[13px] bg-cream/30 focus:outline-hidden disabled:opacity-50"
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
                disabled={busy || !negotiationOpen}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="size-3.5" /> Submit request
              </button>
              {!negotiationOpen ? (
                <p className="mt-2 text-center text-[11.5px] text-mist">
                  {confirmed
                    ? "This quotation is confirmed, so terms are now fixed."
                    : "Paused while our team reviews your last request."}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-5 card-shadow md:col-span-6 flex flex-col justify-between sm:p-6">
            <div>
              <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6 flex items-center gap-2">
                <MessageSquare className="size-4 text-mist" />
                Negotiation thread
              </h2>

              <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {quote.messages.length === 0 ? (
                  <p className="py-6 text-center text-[12.5px] text-mist">No messages yet.</p>
                ) : (
                  quote.messages.map((msg) => {
                    const about = lineName(msg.line_id);
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-[16px] p-3.5 text-[13px] ${
                          msg.author_type === "CUSTOMER"
                            ? "tone-lilac text-lilac ml-4 sm:ml-6"
                            : "bg-cream/50 text-ink mr-4 border border-ink/8 sm:mr-6"
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-[11px] font-medium text-mist">
                          <span className="font-semibold text-ink">{msg.author_label}</span>
                          <span>{new Date(msg.created_at).toLocaleString()}</span>
                        </div>
                        {about ? (
                          <p className="mb-1 inline-flex items-center rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-semibold text-mist">
                            {about}
                          </p>
                        ) : null}
                        <p className="leading-relaxed">{msg.body}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-ink/6 space-y-2">
              <div className="flex items-center gap-2 text-[11.5px]">
                <label htmlFor="message-target" className="font-semibold text-mist">
                  About:
                </label>
                <select
                  id="message-target"
                  value={messageTarget}
                  onChange={(e) =>
                    setMessageTarget(e.target.value === "ORDER" ? "ORDER" : Number(e.target.value))
                  }
                  disabled={!negotiationOpen}
                  className="min-w-0 flex-1 rounded-full border border-ink/12 bg-cream/30 px-3 py-1.5 text-[11.5px] font-medium focus:outline-hidden disabled:opacity-50 sm:py-1"
                >
                  <option value="ORDER">The whole order</option>
                  {quote.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.product_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  placeholder="Type a message to your sales executive..."
                  disabled={busy || !negotiationOpen}
                  className="min-w-0 flex-1 rounded-full border border-ink/15 bg-cream/30 px-4 py-2 text-[12.5px] focus:outline-hidden disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendMessage();
                  }}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={busy || !negotiationOpen || !messageDraft.trim()}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-bone hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:size-8"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "PROFILE" ? (
        <div className="rounded-[24px] bg-white p-5 card-shadow max-w-[520px] sm:p-6">
          <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
            Account &amp; link details
          </h2>
          <dl className="mt-4 space-y-3 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Company</dt>
              <dd className="font-medium text-ink text-right">{quote.customer_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Contact email</dt>
              <dd className="font-medium text-ink text-right break-all">{quote.customer_email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Quotation reference</dt>
              <dd className="font-medium text-ink text-right">{quote.reference}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Status</dt>
              <dd className="font-medium text-ink text-right">{portalStatusLabel(quote.status)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Link expires</dt>
              <dd className="font-medium text-ink text-right">
                {new Date(quote.expires_at).toLocaleString()}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-[11.5px] text-mist leading-relaxed">
            This is a token-scoped view: it shows only your own quotation and nothing else in
            DealFlow360. It never exposes internal pricing, margin, or approval information.
          </p>
        </div>
      ) : null}

      {confirmModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 backdrop-blur-xs p-3 sm:items-center sm:p-4">
          <div className="max-h-[calc(100svh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl border border-ink/10 sm:p-6">
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

            <div className="mt-6 flex flex-col gap-2.5 pt-3 border-t border-ink/8 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-full px-4 py-2.5 text-[13px] font-medium text-mist hover:text-ink sm:py-2"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!agreeTerms || busy}
                onClick={confirmQuotation}
                className="rounded-full fill-ok text-white px-5 py-2.5 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors sm:py-2"
              >
                Confirm quotation &rarr;
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AssistantDock
        token={token}
        reference={quote.reference}
        negotiationOpen={negotiationOpen}
        onQuotationChanged={refresh}
      />
    </div>
  );
}
