"use client";

import { useState, useEffect } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

const links = [
  { href: "#engine", label: "Product" },
  { href: "#how", label: "How it decides" },
  { href: "#portal", label: "Portal" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 700) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex max-w-[1280px] items-start justify-between gap-3">
        <nav
          className={`pointer-events-auto flex items-center gap-1 rounded-full py-1.5 pr-2 pl-3.5 sm:pl-4 transition-all duration-300 ${
            scrolled
              ? "bg-white text-ink shadow-capsule border border-black/5"
              : "bg-white/10 backdrop-blur-md text-white border border-white/20 shadow-2xl"
          }`}
        >
          <a
            href="#top"
            className={`font-headline text-[15px] font-semibold tracking-tight transition-colors ${
              scrolled ? "text-ink" : "text-white"
            }`}
          >
            DealFlow360
          </a>
          <span
            className={`mx-2 hidden h-4 w-px transition-colors sm:block ${
              scrolled ? "bg-ink/15" : "bg-white/20"
            }`}
          />
          <div className="hidden items-center sm:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${
                  scrolled
                    ? "text-ink/75 hover:text-ink"
                    : "text-white/80 hover:text-white"
                }`}
              >
                {l.label}
              </a>
            ))}
          </div>
          <button
            type="button"
            className="ml-1 flex size-8 items-center justify-center rounded-full sm:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </nav>

        <nav
          className={`pointer-events-auto hidden items-center rounded-full py-1.5 pr-1.5 pl-2 sm:flex transition-all duration-300 ${
            scrolled
              ? "bg-white text-ink shadow-capsule border border-black/5"
              : "bg-white/10 backdrop-blur-md text-white border border-white/20 shadow-2xl"
          }`}
        >
          <a
            href="#faq"
            className={`rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${
              scrolled
                ? "text-ink/75 hover:text-ink"
                : "text-white/80 hover:text-white"
            }`}
          >
            FAQ
          </a>
          <span
            className={`mx-1 h-4 w-px transition-colors ${
              scrolled ? "bg-ink/15" : "bg-white/20"
            }`}
          />
          <a
            href="/signin"
            className={`rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${
              scrolled
                ? "text-ink/75 hover:text-ink"
                : "text-white/80 hover:text-white"
            }`}
          >
            Sign in
          </a>
          <a
            href="/register"
            className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-all ${
              scrolled
                ? "bg-ink text-bone hover:bg-ink/85"
                : "bg-white/15 text-white border border-white/20 hover:bg-white/25"
            }`}
          >
            Get access
            <ArrowRight className="size-3.5" />
          </a>
        </nav>

        <a
          href="/register"
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full py-2 pr-3 pl-3.5 text-[13px] font-medium transition-all sm:hidden ${
            scrolled
              ? "bg-white text-ink shadow-capsule border border-black/5"
              : "bg-white/10 backdrop-blur-md text-white border border-white/20 shadow-2xl"
          }`}
        >
          Get access
          <ArrowRight className="size-3.5" />
        </a>
      </div>

      {open ? (
        <div
          className={`pointer-events-auto mt-2 flex flex-col rounded-2xl p-2 sm:hidden transition-all duration-300 ${
            scrolled
              ? "bg-white text-ink shadow-capsule border border-black/5"
              : "bg-white/10 backdrop-blur-md text-white border border-white/20 shadow-2xl"
          }`}
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`rounded-xl px-3 py-2.5 text-[14px] ${
                scrolled ? "text-ink" : "text-white"
              }`}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a
            href="/signin"
            className={`rounded-xl px-3 py-2.5 text-[14px] ${
              scrolled ? "text-ink" : "text-white"
            }`}
            onClick={() => setOpen(false)}
          >
            Sign in
          </a>
        </div>
      ) : null}
    </header>
  );
}

