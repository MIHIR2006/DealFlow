"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";

type Scene = "over" | "ok" | "counter";

const scenes: { id: Scene; label: string }[] = [
  { id: "over", label: "Over-limit quote" },
  { id: "ok", label: "Within ceiling" },
  { id: "counter", label: "Customer counter" },
];

const copy: Record<
  Scene,
  { prompt: string; note: string; risk: string; warn: boolean; route: string }
> = {
  over: {
    prompt: "Add Setup Service at 18% for Acme Gold",
    note: "To keep margin discipline across mixed categories, here's the routing:",
    risk: "Blended risk 5.6%",
    warn: true,
    route: "Routed automatically to Manager, then Finance.",
  },
  ok: {
    prompt: "Add Laptop at 12% for Acme Gold",
    note: "Every line sits inside its own ceiling. No approval record is created.",
    risk: "Blended risk 0%",
    warn: false,
    route: "Straight through to fulfillment. Rep never asked.",
  },
  counter: {
    prompt: "Customer asks 20% on Setup Service",
    note: "A portal action mutated internal state. Chain rebuilt from step 1.",
    risk: "Blended risk 7.1%",
    warn: true,
    route: "Back in Pending Approval. Audit: “Customer counter-offer”.",
  },
};

function Line({
  name,
  given,
  allowed,
  result,
  over,
}: {
  name: string;
  given: string;
  allowed: string;
  result: string;
  over?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 text-[12px] sm:gap-x-3 sm:text-[13px] ${over ? "flag-row" : ""}`}
    >
      <span>{name}</span>
      <span className="text-right text-mist">{given}</span>
      <span className="text-right text-mist">{allowed}</span>
      <span
        className="text-right font-medium"
        style={{
          color: over ? "var(--color-status-warn)" : "var(--color-status-ok)",
        }}
      >
        {result}
      </span>
    </div>
  );
}

export function EngineCanvas() {
  const [scene, setScene] = useState<Scene>("over");
  const s = copy[scene];

  return (
    <div className="relative mx-auto max-w-[720px]">
      <div className="scroll-x flex justify-start gap-5 sm:justify-center sm:gap-10">
        {scenes.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setScene(tab.id)}
            className={`relative shrink-0 pb-2 text-[14px] whitespace-nowrap transition-colors sm:text-[15px] ${
              scene === tab.id
                ? "font-semibold text-ink"
                : "text-mist hover:text-ink"
            }`}
          >
            {tab.label}
            <span
              className={`absolute inset-x-0 -bottom-px h-px ${
                scene === tab.id ? "bg-ink" : "bg-ink/15"
              }`}
            />
          </button>
        ))}
      </div>

      <div className="mx-auto mt-8 flex max-w-[560px] items-center gap-2 rounded-full bg-white py-2 pr-2 pl-4 card-shadow sm:pl-5">
        <p className="min-w-0 flex-1 truncate text-[14px] text-ink">{s.prompt}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-bone">
          <ArrowUp className="size-4" />
        </span>
      </div>

      <p className="mx-auto mt-8 max-w-[560px] text-[14.5px] leading-relaxed text-ink/80">
        {s.note}
      </p>

      <div className="mx-auto mt-4 max-w-[560px] rounded-[18px] bg-white p-4 card-shadow sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-paper shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://api.dicebear.com/7.x/notionists/svg?seed=AcmeCorp&backgroundColor=ffdfbf"
                alt="Acme Corp"
                className="size-full rounded-full object-cover"
              />
            </div>
            <div>
              <p className="text-[12.5px] text-mist">Quotation Q-1042</p>
              <p className="text-[16px] font-semibold">Acme Corp</p>
            </div>
          </div>
          <span className="rounded-full border border-ink/10 px-2.5 py-1 text-[12px] font-medium text-mist">
            Gold
          </span>
        </div>

        <span
          key={scene}
          className={`mt-4 inline-block rounded-full px-3 py-1 text-[13px] font-medium ${scene === "over" ? "flag-badge" : ""}`}
          style={
            s.warn
              ? {
                  background: "var(--color-status-warn-bg)",
                  color: "var(--color-status-warn)",
                }
              : {
                  background: "var(--color-status-ok-bg)",
                  color: "var(--color-status-ok)",
                }
          }
        >
          {s.risk}
        </span>

        <div className="mt-5 border-t border-ink/8 pt-4">
          <div className="mb-3 grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[11px] text-mist sm:gap-x-3">
            <span>Line</span>
            <span className="text-right">Given</span>
            <span className="text-right">Allowed</span>
            <span className="text-right">Result</span>
          </div>
          {scene === "ok" ? (
            <Line
              name="Laptop (Hardware)"
              given="12%"
              allowed="15%"
              result="OK"
            />
          ) : (
            <div className="grid gap-y-2">
              <Line
                name="Laptop (Hardware)"
                given="12%"
                allowed="15%"
                result="OK"
              />
              <Line
                name="Setup Service (Service)"
                given={scene === "counter" ? "20%" : "18%"}
                allowed="10%"
                result={scene === "counter" ? "10pt over" : "8pt over"}
                over
              />
            </div>
          )}
        </div>

        <p className="mt-4 text-[13px] text-mist">{s.route}</p>
      </div>
    </div>
  );
}
