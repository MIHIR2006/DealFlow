"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { AssistantApi, ApiError } from "@/lib/api";
import { useVoice } from "./use-voice";

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

  // Held in a ref so the voice controller, bound once, always speaks through
  // the current preference rather than the one captured at mount.
  const speakRef = useRef<(text: string) => void>(() => {});

  const send = useCallback(
    async (override?: string) => {
      const message = (override ?? draft).trim();
      if (!message || busy) return;

      setTurns((prev) => [...prev, { role: "CUSTOMER", body: message }]);
      setDraft("");
      setBusy(true);
      setError(null);

      try {
        const reply = await AssistantApi.chat(token, message);
        setTurns((prev) => [...prev, { role: "ASSISTANT", body: reply }]);
        speakRef.current(reply);
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
    },
    [draft, busy, token, onQuotationChanged],
  );

  // A finished utterance is a submitted question: the customer has already
  // said it out loud, so making them press send as well would be a second ask.
  const voice = useVoice(
    useCallback(
      (transcript: string) => {
        void send(transcript);
      },
      [send],
    ),
  );

  useEffect(() => {
    speakRef.current = voice.voiceReplies ? voice.speak : () => {};
  }, [voice.voiceReplies, voice.speak]);

  if (!available) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] font-semibold text-bone shadow-lg transition-colors hover:bg-ink/90 sm:bottom-6 sm:right-6"
      >
        <Sparkles className="size-4" />
        Ask or speak to us
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex max-h-[min(560px,calc(100svh-1.5rem))] flex-col rounded-[24px] border border-ink/10 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-h-[min(560px,calc(100svh-3rem))] sm:w-[380px]">
      <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-4 py-3.5 sm:px-5 sm:py-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <Sparkles className="size-3.5 text-mist" />
            Quotation assistant
          </h3>
          <p className="mt-0.5 text-[11.5px] text-mist">
            Answers about {reference} only
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {voice.ttsSupported ? (
            <button
              type="button"
              onClick={() => voice.setVoiceReplies(!voice.voiceReplies)}
              className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                voice.voiceReplies ? "tone-lilac text-lilac" : "text-mist hover:text-ink"
              }`}
              aria-pressed={voice.voiceReplies}
              title={voice.voiceReplies ? "Turn off spoken replies" : "Read replies aloud"}
            >
              {voice.voiceReplies ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex size-8 items-center justify-center rounded-full p-1 text-mist transition-colors hover:text-ink"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {turns.length === 0 ? (
          <div className="rounded-[16px] bg-cream/50 p-3.5 text-[12.5px] leading-relaxed text-mist">
            <p className="font-semibold text-ink">How can I help?</p>
            <p className="mt-1">
              Ask what is on this quotation, request a discount, or check where your last
              request stands. Discount requests go through the same approval process as the
              form on this page.
            </p>
            {voice.sttSupported ? (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink/70">
                <Mic className="size-3.5 shrink-0" />
                Or press the microphone and just ask.
              </p>
            ) : null}
          </div>
        ) : (
          turns.map((turn, i) => (
            <div
              key={i}
              className={`rounded-[16px] p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                turn.role === "CUSTOMER"
                  ? "tone-lilac text-lilac ml-4 sm:ml-6"
                  : "border border-ink/8 bg-cream/50 text-ink mr-4 sm:mr-6"
              }`}
            >
              {turn.body}
            </div>
          ))
        )}

        {voice.listening ? (
          <div className="ml-4 rounded-[16px] tone-lilac p-3.5 text-[12.5px] leading-relaxed text-lilac sm:ml-6">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              Listening&hellip;
            </span>
            {voice.interim ? <p className="mt-1 italic">{voice.interim}</p> : null}
          </div>
        ) : null}

        {busy ? (
          <p className="mr-4 rounded-[16px] border border-ink/8 bg-cream/50 p-3.5 text-[12.5px] text-mist sm:mr-6">
            Thinking&hellip;
          </p>
        ) : null}

        {error ? (
          <div className="rounded-[16px] tone-bad p-3 text-[12px] text-bad">{error}</div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-ink/8 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              voice.listening
                ? "Listening…"
                : negotiationOpen
                  ? "Ask a question or request a discount…"
                  : "Ask a question…"
            }
            disabled={busy || voice.listening}
            maxLength={2000}
            className="min-w-0 flex-1 rounded-full border border-ink/15 bg-cream/30 px-4 py-2 text-[12.5px] focus:outline-hidden disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          {voice.sttSupported ? (
            <button
              type="button"
              onClick={voice.listening ? voice.stopListening : voice.startListening}
              disabled={busy}
              aria-pressed={voice.listening}
              title={voice.listening ? "Stop listening" : "Ask by voice"}
              className={`flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:size-8 ${
                voice.listening
                  ? "animate-pulse border-transparent fill-lilac text-white"
                  : "border-ink/15 bg-white text-ink hover:bg-cream"
              }`}
            >
              {voice.listening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => send()}
            disabled={busy || !draft.trim()}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-bone transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50 sm:size-8"
          >
            <Send className="size-3.5" />
          </button>
        </div>
        {voice.error ? (
          <p className="text-[11px] font-medium text-bad">{voice.error}</p>
        ) : null}
        <p className="text-[10.5px] leading-relaxed text-mist">
          An AI assistant. It can submit requests on your behalf, but it does not approve
          them — your sales team does.
          {voice.sttSupported ? " Voice is processed by your browser." : ""}
        </p>
      </div>
    </div>
  );
}
