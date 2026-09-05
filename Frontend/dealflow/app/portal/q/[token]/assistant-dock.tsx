"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { AssistantApi, ApiError } from "@/lib/api";

type Turn = { role: "CUSTOMER" | "ASSISTANT"; body: string };

/**
 * The negotiation assistant, docked to the portal.
 *
 * It is an aside, not a second portal: everything it can do, it does through
 * the same token-scoped backend routes this page uses, so a discount it
 * submits goes through governance exactly as the counter-offer form does. It
 * renders only when the assistant service is configured and reachable, and
 * any failure closes over quietly -- the quotation, the counter-offer form,
 * and the confirm button all keep working without it.
 */
export function AssistantDock({
  token,
  reference,
  negotiationOpen,
  onQuotationChanged,
}: {
  token: string;
  reference: string;
  /** Terms are fixed once confirmed, or paused while a proposal is in review. */
  negotiationOpen: boolean;
  /** The assistant acts through the backend, so the page must re-read after a turn. */
  onQuotationChanged: () => void;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    AssistantApi.available().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [turns, busy]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || busy) return;

    setTurns((prev) => [...prev, { role: "CUSTOMER", body: message }]);
    setDraft("");
    setBusy(true);
    setError(null);

    try {
      const reply = await AssistantApi.chat(token, message);
      setTurns((prev) => [...prev, { role: "ASSISTANT", body: reply }]);
      // A turn may have submitted a counter-offer or logged a message, so the
      // quotation on screen could now be stale.
      onQuotationChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setAvailable(false);
        setOpen(false);
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "The assistant could not answer just now.",
      );
    } finally {
      setBusy(false);
    }
  }, [draft, busy, token, onQuotationChanged]);

  if (!available) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] font-semibold text-bone shadow-lg transition-colors hover:bg-ink/90"
      >
        <Sparkles className="size-4" />
        Ask about this quotation
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex max-h-[min(560px,calc(100vh-3rem))] w-[min(380px,calc(100vw-3rem))] flex-col rounded-[24px] border border-ink/10 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-5 py-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <Sparkles className="size-3.5 text-mist" />
            Quotation assistant
          </h3>
          <p className="mt-0.5 text-[11.5px] text-mist">
            Answers about {reference} only
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1 text-mist transition-colors hover:text-ink"
          title="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {turns.length === 0 ? (
          <div className="rounded-[16px] bg-cream/50 p-3.5 text-[12.5px] leading-relaxed text-mist">
            <p className="font-semibold text-ink">How can I help?</p>
            <p className="mt-1">
              Ask what is on this quotation, request a discount, or check where your last
              request stands. Discount requests go through the same approval process as the
              form on this page.
            </p>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div
              key={i}
              className={`rounded-[16px] p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                turn.role === "CUSTOMER"
                  ? "tone-lilac text-lilac ml-6"
                  : "border border-ink/8 bg-cream/50 text-ink mr-6"
              }`}
            >
              {turn.body}
            </div>
          ))
        )}

        {busy ? (
          <p className="mr-6 rounded-[16px] border border-ink/8 bg-cream/50 p-3.5 text-[12.5px] text-mist">
            Thinking&hellip;
          </p>
        ) : null}

        {error ? (
          <div className="rounded-[16px] tone-bad p-3 text-[12px] text-bad">{error}</div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-ink/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              negotiationOpen ? "Ask a question or request a discount…" : "Ask a question…"
            }
            disabled={busy}
            maxLength={2000}
            className="flex-1 rounded-full border border-ink/15 bg-cream/30 px-4 py-2 text-[12.5px] focus:outline-hidden disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-bone transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-3.5" />
          </button>
        </div>
        <p className="text-[10.5px] leading-relaxed text-mist">
          An AI assistant. It can submit requests on your behalf, but it does not approve
          them — your sales team does.
        </p>
      </div>
    </div>
  );
}
