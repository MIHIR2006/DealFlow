"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import type { AuthUser } from "@/lib/hooks";
import { UserCircle2, ChevronDown, Menu, X } from "lucide-react";

// Nav visibility follows the role definitions in the problem statement, so a
// role only carries the screens its own duties name. `roles` omitted means
// every staff role can see it.
//
//   Rep      builds quotations, tracks approval and fulfillment progress,
//            responds to negotiation requests.
//   Manager  approves over-threshold discounts, configures tiers and chains,
//            monitors deal health.
//   Finance  second-level approvals, warehouse splits and backorders,
//            recurring billing and credit notes.
//   Admin    backend setup (catalog, warehouses, plans, tiers) and
//            platform-wide analytics.
const links: { href: string; label: string; roles?: AuthUser["role"][] }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/quotations", label: "Quotations" },
  { href: "/approvals", label: "Approvals", roles: ["ADMIN", "MANAGER", "FINANCE"] },
  // A rep tracks fulfillment progress here; deciding splits and backorders is
  // gated inside the screen itself.
  { href: "/fulfillment", label: "Fulfillment" },
  // Recurring billing and credit notes are Finance's to reconcile.
  { href: "/subscriptions", label: "Subscriptions", roles: ["ADMIN", "FINANCE"] },
  { href: "/invoices", label: "Invoices", roles: ["ADMIN", "FINANCE"] },
  { href: "/deal-health", label: "Deal Health", roles: ["ADMIN", "MANAGER", "FINANCE"] },
  { href: "/reports", label: "Reports" },
  // Backend setup: products, price lists, warehouses, subscription plans.
  { href: "/products", label: "Catalog", roles: ["ADMIN"] },
  { href: "/governance", label: "Governance", roles: ["ADMIN", "MANAGER"] },
];

const ROLE_LABEL: Record<AuthUser["role"], string> = {
  REP: "Sales Rep",
  MANAGER: "Sales Manager",
  FINANCE: "Finance & Ops",
  ADMIN: "Administrator",
};

export function WorkspaceNav({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // Below `lg` the pill row cannot fit beside the identity chip, so the same
  // links move into a sheet under the header. Same pills, same states.
  const [navOpen, setNavOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Arriving somewhere new is the end of navigating: the sheet should not
  // still be covering the page you just asked for.
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  function signOut() {
    clearToken();
    router.push("/");
  }

  const visibleLinks = links.filter((l) => !l.roles || l.roles.includes(user.role));

  function pillClass(on: boolean) {
    return `shrink-0 rounded-full px-3 py-1.5 text-[12.5px] transition-colors cursor-pointer whitespace-nowrap ${
      on ? "bg-ink text-bone font-medium" : "text-ink/70 hover:bg-white hover:text-ink"
    }`;
  }

  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/8 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href="/dashboard"
          className="font-headline shrink-0 text-[15px] font-semibold tracking-tight text-ink"
        >
          DealFlow360
        </Link>

        <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-1 py-0.5 lg:flex scroll-x">
          {visibleLinks.map((l) => (
            <Link key={l.href} href={l.href} className={pillClass(isOn(l.href))}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <div ref={dropdownRef} className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] card-shadow cursor-pointer border border-ink/10 hover:border-ink/20 transition-all font-medium text-ink"
            >
              <UserCircle2 className="size-3.5 text-mist shrink-0" />
              <span>
                {user.name} ({ROLE_LABEL[user.role] ?? user.role})
              </span>
              <ChevronDown
                className={`size-3 text-mist transition-transform duration-200 shrink-0 ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-[20px] bg-white p-2 card-shadow border border-ink/10 z-50">
                <div className="px-3 py-2 text-[12px] text-mist">
                  <p className="font-medium text-ink">{user.name}</p>
                  <p>{user.email}</p>
                  {user.salesTeam ? <p className="mt-0.5">Team: {user.salesTeam}</p> : null}
                </div>
                <div className="border-t border-ink/6 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={signOut}
                    className="w-full rounded-xl px-3 py-2 text-left text-[12.5px] text-ink hover:bg-cream/60 cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-controls="workspace-mobile-nav"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            className="flex size-9 items-center justify-center rounded-full bg-white text-ink card-shadow border border-ink/10 transition-all hover:border-ink/20 lg:hidden"
          >
            {navOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {navOpen ? (
        <div
          id="workspace-mobile-nav"
          className="border-t border-ink/8 bg-cream/95 backdrop-blur-md lg:hidden"
        >
          <div className="mx-auto max-h-[calc(100svh-8rem)] max-w-[1280px] overflow-y-auto px-4 py-3 sm:px-6">
            <nav className="flex flex-wrap gap-1.5">
              {visibleLinks.map((l) => (
                <Link key={l.href} href={l.href} className={pillClass(isOn(l.href))}>
                  {l.label}
                </Link>
              ))}
            </nav>

            <div className="mt-3 rounded-[20px] border border-ink/10 bg-white p-2 card-shadow">
              <div className="flex items-start gap-2 px-3 py-2 text-[12px] text-mist">
                <UserCircle2 className="mt-0.5 size-4 shrink-0 text-mist" />
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {user.name} ({ROLE_LABEL[user.role] ?? user.role})
                  </p>
                  <p className="break-all">{user.email}</p>
                  {user.salesTeam ? <p className="mt-0.5">Team: {user.salesTeam}</p> : null}
                </div>
              </div>
              <div className="mt-1 border-t border-ink/6 pt-1">
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full rounded-xl px-3 py-2.5 text-left text-[12.5px] text-ink hover:bg-cream/60 cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
