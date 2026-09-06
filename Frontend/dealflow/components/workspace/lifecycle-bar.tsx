"use client";

import Link from "next/link";

export type DealStage =
  | "QUOTE"
  | "PRICING"
  | "RISK"
  | "APPROVAL"
  | "FULFILLMENT"
  | "BILLING"
  | "PAID";

const STAGES: { key: DealStage; label: string; href?: string }[] = [
  { key: "QUOTE", label: "Quote", href: "/quotations" },
  { key: "PRICING", label: "Margin" },
  { key: "RISK", label: "Risk" },
  { key: "APPROVAL", label: "Approval", href: "/approvals" },
  { key: "FULFILLMENT", label: "Fulfillment", href: "/fulfillment" },
  { key: "BILLING", label: "Billing", href: "/subscriptions" },
  { key: "PAID", label: "Paid", href: "/invoices" },
];

export function LifecycleBar({
  currentStage,
  className = "",
}: {
  currentStage: DealStage;
  quoteId?: string | number;
  orderId?: string | number;
  className?: string;
}) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div
      className={`scroll-x flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12.5px] card-shadow ${className}`}
    >
      <span className="mr-1 shrink-0 text-mist">Flow</span>
      {STAGES.map((s, idx) => {
        const isDone = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const style = isCurrent
          ? "bg-ink text-bone"
          : isDone
            ? "text-ink"
            : "text-mist hover:text-ink";
        const cls = `flex shrink-0 items-center rounded-full px-2.5 py-0.5 ${style}`;

        return (
          <span key={s.key} className="flex shrink-0 items-center gap-1">
            {s.href ? (
              <Link href={s.href} className={cls}>
                {s.label}
              </Link>
            ) : (
              <span className={cls}>{s.label}</span>
            )}
            {idx < STAGES.length - 1 ? (
              <span className="text-ink/20">·</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
