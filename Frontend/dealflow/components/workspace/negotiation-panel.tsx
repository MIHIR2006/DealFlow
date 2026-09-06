"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, ArrowRight } from "lucide-react";
import { QuotationApi, ApiError } from "@/lib/api";
import type { NegotiationThread, QuotationLine } from "@/lib/types";

/** How a counter-offer ended, in the words a rep needs. */
function outcomeLabel(outcome: string): { text: string; tone: string } {
  switch (outcome) {
    case "AUTO_ACCEPTED":
      return { text: "Applied automatically", tone: "tone-ok" };
    case "APPROVED":
      return { text: "Approved and applied", tone: "tone-ok" };
    case "REJECTED":
      return { text: "Not approved", tone: "tone-bad" };
    case "ROUTED_FOR_APPROVAL":
      return { text: "Awaiting approval", tone: "tone-warn" };
    default:
      return { text: outcome, tone: "bg-cream text-mist" };
  }
}

/**
 * The internal side of the customer negotiation.
 *
 * The customer's portal writes into this same thread. Before this panel
 * existed the traffic only ran one way: a customer could send a message and
 * be told the sales team had been notified, while nothing internal ever
 * showed it and nobody could answer.
 */
export function NegotiationPanel({
  quotationId,
  lines,
  onReplied,
  className = "",
}: {
  quotationId: number;
  lines: QuotationLine[];
  /** A reply is activity on the deal, so the parent may want to re-read it. */
  onReplied?: () => void;
  className?: string;
}) {
  const [thread, setThread] = useState<NegotiationThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState<number | "ORDER">("ORDER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Guarded so a response arriving after the rep has navigated away does
    // not set state on an unmounted panel.
    let cancelled = false;

    QuotationApi.negotiation(quotationId)
      .then((t) => {
        if (!cancelled) setThread(t);
      })
      .catch(() => {
        // A quotation never sent to a customer has no thread yet; that is
        // not an error worth putting on the page.
        if (!cancelled) setThread(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quotationId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [thread?.messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;

    setBusy(true);
    setError(null);
    try {
      setThread(await QuotationApi.reply(quotationId, body, target === "ORDER" ? null : target));
      setDraft("");
      onReplied?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that reply.");
    } finally {
      setBusy(false);
    }
  }

  const messages = thread?.messages ?? [];
  const offers = thread?.counter_offers ?? [];
  const unanswered =
    messages.length > 0 && messages[messages.length - 1].author_type === "CUSTOMER";

  return (
    <div className={`rounded-[20px] bg-white p-4 card-shadow ${className}`}>
      <div className="flex items-center justify-between border-b border-ink/6 pb-3">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
          <MessageSquare className="size-3.5 text-mist" />
          Customer negotiation
        </h3>
        {unanswered ? (
          <span className="rounded-full tone-warn px-2 py-0.5 text-[11px] font-medium">
            Awaiting your reply
          </span>
        ) : null}
      </div>

      {offers.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {offers.slice(0, 3).map((o) => {
            const label = outcomeLabel(o.outcome);
            const line = o.line_id ? lines.find((l) => l.id === o.line_id) : undefined;
            return (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-[14px] border border-ink/6 bg-cream/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-ink">
                    {line ? line.product_name : "Whole order"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11.5px] tabular-nums text-mist">
                    {o.previous_discount_pct}% <ArrowRight className="size-3" />{" "}
                    <span className="font-semibold text-ink">{o.proposed_discount_pct}%</span>
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${label.tone}`}
                >
                  {label.text}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div ref={threadRef} className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <p className="py-4 text-center text-[12px] text-mist">Loading conversation&hellip;</p>
        ) : messages.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-mist">
            {thread
              ? "No messages yet. Anything you send here appears on the customer's portal."
              : "Send this quotation to the customer to open a conversation."}
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-[14px] p-3 text-[12.5px] leading-relaxed ${
                m.author_type === "CUSTOMER"
                  ? "mr-3 border border-ink/8 bg-cream/50 text-ink sm:mr-5"
                  : "ml-3 tone-lilac text-lilac sm:ml-5"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-mist">
                <span className="font-semibold text-ink">{m.author_label}</span>
                <span>{new Date(m.created_at).toLocaleString()}</span>
              </div>
              {m.product_name ? (
                <p className="mb-1 inline-flex rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-semibold text-mist">
                  {m.product_name}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))
        )}
      </div>

      {thread ? (
        <div className="mt-3 space-y-2 border-t border-ink/6 pt-3">
          <div className="flex items-center gap-2 text-[11.5px]">
            <label htmlFor="reply-target" className="font-semibold text-mist">
              About:
            </label>
            <select
              id="reply-target"
              value={target}
              onChange={(e) =>
                setTarget(e.target.value === "ORDER" ? "ORDER" : Number(e.target.value))
              }
              disabled={!thread.negotiable}
              className="min-w-0 flex-1 rounded-full border border-ink/12 bg-cream/30 px-3 py-1.5 text-[11.5px] font-medium focus:outline-hidden disabled:opacity-50 sm:py-1"
            >
              <option value="ORDER">The whole order</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.product_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply to the customer…"
              disabled={busy || !thread.negotiable}
              className="min-w-0 flex-1 rounded-full border border-ink/15 bg-cream/30 px-4 py-2 text-[12.5px] focus:outline-hidden disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !thread.negotiable || !draft.trim()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-bone transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50 sm:size-8"
            >
              <Send className="size-3.5" />
            </button>
          </div>

          {error ? <p className="text-[11.5px] text-bad">{error}</p> : null}
          {!thread.negotiable ? (
            <p className="text-[11.5px] text-mist">
              {thread.status === "PENDING_APPROVAL"
                ? "Paused while these terms are under approval."
                : thread.status === "CONFIRMED"
                  ? "This quotation is confirmed, so the conversation is closed."
                  : "This quotation is not open for negotiation."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
