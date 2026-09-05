"use client";

// The customer's vocabulary for the workflow, which is deliberately not our
// own. The internal StatusBadge renders PENDING_APPROVAL as "Pending Manager",
// which tells a customer exactly which internal role is holding their deal and
// invites them to negotiate against our approval chain. Here the same state
// reads as "Under review by our team": true, useful, and silent about who is
// reviewing or against what threshold.
const PORTAL_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "In preparation", tone: "bg-cream text-mist" },
  APPROVED: { label: "Ready for your review", tone: "bg-cream text-ink" },
  SENT: { label: "Awaiting your review", tone: "bg-cream text-ink" },
  UNDER_NEGOTIATION: { label: "Under negotiation", tone: "tone-lilac" },
  PENDING_APPROVAL: { label: "Under review by our team", tone: "tone-warn" },
  RETURNED: { label: "Under review by our team", tone: "tone-warn" },
  RETURNED_FOR_REVISION: { label: "Under review by our team", tone: "tone-warn" },
  CONFIRMED: { label: "Confirmed", tone: "tone-ok" },
  WON: { label: "Confirmed", tone: "tone-ok" },
  REJECTED: { label: "Closed", tone: "tone-bad" },
};

/** The customer-facing label for a quotation status. */
export function portalStatusLabel(status: string): string {
  const norm = (status || "").toUpperCase().replace(/[\s-]/g, "_");
  return PORTAL_STATUS[norm]?.label ?? "In progress";
}

/**
 * PortalStatusBadge is the portal's own badge. It mirrors the internal
 * StatusBadge visually so the portal reads as the same product, while never
 * borrowing its internal wording.
 */
export function PortalStatusBadge({
  status,
  size = "md",
  className = "",
}: {
  status: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const norm = (status || "").toUpperCase().replace(/[\s-]/g, "_");
  const mapped = PORTAL_STATUS[norm];
  const tone = mapped?.tone ?? "bg-cream text-mist";
  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap ${px} ${tone} ${className}`}
    >
      {mapped?.label ?? "In progress"}
    </span>
  );
}
