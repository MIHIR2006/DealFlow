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
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, useMutation, inr, timeAgo } from "@/lib/hooks";

interface PortalLine {
  id: number;
  position: number;
  product_name: string;
  description?: string;
  qty: string;
  unit_price: string;
  discount_pct: string;
  list_value: string;
  discount_amount: string;
  net_amount: string;
  tax_amount: string;
  line_type: string;
  plan_name?: string | null;
  plan_period?: string | null;
}

interface PortalTotals {
  list_subtotal: string;
  discount_total: string;
  net_subtotal: string;
  tax_total: string;
  grand_total: string;
  one_time_total: string;
  recurring_total_per_period: string;
}

interface PortalMessage {
  id: number;
  line_id?: number | null;
  author_type: "CUSTOMER" | "REP" | "SYSTEM";
  author_label: string;
  body: string;
  created_at: string;
}

interface PortalCounterOffer {
  id: number;
  line_id?: number | null;
  previous_discount_pct: string;
  proposed_discount_pct: string;
  outcome: "AUTO_ACCEPTED" | "ROUTED_FOR_APPROVAL";
  note?: string;
  created_at: string;
}

interface PortalQuotation {
  reference: string;
  status: string;
  customer_name: string;
  expires_at: string;
  awaiting_review: boolean;
  can_confirm: boolean;
  lines: PortalLine[];
  totals: PortalTotals;
  messages: PortalMessage[];
  counter_offers: PortalCounterOffer[];
}

