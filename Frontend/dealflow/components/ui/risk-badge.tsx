"use client";

import React from "react";

interface RiskBadgeProps {
  score: number | string;
  requiredLevel?: "NONE" | "MANAGER" | "FINANCE" | string;
  showLevel?: boolean;
  size?: "sm" | "md";
}

export function RiskBadge({
  score,
  requiredLevel,
  showLevel = false,
  size = "md",
}: RiskBadgeProps) {
  const numericScore = typeof score === "string" ? parseFloat(score) || 0 : score;

  let bg = "bg-emerald-500/15 text-emerald-900 border-emerald-500/30";
  let label = "In Policy";
  let levelText = "No Approval Required";

  if (requiredLevel === "FINANCE" || numericScore >= 5.0) {
    bg = "bg-rose-500/15 text-rose-900 border-rose-500/30";
    label = "High Risk";
    levelText = "Manager + Finance";
  } else if (requiredLevel === "MANAGER" || numericScore > 0) {
    bg = "bg-amber-500/15 text-amber-900 border-amber-500/30";
    label = "Review Needed";
    levelText = "Sales Manager";
  }

  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border font-medium font-mono tabular-nums ${px} ${bg}`}
        title={`Blended Risk Score: ${numericScore.toFixed(1)}%`}
      >
        <span className="size-1.5 rounded-full mr-1 bg-current" />
        {numericScore.toFixed(1)}% {label}
      </span>
      {showLevel && (
        <span className="text-[11px] text-mist font-medium">
          ({levelText})
        </span>
      )}
    </div>
  );
}
