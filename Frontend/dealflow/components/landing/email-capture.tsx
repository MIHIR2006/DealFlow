"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

/**
 * The landing page's primary call to action.
 *
 * One field and one button: an address, and a request to be contacted. The
 * submit reaches a sales inbox as mail, so the form is not a list somebody has
 * to remember to read.
 *
 * The input is `flex-1 min-w-0` rather than `w-full`. As a flex child, a
 * full-width input claims the whole row and pushes the button out of the
 * container entirely — which is what left this CTA with no visible button.
 */
export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // Whether a sales rep was actually notified. The page says only what
  // happened: claiming a notification that never left is worse than a plainer
  // confirmation.
  const [notified, setNotified] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "pending") return;

    setStatus("pending");
    setMessage(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "That did not go through.");
      }
      const payload = await res.json().catch(() => null);
      setNotified(Boolean(payload?.notified));
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "That did not go through.");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-6 flex w-full max-w-[520px] items-center justify-center gap-2 rounded-full border border-white/25 bg-white/15 px-5 py-3 text-[13.5px] text-white backdrop-blur-xl sm:mt-8">
        <Check className="size-4 shrink-0" />
        <span>
          {notified ? "Thanks — a sales rep has been notified and will email " : "Thanks — your request is recorded. A rep will be in touch with "}
          <strong className="font-semibold">{email}</strong> shortly.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-6 w-full max-w-[520px] sm:mt-8">
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-1.5 sm:rounded-full sm:border sm:border-white/25 sm:bg-white/15 sm:p-1.5 sm:shadow-2xl sm:backdrop-blur-xl"
      >
        <label htmlFor="cta-email" className="sr-only">
          Your work email
        </label>
        <input
          id="cta-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") {
              setStatus("idle");
              setMessage(null);
            }
          }}
          placeholder="Enter your work email"
          className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/15 px-5 py-2.5 text-[13.5px] text-white placeholder-white/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-white/40 sm:border-none sm:bg-transparent sm:px-4 sm:py-1.5 sm:backdrop-blur-none sm:focus:ring-0"
        />
        <button
          type="submit"
          disabled={status === "pending"}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-bone px-5 py-2.5 text-[13.5px] font-semibold text-ink shadow-lg transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:py-2"
        >
          {status === "pending" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Sending
            </>
          ) : (
            <>
              Request a callback
              <ArrowRight className="size-3.5" />
            </>
          )}
        </button>
      </form>

      <p
        className={`mt-2 text-center text-[12px] ${
          status === "error" ? "text-rose-200" : "text-bone/70"
        }`}
        role={status === "error" ? "alert" : undefined}
      >
        {status === "error"
          ? message
          : "Goes straight to a sales rep. No spam, and no account needed."}
      </p>
    </div>
  );
}