export default function CustomerQuotationPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const { data: quote, loading, error, refetch } = useFetch<PortalQuotation>(
    `/v1/portal/q/${token}`
  );

  const [activeTab, setActiveTab] = useState<"QUOTE" | "NEGOTIATE">("QUOTE");

  // Negotiation state
  const [proposedDiscount, setProposedDiscount] = useState(15);
  const [negotiationMessage, setNegotiationMessage] = useState("");
  const [chatMessage, setChatMessage] = useState("");

  // Confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  const { trigger: sendOffer, loading: proposing } = useMutation();
  const { trigger: postMsg, loading: sendingMsg } = useMutation();
  const { trigger: confirmDeal, loading: confirming } = useMutation();

  async function handleSendCounterOffer(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res: any = await sendOffer(`/v1/portal/q/${token}/counter-offer`, {
        method: "POST",
        body: JSON.stringify({
          proposed_discount_pct: proposedDiscount.toFixed(2),
          note: negotiationMessage.trim(),
        }),
      });
      if (res?.awaiting_review) {
        setPortalNotice(
          "Counter-offer submitted! Because the proposed discount exceeds pre-approved thresholds, the deal has been autonomously routed for expedited commercial management review."
        );
      } else {
        setPortalNotice(
          "Counter-offer instantly approved by self-governing policy engine! Quotation updated."
        );
      }
      setNegotiationMessage("");
      refetch();
    } catch (err: any) {
      alert(`Counter-offer failed: ${err.message}`);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    try {
      await postMsg(`/v1/portal/q/${token}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: chatMessage.trim() }),
      });
      setChatMessage("");
      refetch();
    } catch (err: any) {
      alert(`Message error: ${err.message}`);
    }
  }

  async function handleConfirmQuotation() {
    if (!agreeTerms) return;
    try {
      await confirmDeal(`/v1/portal/q/${token}/confirm`, {
        method: "POST",
        body: JSON.stringify({ notes: "Customer accepted online proposal" }),
      });
      setConfirmModalOpen(false);
      setPortalNotice(
        "Proposal confirmed! Your commercial order has been finalized and sent to automated warehouse fulfillment dispatch."
      );
      refetch();
    } catch (err: any) {
      alert(`Confirmation error: ${err.message}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-[24px] bg-white p-8 text-center border border-ink/10 shadow-xs">
          <div className="size-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto text-rose-800">
            <X className="size-6" />
          </div>
          <h2 className="mt-4 font-serif text-[24px] text-ink">Link Invalid or Expired</h2>
          <p className="mt-1 text-[13px] text-mist">
            This customer negotiation portal link has expired or is no longer valid. Please reach out to your sales representative to request a new link.
          </p>
        </div>
      </div>
    );
  }

  const lines = quote.lines ?? [];
  const messages = quote.messages ?? [];
  const counterHistory = quote.counter_offers ?? [];

  return (
    <div className="min-h-screen bg-cream text-ink">
      {/* Top Brand Banner */}
      <header className="border-b border-ink/8 bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-ink text-bone font-serif font-bold text-[18px]">
              D
            </div>
            <div>
              <p className="font-serif text-[18px] font-semibold tracking-tight text-ink">
                DealFlow360 Customer Portal
              </p>
              <p className="text-[11.5px] text-mist">
                Formal Proposal for <strong>{quote.customer_name}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={quote.status} size="sm" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* Deal Overview Banner */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12.5px] font-medium text-mist">
              Commercial Quotation {quote.reference}
            </p>
            <h1 className="font-serif mt-1 text-[28px] sm:text-[34px] tracking-[-0.02em] text-ink">
              Review &amp; Negotiate Commercial Terms
            </h1>
            <p className="text-[13.5px] text-mist max-w-[620px] mt-1">
              Transparent, itemized quotation prepared specifically for your account. You can accept these terms directly or submit a counter-offer.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {quote.can_confirm && (
              <button
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-5 py-2.5 text-[13px] font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors"
              >
                <CheckCircle className="size-4" /> Accept &amp; Confirm Order
              </button>
            )}
          </div>
        </div>

        {portalNotice && (
          <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center gap-2.5">
            <CheckCircle className="size-4 text-emerald-700 shrink-0" />
            {portalNotice}
          </div>
        )}

        {quote.awaiting_review && (
          <div className="rounded-[18px] bg-amber-500/10 p-4 border border-amber-500/25 text-[13px] text-amber-950 font-medium flex items-center gap-2.5">
            <Clock className="size-4 text-amber-800 shrink-0" />
            Your proposed counter-offer was automatically escalated to senior leadership for expedited review. We will notify you the moment it is signed off.
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 rounded-full bg-white p-1 border border-ink/8 shadow-xs w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("QUOTE")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
              activeTab === "QUOTE"
                ? "bg-ink text-bone shadow-xs"
                : "text-mist hover:text-ink"
            }`}
          >
            <FileCheck className="size-3.5" /> Itemized Proposal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("NEGOTIATE")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
              activeTab === "NEGOTIATE"
                ? "bg-ink text-bone shadow-xs"
                : "text-mist hover:text-ink"
            }`}
          >
            <MessageSquare className="size-3.5" /> Direct Negotiation &amp; Messages ({messages.length})
          </button>
        </div>

        {/* TAB 1: ITEMIZED PROPOSAL TABLE */}
        {activeTab === "QUOTE" && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[24px] bg-white border border-ink/8 shadow-xs">
              <table className="w-full text-left text-[13.5px]">
                <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
                  <tr>
                    <th className="px-6 py-3.5">Item Description</th>
                    <th className="px-6 py-3.5">Quantity</th>
                    <th className="px-6 py-3.5">List Price</th>
                    <th className="px-6 py-3.5">Discount</th>
                    <th className="px-6 py-3.5 text-right">Net Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {lines.map((line) => (
                    <tr key={line.id} className="hover:bg-cream/30">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink">{line.product_name}</p>
                        <p className="text-[11.5px] text-mist">{line.line_type}</p>
                      </td>
                      <td className="px-6 py-4 font-mono font-medium">{line.qty}</td>
                      <td className="px-6 py-4 font-mono tabular-nums text-mist">
                        {inr(line.unit_price)}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-emerald-800">
                        {line.discount_pct}%
                      </td>
                      <td className="px-6 py-4 font-mono font-bold tabular-nums text-ink text-right">
                        {inr(line.net_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Breakdown Footer */}
              <div className="bg-ink/[0.015] px-6 py-5 border-t border-ink/6 flex flex-col items-end gap-1.5 text-[13px]">
                <div className="flex justify-between w-64 text-mist">
                  <span>List Subtotal:</span>
                  <span className="font-mono">{inr(quote.totals?.list_subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between w-64 text-emerald-800">
                  <span>Discount Total:</span>
                  <span className="font-mono font-medium">-{inr(quote.totals?.discount_total ?? 0)}</span>
                </div>
                <div className="flex justify-between w-64 text-mist">
                  <span>GST / Tax Total:</span>
                  <span className="font-mono">{inr(quote.totals?.tax_total ?? 0)}</span>
                </div>
                <div className="flex justify-between w-64 pt-2 border-t border-ink/10 font-serif font-bold text-[18px] text-ink">
                  <span>Grand Total:</span>
                  <span className="font-mono">{inr(quote.totals?.grand_total ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: NEGOTIATION & MESSAGING */}
        {activeTab === "NEGOTIATE" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Counter-Offer Form */}
            <div className="lg:col-span-5 rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-ink flex items-center gap-2">
                  <Sliders className="size-4 text-ink" /> Submit Counter-Offer
                </h2>
                <p className="text-[12.5px] text-mist mt-1">
                  Adjust your requested target discount across the proposal. Deals within our governance discretion are automatically accepted immediately.
                </p>

                <form onSubmit={handleSendCounterOffer} className="mt-5 space-y-4">
                  <div>
                    <div className="flex justify-between text-[13px] mb-1">
                      <span className="font-medium text-ink">Target Discount:</span>
                      <span className="font-mono font-bold text-ink">{proposedDiscount}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="1"
                      disabled={quote.awaiting_review || !quote.can_confirm}
                      value={proposedDiscount}
                      onChange={(e) => setProposedDiscount(parseInt(e.target.value) || 0)}
                      className="w-full accent-ink"
                    />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-medium text-ink mb-1">
                      Justification or Conditions
                    </label>
                    <textarea
                      rows={3}
                      disabled={quote.awaiting_review || !quote.can_confirm}
                      value={negotiationMessage}
                      onChange={(e) => setNegotiationMessage(e.target.value)}
                      placeholder="e.g. Budget ceiling requires 18% for multi-year commitment..."
                      className="w-full rounded-xl border border-ink/15 bg-cream/30 p-3 text-[13px] placeholder:text-mist focus:outline-hidden focus:border-ink"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={proposing || quote.awaiting_review || !quote.can_confirm}
                    className="w-full rounded-full bg-ink py-2.5 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
                  >
                    {proposing ? "Submitting Counter-Offer..." : "Submit Counter-Offer"}
                  </button>
                </form>
              </div>

              {/* Counter-Offer History */}
              {counterHistory.length > 0 && (
                <div className="mt-6 pt-4 border-t border-ink/6">
                  <p className="text-[12px] font-semibold text-mist uppercase tracking-wider mb-2">
                    Prior Counter-Offers
                  </p>
                  <div className="space-y-2">
                    {counterHistory.map((co) => (
                      <div
                        key={co.id}
                        className="rounded-xl bg-cream/40 p-2.5 text-[12px] border border-ink/6"
                      >
                        <div className="flex justify-between font-medium">
                          <span>{co.proposed_discount_pct}% requested</span>
                          <span className="text-mist">{timeAgo(co.created_at)}</span>
                        </div>
                        <p className="text-mist mt-0.5">{co.note || "No note provided"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Message Thread */}
            <div className="lg:col-span-7 rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex flex-col justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-ink flex items-center gap-2 pb-3 border-b border-ink/6">
                  <MessageSquare className="size-4 text-mist" /> Direct Communication Thread
                </h2>

                <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-2">
                  {messages.map((m) => {
                    const isCustomer = m.author_type === "CUSTOMER";
                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-[18px] text-[13px] max-w-[85%] ${
                          isCustomer
                            ? "ml-auto bg-ink text-bone"
                            : "mr-auto bg-cream/60 border border-ink/8 text-ink"
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2 mb-1 text-[11px] opacity-70">
                          <span className="font-semibold">{m.author_label}</span>
                          <span>{timeAgo(m.created_at)}</span>
                        </div>
                        <p className="leading-relaxed">{m.body}</p>
                      </div>
                    );
                  })}

                  {messages.length === 0 && (
                    <div className="p-8 text-center text-mist text-[13px]">
                      No messages in thread. Send a message below to coordinate with your account rep.
                    </div>
                  )}
                </div>
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="mt-4 flex gap-2 pt-3 border-t border-ink/6">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type a message to your sales representative..."
                  className="flex-1 rounded-full border border-ink/15 bg-cream/30 px-4 py-2 text-[13px] focus:outline-hidden focus:border-ink"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !chatMessage.trim()}
                  className="inline-flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
                >
                  <Send className="size-3.5" /> Send
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* CONFIRMATION MODAL */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-xl border border-ink/10 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <h3 className="font-semibold text-[17px] text-ink">Confirm Commercial Proposal</h3>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="size-7 rounded-full flex items-center justify-center text-mist hover:text-ink hover:bg-cream"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13px] text-ink leading-relaxed">
              <p>
                You are confirming quotation <strong>{quote.reference}</strong> for a total amount of{" "}
                <strong className="font-mono">{inr(quote.totals?.grand_total ?? 0)}</strong>.
              </p>
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-cream/40 border border-ink/6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 size-4 accent-ink"
                />
                <span className="text-[12px] text-mist">
                  I agree to the commercial payment terms and acknowledge that fulfillment allocation will commence immediately upon confirmation.
                </span>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/6">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-full px-4 py-2 text-[12.5px] font-medium text-mist hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirming || !agreeTerms}
                onClick={handleConfirmQuotation}
                className="rounded-full bg-emerald-700 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                {confirming ? "Finalizing Order..." : "Authorize & Sign Deal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
