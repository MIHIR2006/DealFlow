"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type DealStage =
  | "QUOTE"
  | "PRICING"
  | "RISK"
  | "APPROVAL"
  | "FULFILLMENT"
  | "BILLING"
  | "PAID";

interface LifecycleBarProps {
  currentStage: DealStage;
  quoteId?: string | number;
  orderId?: string | number;
  className?: string;
}

const STAGES: { key: DealStage; label: string; href?: string }[] = [
  { key: "QUOTE", label: "1. Build Quote", href: "/quotations" },
  { key: "PRICING", label: "2. Pricing & Margin" },
  { key: "RISK", label: "3. Blended Risk" },
  { key: "APPROVAL", label: "4. Approval Chain", href: "/approvals" },
  { key: "FULFILLMENT", label: "5. Split & Ship", href: "/fulfillment" },
  { key: "BILLING", label: "6. Invoicing & Sub", href: "/subscriptions" },
  { key: "PAID", label: "7. Cash Settled", href: "/invoices" },
];

export function LifecycleBar({
  currentStage,
  className = "",
}: LifecycleBarProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div
      className={`flex items-center gap-1 overflow-x-auto rounded-full bg-white px-3 py-1.5 text-[12px] border border-ink/8 shadow-xs ${className}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-mist mr-1 shrink-0">
        Deal Flow:
      </span>
      {STAGES.map((s, idx) => {
        const isDone = idx < currentIndex;
        const isCurrent = idx === currentIndex;

        let style = "text-mist hover:text-ink";
        if (isCurrent) {
          style = "bg-ink text-bone font-semibold shadow-xs";
        } else if (isDone) {
          style = "text-emerald-800 font-medium";
        }

        return (
          <React.Fragment key={s.key}>
            {s.href ? (
              <Link
                href={s.href}
                className={`flex shrink-0 items-center rounded-full px-2.5 py-0.5 transition-colors ${style}`}
              >
                {isDone && <span className="mr-1">✓</span>}
                {s.label}
              </Link>
            ) : (
              <span
                className={`flex shrink-0 items-center rounded-full px-2.5 py-0.5 transition-colors ${style}`}
              >
                {isDone && <span className="mr-1">✓</span>}
                {s.label}
              </span>
            )}
            {idx < STAGES.length - 1 && (
              <ChevronRight className="size-3 text-ink/20 shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
