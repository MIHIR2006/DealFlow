"use client";

import React from "react";

interface MarginBarProps {
  marginPct: number | string;
  targetPct?: number;
  floorPct?: number;
  showLabels?: boolean;
  className?: string;
}

export function MarginBar({
  marginPct,
  targetPct = 25,
  floorPct = 12,
  showLabels = true,
  className = "",
}: MarginBarProps) {
  const numericPct = typeof marginPct === "string" ? parseFloat(marginPct) || 0 : marginPct;
  const clampedWidth = Math.max(0, Math.min(100, (numericPct / 40) * 100));

  let statusColor = "bg-emerald-600";
  let textColor = "text-emerald-700";
  let statusText = "Healthy";

  if (numericPct < floorPct) {
    statusColor = "bg-rose-600";
    textColor = "text-rose-700";
    statusText = "Danger";
  } else if (numericPct < 20) {
    statusColor = "bg-amber-500";
    textColor = "text-amber-700";
    statusText = "Moderate";
  }

  return (
    <div className={`w-full ${className}`}>
      {showLabels && (
        <div className="flex items-center justify-between text-[12.5px] mb-1.5 font-medium">
          <span className="text-ink/80 flex items-center gap-1.5">
            Gross Margin
            <span className={`text-[11px] px-1.5 py-0.2 rounded font-semibold ${textColor} bg-ink/5`}>
              {statusText}
            </span>
          </span>
          <span className={`font-mono text-[14px] font-semibold tabular-nums ${textColor}`}>
            {numericPct.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Progress Track */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full transition-all duration-500 ease-out rounded-full ${statusColor}`}
          style={{ width: `${clampedWidth}%` }}
        />
        {/* Target Pin */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-ink/40 z-10"
          style={{ left: `${(targetPct / 40) * 100}%` }}
          title={`Target Margin: ${targetPct}%`}
        />
      </div>

      {showLabels && (
        <div className="flex items-center justify-between text-[11px] text-mist mt-1">
          <span>0%</span>
          <span>Target: {targetPct}%</span>
          <span>40%+</span>
        </div>
      )}
    </div>
  );
}
