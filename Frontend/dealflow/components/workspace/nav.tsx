"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import { UserCheck } from "lucide-react";

export interface Persona {
  id: string;
  name: string;
  role: "REP" | "MANAGER" | "FINANCE" | "ADMIN";
  label: string;
}

export const PERSONAS: Persona[] = [
  { id: "rep", name: "J. Rao", role: "REP", label: "Sales Rep" },
  { id: "mgr", name: "M. Shah", role: "MANAGER", label: "Sales Manager" },
  { id: "fin", name: "P. Nair", role: "FINANCE", label: "Finance & Ops" },
  { id: "admin", name: "System Admin", role: "ADMIN", label: "Administrator" },
];

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/quotations", label: "Quotations" },
  { href: "/approvals", label: "Approvals" },
  { href: "/fulfillment", label: "Fulfillment" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/invoices", label: "Invoices" },
  { href: "/deal-health", label: "Deal Health" },
  { href: "/reports", label: "Reports" },
  { href: "/products", label: "Catalog" },
  { href: "/governance", label: "Governance" },
];

export function WorkspaceNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [activePersona, setActivePersona] = useState<Persona>(PERSONAS[0]);

  useEffect(() => {
    const saved = localStorage.getItem("df360.active_persona");
    if (saved) {
      const match = PERSONAS.find((p) => p.id === saved);
      if (match) setActivePersona(match);
    }
  }, []);

  function handlePersonaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const match = PERSONAS.find((p) => p.id === e.target.value);
    if (match) {
      setActivePersona(match);
      localStorage.setItem("df360.active_persona", match.id);
      window.dispatchEvent(new Event("df360:persona-changed"));
    }
  }

  function signOut() {
    clearToken();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink/8 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href="/dashboard"
          className="font-headline shrink-0 text-[15px] font-semibold tracking-tight text-ink flex items-center gap-2"
        >
          <span className="size-2 rounded-full bg-emerald-600 animate-pulse" title="System Connected" />
          DealFlow<span className="text-ink/60">360</span>
        </Link>

        {/* Global Nav Links */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 ml-2">
          {links.map((l) => {
            const on =
              pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] transition-colors ${
                  on
                    ? "bg-ink text-bone font-medium shadow-xs"
                    : "text-ink/70 hover:bg-white/80 hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Tools: Persona Simulator & Sign Out */}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/* Persona Switcher */}
          <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/80 px-2.5 py-1 text-[12px] shadow-xs">
            <UserCheck className="size-3.5 text-emerald-700" />
            <select
              value={activePersona.id}
              onChange={handlePersonaChange}
              className="bg-transparent font-medium text-ink cursor-pointer focus:outline-hidden"
              title="Switch demo persona to test role-based governance"
            >
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.label})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="rounded-full px-2.5 py-1 text-[12px] text-mist hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
