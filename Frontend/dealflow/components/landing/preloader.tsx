"use client";

import { useEffect, useState } from "react";

export function Preloader() {
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const startTime = performance.now();
    const duration = 1250;

    const updateProgress = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgress(pct);

      if (pct < 100) {
        requestAnimationFrame(updateProgress);
      } else {
        setTimeout(() => setComplete(true), 180);
        setTimeout(() => setHidden(true), 920);
      }
    };

    const animId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animId);
  }, []);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden bg-cream px-6 py-8 text-ink transition-transform duration-700 ease-[cubic-bezier(0.76,0,0.24,1)] sm:px-12 sm:py-12 ${
        complete ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-mist sm:text-[13px]">
        <span className="font-semibold text-ink">DealFlow360</span>
        <span>Self-Governing Engine</span>
      </div>

      {/* Center Giant Serif Liquid Fill Typography */}
      <div className="my-auto flex flex-col items-center justify-center py-12 text-center select-none">
        <div className="relative">
          <h1
            className="font-serif text-[13vw] leading-none tracking-[-0.04em] sm:text-[130px] lg:text-[170px]"
            style={{
              backgroundImage: `linear-gradient(to top, #1c1b18 ${progress}%, oklch(0.23 0.002 85 / 0.15) ${progress}%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            DealFlow360
          </h1>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <div className="h-px w-12 bg-ink/20" />
          <span className="font-mono text-[16px] font-semibold tracking-wider text-ink">
            {progress.toString().padStart(3, "0")}%
          </span>
          <div className="h-px w-12 bg-ink/20" />
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="flex items-center justify-between gap-3 text-[12px] text-mist sm:text-[13px]">
        <div className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-ink animate-pulse" />
          <span>Evaluating risk rules</span>
        </div>
        <span>Worked Example §10</span>
      </div>
    </div>
  );
}
