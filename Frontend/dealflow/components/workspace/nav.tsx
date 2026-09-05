"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/quotations", label: "Quotations" },
  { href: "/approvals", label: "Approvals" },
  { href: "/fulfillment", label: "Fulfillment" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/invoices", label: "Invoices" },
  { href: "/deal-health", label: "Deal Health" },
  { href: "/reports", label: "Reports" },
  { href: "/products", label: "Product" },
];

export function WorkspaceNav() {
  const pathname = usePathname();
  const router = useRouter();

  function signOut() {
    clearToken();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink/6 bg-cream/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/dashboard"
          className="font-headline shrink-0 text-[15px] font-semibold tracking-tight"
        >
          DealFlow360
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => {
            const on =
              pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                  on
                    ? "bg-ink text-bone"
                    : "text-ink/70 hover:bg-white hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
          <span className="text-[13px] text-mist">J. Rao · Rep</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full px-3 py-1.5 text-[13px] text-ink/70 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
