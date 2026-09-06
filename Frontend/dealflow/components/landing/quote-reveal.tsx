"use client";

import { useEffect, useRef, useState } from "react";

export function QuoteReveal({
  lines,
  className = "",
}: {
  lines: string[];
  className?: string;
}) {
  const ref = useRef<HTMLQuoteElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const words = lines.join(" ").split(" ");

  useEffect(() => {
    const handleScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Progress 0 when quote enters bottom of screen (85%), 1 when it passes middle (35%)
      const start = windowHeight * 0.85;
      const end = windowHeight * 0.35;
      const current = rect.top;

      const p = Math.min(1, Math.max(0, (start - current) / (start - end)));
      setScrollProgress(p);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <blockquote
      ref={ref}
      className={`font-serif font-semibold text-[28px] leading-[1.22] tracking-[-0.02em] text-balance sm:text-[42px] lg:text-[50px] ${className}`}
    >
      <span className="sr-only">{lines.join(" ")}</span>
      <span aria-hidden="true" className="inline">
        {words.map((word, i) => {
          const wordThreshold = (i + 1) / words.length;
          const isHighlighted = scrollProgress >= wordThreshold - 0.04;

          return (
            <span
              key={`${word}-${i}`}
              className={`inline transition-colors duration-300 ${
                isHighlighted ? "text-ink opacity-100" : "text-ink/25"
              }`}
            >
              {word}{i < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </span>
    </blockquote>
  );
}
