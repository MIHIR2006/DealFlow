"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("pending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-6 flex w-full max-w-[500px] items-center justify-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2.5 text-[13.5px] text-white backdrop-blur-xl sm:mt-8">
        <Check className="size-4" />
        You&rsquo;re on the list — we&rsquo;ll be in touch.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative mt-6 flex w-full max-w-[500px] flex-col items-center gap-2 sm:mt-8 sm:flex-row sm:rounded-full sm:border sm:border-white/25 sm:bg-white/15 sm:p-1 sm:backdrop-blur-xl sm:shadow-2xl"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        placeholder="Enter your work email"
        className="w-full rounded-full border border-white/20 bg-white/15 px-4 py-2 text-[13.5px] text-white placeholder-white/60 backdrop-blur-md focus:outline-none sm:border-none sm:bg-transparent sm:py-2 sm:backdrop-blur-none"
      />
      <button
        type="submit"
        disabled={status === "pending"}
        className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-bone px-4 py-2 text-[13.5px] font-medium text-ink shadow-lg transition-all hover:bg-white disabled:opacity-60 sm:w-auto sm:whitespace-nowrap"
      >
        {status === "pending" ? "Sending…" : "Talk to sales"}
        {status !== "pending" && <ArrowRight className="size-3.5" />}
      </button>
      {status === "error" ? (
        <p className="text-[12.5px] text-rose-200 sm:absolute sm:-bottom-6">
          Could not save that — try again.
        </p>
      ) : null}
    </form>
  );
}
