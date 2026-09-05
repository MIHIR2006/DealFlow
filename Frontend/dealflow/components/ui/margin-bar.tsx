"use client";

export function MarginBar({
  marginPct,
  targetPct = 25,
  floorPct = 12,
  showLabels = true,
  className = "",
}: {
  marginPct: number | string;
  targetPct?: number;
  floorPct?: number;
  showLabels?: boolean;
  className?: string;
}) {
  const numericPct =
    typeof marginPct === "string" ? parseFloat(marginPct) || 0 : marginPct;
  const clampedWidth = Math.max(0, Math.min(100, (numericPct / 40) * 100));

  let fill = "fill-ok";
  let text = "text-ok";
  let statusText = "Healthy";

  if (numericPct < floorPct) {
    fill = "fill-bad";
    text = "text-bad";
    statusText = "Below floor";
  } else if (numericPct < 20) {
    fill = "fill-warn";
    text = "text-warn";
    statusText = "Tight";
  }

  return (
    <div className={`w-full ${className}`}>
      {showLabels ? (
        <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium">
          <span className="flex items-center gap-1.5 text-ink/80">
            Gross margin
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${text}`}>{statusText}</span>
          </span>
          <span className={`text-[14px] font-semibold tabular-nums ${text}`}>
            {numericPct.toFixed(1)}%
          </span>
        </div>
      ) : null}

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${fill}`}
          style={{ width: `${clampedWidth}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-ink/30"
          style={{ left: `${(targetPct / 40) * 100}%` }}
          title={`Target ${targetPct}%`}
        />
      </div>

      {showLabels ? (
        <div className="mt-1 flex items-center justify-between text-[11px] text-mist">
          <span>0%</span>
          <span>Target {targetPct}%</span>
          <span>40%+</span>
        </div>
      ) : null}
    </div>
  );
}
