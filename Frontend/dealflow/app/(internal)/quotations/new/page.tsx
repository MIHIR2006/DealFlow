"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { ConfigApi, QuotationApi, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { Customer, Page } from "@/lib/types";

export default function NewQuotationPage() {
  const router = useRouter();
  const { data: customerPage, loading, refetch } = useFetch<Page<Customer>>("/v1/customers?limit=100");
  const customers = customerPage?.data ?? [];

  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<"BRONZE" | "SILVER" | "GOLD">("SILVER");
  const [savingCustomer, setSavingCustomer] = useState(false);

  async function createCustomer() {
    setError(null);
    setSavingCustomer(true);
    try {
      const customer = await ConfigApi.createCustomer({ name, email, tier });
      await refetch();
      setSelected(customer.id);
      setShowNewCustomer(false);
      setName("");
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create customer.");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function startQuotation() {
    if (!selected) return;
    setError(null);
    setCreating(true);
    try {
      const quote = await QuotationApi.create(selected);
      router.push(`/quotations/${quote.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create quotation.");
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/quotations"
          className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-cream transition-colors text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="font-serif text-[24px] font-medium tracking-tight text-ink">
          New quotation
        </h1>
      </div>

      <div className="rounded-[24px] bg-white p-5 card-shadow">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink">Who is this quote for?</h2>
          <button
            type="button"
            onClick={() => setShowNewCustomer((v) => !v)}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink hover:underline"
          >
            <Plus className="size-3.5" /> New customer
          </button>
        </div>

        {showNewCustomer ? (
          <div className="mt-3 space-y-2.5 rounded-[16px] border border-ink/8 bg-cream/40 p-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company name"
              className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-[13px] focus:outline-hidden"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Billing email"
              type="email"
              className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-[13px] focus:outline-hidden"
            />
            <div className="flex items-center gap-2">
              {(["BRONZE", "SILVER", "GOLD"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                    tier === t ? "bg-ink text-bone" : "bg-white text-mist border border-ink/10"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!name || !email || savingCustomer}
              onClick={createCustomer}
              className="w-full rounded-full bg-ink py-2 text-[12.5px] font-medium text-bone disabled:opacity-50"
            >
              {savingCustomer ? "Saving…" : "Add customer"}
            </button>
          </div>
        ) : null}

        <div className="mt-3 space-y-1.5 max-h-[320px] overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-[12.5px] text-mist">Loading customers&hellip;</p>
          ) : customers.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-mist">
              No customers yet. Add one above.
            </p>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                className={`flex w-full items-center justify-between rounded-[14px] border px-3.5 py-2.5 text-left transition-colors ${
                  selected === c.id
                    ? "border-ink bg-ink/5"
                    : "border-ink/8 hover:border-ink/20"
                }`}
              >
                <div>
                  <p className="text-[13px] font-medium text-ink">{c.name}</p>
                  <p className="text-[11.5px] text-mist">{c.email}</p>
                </div>
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded tone-warn text-warn">
                  {c.tier}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {error ? <p className="text-[13px] text-rose-700">{error}</p> : null}

      <button
        type="button"
        disabled={!selected || creating}
        onClick={startQuotation}
        className="w-full rounded-full bg-ink py-3 text-[13.5px] font-semibold text-bone disabled:opacity-50"
      >
        {creating ? "Creating draft…" : "Start quotation"}
      </button>
    </div>
  );
}
