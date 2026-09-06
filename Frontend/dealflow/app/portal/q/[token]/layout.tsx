import React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function CustomerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream text-ink flex flex-col justify-between">
      {/* Customer-Facing Clean Header */}
      <header className="border-b border-ink/8 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-ink flex items-center justify-center text-bone font-bold text-[13px]">
              D
            </div>
            <span className="font-headline text-[15px] font-semibold tracking-tight">
              DealFlow360
            </span>
            <span className="text-[13px] text-mist">Portal</span>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-[12px] text-mist">
            <ShieldCheck className="size-4" aria-hidden />
            <span className="hidden sm:inline">Token-scoped session</span>
            <span className="sr-only sm:hidden">Token-scoped session</span>
          </div>
        </div>
      </header>

      {/* Portal Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      {/* Customer-Facing Footer */}
      <footer className="border-t border-ink/8 px-4 py-6 text-center text-[12px] text-mist sm:px-0">
        <p>
          &copy; 2026 DealFlow360 Enterprise Operations. This document and negotiation portal are legally protected.
        </p>
      </footer>
    </div>
  );
}
