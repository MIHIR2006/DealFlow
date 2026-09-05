"use client";

type StatusType = string;

const TONE: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-cream text-mist" },
  PENDING_APPROVAL: { label: "Pending Manager", tone: "tone-warn" },
  PENDING_MANAGER: { label: "Pending Manager", tone: "tone-warn" },
  PENDING_FINANCE: { label: "Pending Finance", tone: "tone-warn" },
  APPROVED: { label: "Approved", tone: "tone-ok" },
  SENT: { label: "Sent to portal", tone: "bg-cream text-ink" },
  UNDER_NEGOTIATION: { label: "Under negotiation", tone: "tone-lilac" },
  CONFIRMED: { label: "Confirmed", tone: "tone-ok" },
  WON: { label: "Confirmed", tone: "tone-ok" },
  REJECTED: { label: "Rejected", tone: "tone-bad" },
  RETURNED: { label: "Returned for revision", tone: "tone-warn" },
  RETURNED_FOR_REVISION: { label: "Returned for revision", tone: "tone-warn" },
  FULFILLED: { label: "Fulfilled", tone: "tone-ok" },
  PAID: { label: "Paid", tone: "tone-ok" },
  PARTIAL: { label: "Partially paid", tone: "tone-warn" },
  PARTIALLY_FULFILLED: { label: "Partial split", tone: "tone-warn" },
  BACKORDERED: { label: "Backordered", tone: "tone-bad" },
  OVERDUE: { label: "Overdue", tone: "tone-bad" },
};

export function StatusBadge({
  status,
  className = "",
  size = "md",
}: {
  status: StatusType;
  className?: string;
  size?: "sm" | "md";
}) {
  const norm = (status || "").toUpperCase().replace(/[\s-]/g, "_");
  const mapped = TONE[norm];
  const label = mapped?.label ?? status;
  const tone = mapped?.tone ?? "bg-cream text-mist";
  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap ${px} ${tone} ${className}`}
    >
      {label}
    </span>
  );
}
