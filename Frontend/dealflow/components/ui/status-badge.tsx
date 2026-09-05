"use client";

import React from "react";

type StatusType =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "UNDER_NEGOTIATION"
  | "CONFIRMED"
  | "REJECTED"
  | "RETURNED"
  | "UNSPLIT"
  | "SUGGESTED"
  | "ALLOCATED"
  | "PARTIALLY_FULFILLED"
  | "BACKORDERED"
  | "FULFILLED"
  | "POSTED"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | string;

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, className = "", size = "md" }: StatusBadgeProps) {
  const norm = (status || "").toUpperCase().replace(/[\s-]/g, "_");

  let label = status;
  let bg = "bg-ink/5 text-ink/80 border-ink/10";

  switch (norm) {
    case "DRAFT":
      label = "Draft";
      bg = "bg-amber-500/10 text-amber-800 border-amber-500/20";
      break;
    case "PENDING_APPROVAL":
    case "PENDING_MANAGER":
      label = "Pending Manager";
      bg = "bg-amber-500/15 text-amber-900 border-amber-500/30";
      break;
    case "PENDING_FINANCE":
      label = "Pending Finance";
      bg = "bg-rose-500/15 text-rose-900 border-rose-500/30";
      break;
    case "APPROVED":
      label = "Approved";
      bg = "bg-emerald-500/10 text-emerald-800 border-emerald-500/20";
      break;
    case "SENT":
      label = "Sent to Portal";
      bg = "bg-blue-500/10 text-blue-800 border-blue-500/20";
      break;
    case "UNDER_NEGOTIATION":
      label = "Under Negotiation";
      bg = "bg-purple-500/10 text-purple-800 border-purple-500/20";
      break;
    case "CONFIRMED":
    case "WON":
      label = "Confirmed";
      bg = "bg-emerald-600/15 text-emerald-900 border-emerald-600/30 font-semibold";
      break;
    case "REJECTED":
      label = "Rejected";
      bg = "bg-rose-600/15 text-rose-900 border-rose-600/30";
      break;
    case "RETURNED":
    case "RETURNED_FOR_REVISION":
      label = "Returned for Revision";
      bg = "bg-orange-500/15 text-orange-900 border-orange-500/30";
      break;
    case "FULFILLED":
    case "PAID":
      label = norm === "PAID" ? "Paid" : "Fulfilled";
      bg = "bg-emerald-500/15 text-emerald-800 border-emerald-500/25";
      break;
    case "PARTIAL":
    case "PARTIALLY_FULFILLED":
      label = norm === "PARTIAL" ? "Partially Paid" : "Partial Split";
      bg = "bg-amber-500/15 text-amber-800 border-amber-500/25";
      break;
    case "BACKORDERED":
      label = "Backordered";
      bg = "bg-rose-500/15 text-rose-800 border-rose-500/25";
      break;
    default:
      label = status;
      break;
  }

  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border font-medium whitespace-nowrap transition-colors ${px} ${bg} ${className}`}
    >
      <span className="inline-block size-1.5 rounded-full mr-1.5 bg-current opacity-75" />
      {label}
    </span>
  );
}
