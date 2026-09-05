"use client";

import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

const links = [
  { href: "#engine", label: "Product" },
  { href: "#how", label: "How it decides" },
  { href: "#portal", label: "Portal" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex max-w-[1280px] items-start justify-between gap-3">
        <nav className="capsule pointer-events-auto flex items-center gap-1 py-1.5 pr-2 pl-3.5 sm:pl-4">
          <a
            href="#top"
            className="font-headline text-[15px] font-semibold tracking-tight text-ink"
          >
            DealFlow360
          </a>
          <span className="mx-2 hidden h-4 w-px bg-ink/15 sm:block" />
          <div className="hidden items-center sm:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-full px-3 py-1.5 text-[13.5px] text-ink/75 transition-colors hover:text-ink"
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

        <nav className="capsule pointer-events-auto hidden items-center py-1.5 pr-1.5 pl-2 sm:flex">
          <a
            href="#faq"
            className="rounded-full px-3 py-1.5 text-[13.5px] text-ink/75 transition-colors hover:text-ink"
          >
            FAQ
          </a>
          <span className="mx-1 h-4 w-px bg-ink/15" />
          <a
            href="#get-started"
            className="rounded-full px-3 py-1.5 text-[13.5px] text-ink/75 transition-colors hover:text-ink"
          >
            Sign in
          </a>
          <a
            href="#get-started"
            className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[13.5px] font-medium text-bone transition-colors hover:bg-ink/85"
          >
            Get access
            <ArrowRight className="size-3.5" />
          </a>
        </nav>

        <a
          href="#get-started"
          className="capsule pointer-events-auto inline-flex items-center gap-1.5 py-2 pr-3 pl-3.5 text-[13px] font-medium text-ink sm:hidden"
        >
          Get access
          <ArrowRight className="size-3.5" />
        </a>
      </div>

      {open ? (
        <div className="capsule pointer-events-auto mt-2 flex flex-col p-2 sm:hidden">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-xl px-3 py-2.5 text-[14px] text-ink"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a
            href="#get-started"
            className="rounded-xl px-3 py-2.5 text-[14px] text-ink"
            onClick={() => setOpen(false)}
          >
            Sign in
          </a>
        </div>
      ) : null}
    </header>
  );
}
