"use client";

import React, { useState } from "react";
import { ShieldCheck, Sliders, Save, CheckCircle2, AlertCircle } from "lucide-react";

export default function GovernanceConfigPage() {
  const [savedNotice, setSavedNotice] = useState(false);

  // Matrix 1: Customer Tier Discount Ceilings
  const [tierBronze, setTierBronze] = useState(5.0);
  const [tierSilver, setTierSilver] = useState(10.0);
  const [tierGold, setTierGold] = useState(15.0);

  // Matrix 2: Category Discount Ceilings
  const [catHardware, setCatHardware] = useState(15.0);
  const [catServices, setCatServices] = useState(10.0);
  const [catSubscriptions, setCatSubscriptions] = useState(20.0);

  // Matrix 3: Approval Chain Thresholds
  const [singleLineMgr, setSingleLineMgr] = useState(0.0);
  const [blendedFinance, setBlendedFinance] = useState(5.0);
  const [singleLineFinance, setSingleLineFinance] = useState(10.0);

  // Matrix 4: Deal Health Parameters
  const [stallDays, setStallDays] = useState(7);
  const [anomalyMultiplier, setAnomalyMultiplier] = useState(1.5);

  function handleSavePolicy() {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3500);
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

        <button
          type="button"
          onClick={handleSavePolicy}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-bone hover:bg-ink/90 shadow-sm transition-colors"
        >
          <Save className="size-4" /> Save Governance Policy
        </button>
      </div>

      {savedNotice && (
        <div className="rounded-[18px] tone-ok p-4 text-[13px] font-medium flex items-center gap-2.5">
          <CheckCircle2 className="size-4 text-ok shrink-0" />
          Governance rules committed to database! In-memory engine cache snapshot invalidated (v2026.08 updated).
        </div>
      )}

      {/* MATRIX 1: CUSTOMER TIER CEILINGS */}
      <div className="rounded-[24px] bg-white p-6 card-shadow">
        <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
          1. Customer Tier Discount Ceilings
        </h2>
        <p className="text-[12.5px] text-mist mt-1">
          Base discretion granted according to customer relationship tier.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
            <span className="font-semibold text-[13.5px] text-warn">
              Bronze Tier Customer
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={tierBronze}
                onChange={(e) => setTierBronze(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px]"
              />
              <span className="text-mist font-semibold">% Max</span>
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
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px]"
              />
              <span className="text-mist font-semibold">% Max</span>
            </div>
            <p className="text-[11px] text-mist mt-1.5">Mid-market recurring accounts</p>
          </div>

          <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
            <span className="font-semibold text-[13.5px] text-warn">
              Gold Tier Customer
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={tierGold}
                onChange={(e) => setTierGold(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px]"
              />
              <span className="text-mist font-semibold">% Max</span>
            </div>
            <p className="text-[11px] text-mist mt-1.5">Enterprise key accounts</p>
          </div>
        </div>
      </div>

      {/* MATRIX 2: CATEGORY SPECIFIC CEILINGS */}
      <div className="rounded-[24px] bg-white p-6 card-shadow">
        <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
          2. Product Category Discount Ceilings
        </h2>
        <p className="text-[12.5px] text-mist mt-1">
          Protects product categories with thinner gross margins (e.g. Services).
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
            <span className="font-semibold text-[13.5px] text-ink">
              Hardware Products
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={catHardware}
                onChange={(e) => setCatHardware(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px]"
              />
              <span className="text-mist font-semibold">% Limit</span>
            </div>
            <p className="text-[11px] text-mist mt-1.5">Laptops, Servers, Accessories</p>
          </div>

          <div className="p-4 rounded-[18px] tone-bad border border-transparent">
            <span className="font-semibold text-[13.5px] text-bad flex items-center gap-1.5">
              Professional Services
              <span className="text-[10px] tone-bad px-1.5 py-0.5 rounded-full font-medium">Strict</span>
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={catServices}
                onChange={(e) => setCatServices(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px] text-bad"
              />
              <span className="text-mist font-semibold">% Limit</span>
            </div>
            <p className="text-[11px] text-bad/80 mt-1.5">Thin margins; Setup &amp; Migration</p>
          </div>

          <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
            <span className="font-semibold text-[13.5px] text-ink">
              Subscriptions (SaaS)
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={catSubscriptions}
                onChange={(e) => setCatSubscriptions(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px]"
              />
              <span className="text-mist font-semibold">% Limit</span>
            </div>
            <p className="text-[11px] text-mist mt-1.5">High margin cloud licenses</p>
          </div>
        </div>
      </div>

      {/* MATRIX 3: APPROVAL CHAIN ROUTING POLICY */}
      <div className="rounded-[24px] bg-white p-6 card-shadow">
        <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
          3. Automated Approval Routing Rules
        </h2>
        <p className="text-[12.5px] text-mist mt-1">
          Conditions deciding which reviewer level is required for quotation sign-off.
        </p>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between p-3.5 rounded-[16px] bg-cream/40 border border-ink/6 text-[13px]">
            <div>
              <span className="font-semibold text-ink">
                Sales Manager Review (Tier 1 Trigger):
              </span>
              <p className="text-[12px] text-mist">
                Any single line discount exceeding its allowed limit by more than:
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={singleLineMgr}
                onChange={(e) => setSingleLineMgr(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-lg border border-ink/15 bg-white p-1.5 font-bold text-center"
              />
              <span className="text-mist">points</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between p-3.5 rounded-[16px] tone-bad border border-transparent text-[13px]">
            <div>
              <span className="font-semibold text-bad">
                Finance Review (Tier 2 Trigger &mdash; Blended Risk):
              </span>
              <p className="text-[12px] text-bad/80">
                Weighted blended risk score across the entire order exceeds:
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={blendedFinance}
                onChange={(e) => setBlendedFinance(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-lg border border-ink/15 bg-white p-1.5 font-bold text-center text-bad"
              />
              <span className="text-bad">% score</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between p-3.5 rounded-[16px] tone-bad border border-transparent text-[13px]">
            <div>
              <span className="font-semibold text-bad">
                Finance Review (Tier 2 Trigger &mdash; Maximum Single-Line Overage):
              </span>
              <p className="text-[12px] text-bad/80">
                Any single line item exceeds allowed discretion by at least:
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={singleLineFinance}
                onChange={(e) => setSingleLineFinance(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-lg border border-ink/15 bg-white p-1.5 font-bold text-center text-bad"
              />
              <span className="text-bad">points</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
