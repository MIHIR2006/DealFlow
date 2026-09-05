"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import { UserCheck, ChevronDown, Check } from "lucide-react";

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
  const [mounted, setMounted] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("df360.active_persona");
    if (saved) {
      const match = PERSONAS.find((p) => p.id === saved);
      if (match) setActivePersona(match);
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPersonaOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectPersona(p: Persona) {
    setActivePersona(p);
    localStorage.setItem("df360.active_persona", p.id);
    window.dispatchEvent(new Event("df360:persona-changed"));
    setPersonaOpen(false);
  }

  function signOut() {
    clearToken();
    router.push("/");
  }

  const currentPersona = mounted ? activePersona : PERSONAS[0];

  return (
    <header className="sticky top-0 z-40 border-b border-ink/8 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href="/dashboard"
          className="font-headline shrink-0 text-[15px] font-semibold tracking-tight text-ink"
        >
          DealFlow360
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
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] transition-colors cursor-pointer whitespace-nowrap ${
                  on
                    ? "bg-ink text-bone font-medium"
                    : "text-ink/70 hover:bg-white hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Tools: Persona Simulator & Sign Out */}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/* Custom Persona Switcher Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setPersonaOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] card-shadow cursor-pointer border border-ink/10 hover:border-ink/20 transition-all font-medium text-ink"
              title="Switch demo persona to test role-based governance"
            >
              <UserCheck className="size-3.5 text-mist shrink-0" />
              <span>
                {currentPersona.name} ({currentPersona.label})
              </span>
              <ChevronDown
                className={`size-3 text-mist transition-transform duration-200 shrink-0 ${
                  personaOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {personaOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 rounded-[20px] bg-white p-2 card-shadow border border-ink/10 z-50 animate-in fade-in-50 zoom-in-95">
                <div className="px-3 py-1.5 text-[10.5px] font-semibold text-mist uppercase tracking-wider border-b border-ink/6 mb-1">
                  Switch Demo Persona
                </div>
                {PERSONAS.map((p) => {
                  const isSelected = currentPersona.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPersona(p)}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-ink text-bone font-semibold"
                          : "text-ink hover:bg-cream/60 font-medium"
                      }`}
                    >
                      <div>
                        <p className="leading-tight">{p.name}</p>
                        <p
                          className={`text-[11px] ${
                            isSelected ? "text-bone/75" : "text-mist"
                          }`}
                        >
                          {p.label}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="size-3.5 text-bone shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={signOut}
            className="rounded-full px-2.5 py-1 text-[12px] text-mist hover:text-ink transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
