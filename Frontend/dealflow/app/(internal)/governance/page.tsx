"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, Sliders, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { useFetch, useMutation } from "@/lib/hooks";
import { api } from "@/lib/api";

interface DiscountTier {
  tier: string;
  max_discount_pct: string;
}

interface CategoryCeiling {
  category_id: number;
  category_name: string;
  max_discount_pct: string;
}

interface ApprovalPolicy {
  id: number;
  name: string;
  trigger_type: string;
  threshold: string;
  required_role: string;
}

interface GovernanceSnapshot {
  version: number;
  loaded_at: string;
  tiers: DiscountTier[];
  category_ceilings: CategoryCeiling[];
  policies: ApprovalPolicy[];
}

export default function GovernanceConfigPage() {
  const { data: govRes, loading, error, refetch } = useFetch<GovernanceSnapshot>("/v1/governance");
  const gov = govRes;

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Matrix 1: Customer Tier Discount Ceilings
  const [tierBronze, setTierBronze] = useState(5.0);
  const [tierSilver, setTierSilver] = useState(10.0);
  const [tierGold, setTierGold] = useState(15.0);

  // Matrix 2: Category Discount Ceilings
  const [ceilings, setCeilings] = useState<{ id: number; name: string; pct: number }[]>([]);

  // Matrix 3: Approval Chain Thresholds
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);

  useEffect(() => {
    if (gov) {
      const b = gov.tiers.find((t) => t.tier === "BRONZE");
      const s = gov.tiers.find((t) => t.tier === "SILVER");
      const g = gov.tiers.find((t) => t.tier === "GOLD");
      if (b) setTierBronze(parseFloat(b.max_discount_pct));
      if (s) setTierSilver(parseFloat(s.max_discount_pct));
      if (g) setTierGold(parseFloat(g.max_discount_pct));

      setCeilings(
        gov.category_ceilings.map((c) => ({
          id: c.category_id,
          name: c.category_name,
          pct: parseFloat(c.max_discount_pct),
        }))
      );

      setPolicies(gov.policies || []);
    }
  }, [gov]);

  async function handleSavePolicy() {
    setSaving(true);
    setSaveError(null);
    try {
      // 1. Update customer tiers
      await api("/v1/governance/tiers/BRONZE", {
        method: "PUT",
        body: JSON.stringify({ max_discount_pct: tierBronze.toFixed(2) }),
      });
      await api("/v1/governance/tiers/SILVER", {
        method: "PUT",
        body: JSON.stringify({ max_discount_pct: tierSilver.toFixed(2) }),
      });
      await api("/v1/governance/tiers/GOLD", {
        method: "PUT",
        body: JSON.stringify({ max_discount_pct: tierGold.toFixed(2) }),
      });

      // 2. Update category ceilings
      for (const c of ceilings) {
        await api(`/v1/governance/categories/${c.id}/ceiling`, {
          method: "PUT",
          body: JSON.stringify({ max_discount_pct: c.pct.toFixed(2) }),
        });
      }

      // 3. Update policies if needed
      for (const p of policies) {
        await api(`/v1/governance/policies/${p.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: p.name,
            trigger_type: p.trigger_type,
            threshold: p.threshold,
            required_role: p.required_role,
          }),
        });
      }

      refetch();
      setSavedNotice("Governance rules committed to database! In-memory engine cache snapshot reloaded.");
      setTimeout(() => setSavedNotice(null), 4500);
    } catch (e: any) {
      setSaveError(e.message || "Failed to update governance policy");
    } finally {
      setSaving(false);
    }
  }

  function updateCeilingPct(id: number, val: number) {
    setCeilings((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pct: val } : c))
    );
  }

  function updatePolicyThreshold(id: number, val: string) {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, threshold: val } : p))
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Policy Engine Setup</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Discount Governance &amp; Routing Matrix
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            Configure company-wide discount ceilings, category restrictions, and automated approval chain triggers. Changes take effect across active quotation sessions immediately.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {gov && (
            <span className="text-[11.5px] font-mono text-mist bg-white border border-ink/10 px-3 py-1.5 rounded-full">
              Engine Snapshot: v{gov.version}
            </span>
          )}
          <button
            type="button"
            disabled={saving || loading}
            onClick={handleSavePolicy}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-bone hover:bg-ink/90 shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? "Saving Rules..." : "Save Governance Policy"}
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center gap-2.5">
          <CheckCircle2 className="size-4 text-emerald-700 shrink-0" />
          {savedNotice}
        </div>
      )}

      {saveError && (
        <div className="rounded-[18px] bg-rose-500/10 p-4 border border-rose-500/20 text-[13px] text-rose-950 font-medium flex items-center gap-2.5">
          <AlertCircle className="size-4 text-rose-700 shrink-0" />
          {saveError}
        </div>
      )}

      {loading && (
        <div className="flex h-32 items-center justify-center">
          <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* MATRIX 1: CUSTOMER TIER CEILINGS */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
          1. Customer Tier Discount Ceilings
        </h2>
        <p className="text-[12.5px] text-mist mt-1">
          Base discretion granted according to customer relationship tier. Reps quoting below this limit require zero managerial sign-offs.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
            <span className="font-semibold text-[13.5px] text-amber-900">
              Bronze Tier Customer
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={tierBronze}
                onChange={(e) => setTierBronze(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-mono font-bold text-center text-[15px]"
              />
              <span className="font-mono text-mist font-semibold">% Max</span>
            </div>
            <p className="text-[11px] text-mist mt-1.5">Default entry account tier</p>
          </div>

          <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
            <span className="font-semibold text-[13.5px] text-slate-900">
              Silver Tier Customer
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={tierSilver}
                onChange={(e) => setTierSilver(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-mono font-bold text-center text-[15px]"
              />
              <span className="font-mono text-mist font-semibold">% Max</span>
            </div>
            <p className="text-[11px] text-mist mt-1.5">Mid-market recurring accounts</p>
          </div>

          <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
            <span className="font-semibold text-[13.5px] text-amber-800">
              Gold Tier Customer
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={tierGold}
                onChange={(e) => setTierGold(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-mono font-bold text-center text-[15px]"
              />
              <span className="font-mono text-mist font-semibold">% Max</span>
            </div>
            <p className="text-[11px] text-mist mt-1.5">Enterprise key accounts</p>
          </div>
        </div>
      </div>

      {/* MATRIX 2: CATEGORY SPECIFIC CEILINGS */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
          2. Product Category Discount Ceilings
        </h2>
        <p className="text-[12.5px] text-mist mt-1">
          Protects product categories with thinner gross margins (e.g. Services) regardless of customer tier discretion.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ceilings.map((c) => {
            const isStrict = c.name.toLowerCase().includes("service");
            return (
              <div
                key={c.id}
                className={`p-4 rounded-[18px] ${
                  isStrict
                    ? "bg-rose-50/70 border border-rose-200"
                    : "bg-cream/40 border border-ink/6"
                }`}
              >
                <span
                  className={`font-semibold text-[13.5px] flex items-center gap-1.5 ${
                    isStrict ? "text-rose-950" : "text-ink"
                  }`}
                >
                  {c.name}
                  {isStrict && (
                    <span className="text-[10px] bg-rose-200 text-rose-900 px-1 rounded font-bold">
                      Strict
                    </span>
                  )}
                </span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={c.pct}
                    onChange={(e) =>
                      updateCeilingPct(c.id, parseFloat(e.target.value) || 0)
                    }
                    className={`w-24 rounded-lg border bg-white p-2 font-mono font-bold text-center text-[15px] ${
                      isStrict
                        ? "border-rose-300 text-rose-950"
                        : "border-ink/15 text-ink"
                    }`}
                  />
                  <span className="font-mono text-mist font-semibold">% Limit</span>
                </div>
                <p
                  className={`text-[11px] mt-1.5 ${
                    isStrict ? "text-rose-900/80" : "text-mist"
                  }`}
                >
                  {isStrict
                    ? "Margin protected; single line trigger"
                    : "Standard category max limit"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* MATRIX 3: APPROVAL CHAIN ROUTING POLICY */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
          3. Automated Approval Routing Rules
        </h2>
        <p className="text-[12.5px] text-mist mt-1">
          Conditions deciding which reviewer level is required for quotation sign-off based on engine triggers.
        </p>

        <div className="mt-4 space-y-3">
          {policies.map((p) => {
            const isFinance = p.required_role === "FINANCE";
            return (
              <div
                key={p.id}
                className={`flex flex-wrap items-center justify-between p-3.5 rounded-[16px] border text-[13px] ${
                  isFinance
                    ? "bg-rose-50/60 border-rose-200"
                    : "bg-cream/40 border-ink/6"
                }`}
              >
                <div>
                  <span
                    className={`font-semibold ${
                      isFinance ? "text-rose-950" : "text-ink"
                    }`}
                  >
                    {p.name} ({p.required_role}):
                  </span>
                  <p
                    className={`text-[12px] ${
                      isFinance ? "text-rose-900/80" : "text-mist"
                    }`}
                  >
                    Trigger: <code className="font-mono text-[11px]">{p.trigger_type}</code>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={p.threshold}
                    onChange={(e) => updatePolicyThreshold(p.id, e.target.value)}
                    className={`w-24 rounded-lg border bg-white p-1.5 font-mono font-bold text-center ${
                      isFinance
                        ? "border-rose-300 text-rose-950"
                        : "border-ink/15 text-ink"
                    }`}
                  />
                  <span
                    className={`font-mono ${
                      isFinance ? "text-rose-900" : "text-mist"
                    }`}
                  >
                    {p.trigger_type.includes("BLENDED") ? "% score" : "points"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
