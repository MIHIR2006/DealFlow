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
  const [on, setOn] = useState(false);
  const words = lines.join(" ").split(" ");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setOn(true);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <blockquote
      ref={ref}
      className={`font-serif text-[28px] leading-[1.25] tracking-[-0.02em] text-balance sm:text-[40px] lg:text-[48px] ${className}`}
    >
      <span className="sr-only">{lines.join(" ")}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className={`quote-word ${on ? "is-on" : ""}`}
            style={{ animationDelay: `${i * 55}ms` }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </blockquote>
  );
}
