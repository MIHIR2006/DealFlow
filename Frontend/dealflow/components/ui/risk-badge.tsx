"use client";

export function RiskBadge({
  score,
  requiredLevel,
  showLevel = false,
  size = "md",
}: {
  score: number | string;
  requiredLevel?: "NONE" | "MANAGER" | "FINANCE" | string;
  showLevel?: boolean;
  size?: "sm" | "md";
}) {
  const numericScore = typeof score === "string" ? parseFloat(score) || 0 : score;

  let tone = "tone-ok";
  let label = "In policy";
  let levelText = "No approval required";

  if (requiredLevel === "FINANCE" || numericScore >= 5) {
    tone = "tone-warn";
    label = "High risk";
    levelText = "Manager → Finance";
  } else if (requiredLevel === "MANAGER" || numericScore > 0) {
    tone = "tone-warn";
    label = "Review needed";
    levelText = "Sales Manager";
  }

  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[13px]";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full font-medium tabular-nums ${px} ${tone}`}
        title={`Blended risk ${numericScore.toFixed(1)}%`}
      >
        {numericScore.toFixed(1)}% {label}
      </span>
      {showLevel ? (
        <span className="text-[12px] text-mist">{levelText}</span>
      ) : null}
    </span>
  );
}
