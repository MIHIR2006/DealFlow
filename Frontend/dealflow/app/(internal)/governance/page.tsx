"use client";

import React, { useState } from "react";
import { AlertCircle, Check, Loader2, Plus } from "lucide-react";
import { useFetch, useAuth, timeAgo } from "@/lib/hooks";
import { ConfigApi } from "@/lib/api";
import type { ApprovalPolicy, ApprovalPolicyInput, CategoryCeiling, DiscountTier, GovernanceSnapshot } from "@/lib/types";

const TIER_ORDER: DiscountTier["tier"][] = ["BRONZE", "SILVER", "GOLD"];
const TIER_LABEL: Record<string, string> = {
  BRONZE: "Bronze Tier Customer",
  SILVER: "Silver Tier Customer",
  GOLD: "Gold Tier Customer",
};

type FieldStatus = "idle" | "saving" | "ok" | "error";

/** Small per-field save indicator — there is no global save button any more,
 * every field persists on its own, so the reviewer needs to see that here. */
function StatusDot({ status, message }: { status: FieldStatus; message: string | null }) {
  if (status === "saving") return <Loader2 className="size-3.5 text-mist animate-spin" />;
  if (status === "ok") return <Check className="size-3.5 text-ok" />;
  if (status === "error") return <span className="text-[10.5px] font-medium text-bad">{message ?? "Failed"}</span>;
  return null;
}

function useFieldSave(onSaved?: () => void) {
  const [status, setStatus] = useState<FieldStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setStatus("saving");
    setMessage(null);
    try {
      await fn();
      setStatus("ok");
      onSaved?.();
      window.setTimeout(() => setStatus((s) => (s === "ok" ? "idle" : s)), 1800);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return { status, message, run };
}

export default function GovernanceConfigPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";

  const { data: snapshot, error, loading, refetch } = useFetch<GovernanceSnapshot>("/v1/governance");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">Policy Engine Setup</p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Discount Governance &amp; Routing Matrix
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[640px]">
            {canEdit
              ? "Every field below persists immediately — there is no batch save. Editing a ceiling changes what the risk engine reads on the very next quotation, with no restart."
              : "Read-only view of the discount ceilings and approval routing the risk engine is using right now. Only Admins and Managers can edit governance."}
          </p>
        </div>

        {snapshot && (
          <div className="rounded-[16px] bg-white px-4 py-2.5 card-shadow text-right">
            <p className="text-[10.5px] font-semibold uppercase text-mist">Engine Config Snapshot</p>
            <p className="text-[13px] font-semibold text-ink tabular-nums">v{snapshot.version}</p>
            <p className="text-[11px] text-mist">{timeAgo(snapshot.loaded_at)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-[18px] tone-bad p-4 text-[13px] font-medium flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" />
          {error.message}
        </div>
      )}

      {loading && !snapshot && (
        <div className="flex h-40 items-center justify-center">
          <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {snapshot && (
        <>
          {/* MATRIX 1: CUSTOMER TIER CEILINGS */}
          <div className="rounded-[24px] bg-white p-6 card-shadow">
            <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
              1. Customer Tier Discount Ceilings
            </h2>
            <p className="text-[12.5px] text-mist mt-1">
              Base discretion granted according to customer relationship tier.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {TIER_ORDER.map((tierKey) => {
                const row = snapshot.tiers.find((t) => t.tier === tierKey);
                if (!row) return null;
                return <TierCard key={`${tierKey}-${row.max_discount_pct}`} row={row} canEdit={canEdit} onSaved={refetch} />;
              })}
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
              {snapshot.category_ceilings.map((row) => (
                <CeilingCard
                  key={`${row.category_id}-${row.max_discount_pct}`}
                  row={row}
                  canEdit={canEdit}
                  onSaved={refetch}
                />
              ))}

              {snapshot.category_ceilings.length === 0 && (
                <p className="text-[12.5px] text-mist sm:col-span-3">No category ceilings configured yet.</p>
              )}
            </div>
          </div>

          {/* MATRIX 3: APPROVAL POLICIES */}
          <div className="rounded-[24px] bg-white p-6 card-shadow">
            <h2 className="text-[16px] font-semibold text-ink pb-2 border-b border-ink/6">
              3. Automated Approval Routing Policies
            </h2>
            <p className="text-[12.5px] text-mist mt-1">
              A quotation routes for review when either threshold is met — the blended score and the worst single line
              act independently.
            </p>

            <div className="mt-4 overflow-hidden rounded-[18px] border border-ink/6">
              <table className="w-full text-left text-[12.5px]">
                <thead className="text-[11px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
                  <tr>
                    <th className="px-4 py-2.5">Policy</th>
                    <th className="px-4 py-2.5">Min Blended %</th>
                    <th className="px-4 py-2.5">Min Line Overage (pt)</th>
                    <th className="px-4 py-2.5 text-center">Manager</th>
                    <th className="px-4 py-2.5 text-center">Finance</th>
                    <th className="px-4 py-2.5 text-center">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {snapshot.policies.map((p) => (
                    <PolicyRow key={p.id} policy={p} canEdit={canEdit} onSaved={refetch} />
                  ))}

                  {snapshot.policies.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-mist">
                        No approval policies configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {canEdit && <AddPolicyForm onCreated={refetch} />}
          </div>
        </>
      )}
    </div>
  );
}

function TierCard({
  row,
  canEdit,
  onSaved,
}: {
  row: DiscountTier;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { status, message, run } = useFieldSave(onSaved);
  const [value, setValue] = useState(row.max_discount_pct);

  function commit() {
    if (value === row.max_discount_pct || value.trim() === "") return;
    run(() => ConfigApi.setDiscountTier(row.tier, value));
  }

  return (
    <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
      <span className="font-semibold text-[13.5px] text-ink">{TIER_LABEL[row.tier] ?? row.tier}</span>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          disabled={!canEdit}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px] tabular-nums disabled:bg-ink/[0.03] disabled:text-mist"
        />
        <span className="text-mist font-semibold">% Max</span>
        <StatusDot status={status} message={message} />
      </div>
    </div>
  );
}

function CeilingCard({
  row,
  canEdit,
  onSaved,
}: {
  row: CategoryCeiling;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { status, message, run } = useFieldSave(onSaved);
  const [value, setValue] = useState(row.max_discount_pct);

  function commit() {
    if (value === row.max_discount_pct || value.trim() === "") return;
    run(() => ConfigApi.setCategoryCeiling(row.category_id, value));
  }

  return (
    <div className="p-4 rounded-[18px] bg-cream/40 border border-ink/6">
      <span className="font-semibold text-[13.5px] text-ink">{row.category_name}</span>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          disabled={!canEdit}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          className="w-24 rounded-lg border border-ink/15 bg-white p-2 font-bold text-center text-[15px] tabular-nums disabled:bg-ink/[0.03] disabled:text-mist"
        />
        <span className="text-mist font-semibold">% Limit</span>
        <StatusDot status={status} message={message} />
      </div>
    </div>
  );
}

function policyToInput(p: ApprovalPolicy): ApprovalPolicyInput {
  return {
    name: p.name,
    min_blended: p.min_blended,
    min_line_overage: p.min_line_overage,
    requires_manager: p.requires_manager,
    requires_finance: p.requires_finance,
    is_active: p.is_active,
  };
}

function PolicyRow({
  policy,
  canEdit,
  onSaved,
}: {
  policy: ApprovalPolicy;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { status, message, run } = useFieldSave(onSaved);
  const [minBlended, setMinBlended] = useState(policy.min_blended);
  const [minOverage, setMinOverage] = useState(policy.min_line_overage);

  function commitPatch(patch: Partial<ApprovalPolicyInput>) {
    run(() => ConfigApi.updatePolicy(policy.id, { ...policyToInput(policy), ...patch }));
  }

  return (
    <tr className="hover:bg-cream/30 transition-colors">
      <td className="px-4 py-3 font-medium text-ink">{policy.name}</td>
      <td className="px-4 py-3">
        <input
          type="text"
          inputMode="decimal"
          disabled={!canEdit}
          value={minBlended}
          onChange={(e) => setMinBlended(e.target.value)}
          onBlur={() => minBlended !== policy.min_blended && commitPatch({ min_blended: minBlended })}
          className="w-20 rounded-md border border-ink/15 bg-white px-2 py-1 text-center tabular-nums disabled:bg-ink/[0.03] disabled:text-mist"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          inputMode="decimal"
          disabled={!canEdit}
          value={minOverage}
          onChange={(e) => setMinOverage(e.target.value)}
          onBlur={() => minOverage !== policy.min_line_overage && commitPatch({ min_line_overage: minOverage })}
          className="w-20 rounded-md border border-ink/15 bg-white px-2 py-1 text-center tabular-nums disabled:bg-ink/[0.03] disabled:text-mist"
        />
      </td>
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={policy.requires_manager}
          onChange={(e) => commitPatch({ requires_manager: e.target.checked })}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={policy.requires_finance}
          onChange={(e) => commitPatch({ requires_finance: e.target.checked })}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={policy.is_active}
            onChange={(e) => commitPatch({ is_active: e.target.checked })}
          />
          <StatusDot status={status} message={message} />
        </div>
      </td>
    </tr>
  );
}

const EMPTY_POLICY: ApprovalPolicyInput = {
  name: "",
  min_blended: "0",
  min_line_overage: "0",
  requires_manager: true,
  requires_finance: false,
  is_active: true,
};

function AddPolicyForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<ApprovalPolicyInput>(EMPTY_POLICY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ApprovalPolicyInput>(key: K, value: ApprovalPolicyInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await ConfigApi.createPolicy(form);
      setForm(EMPTY_POLICY);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3 rounded-[16px] bg-cream/40 p-4 border border-ink/6">
      <div>
        <label className="text-[11px] font-medium text-mist">Policy name</label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          className="mt-1 w-48 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[12.5px]"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-mist">Min blended %</label>
        <input
          type="text"
          inputMode="decimal"
          value={form.min_blended}
          onChange={(e) => set("min_blended", e.target.value)}
          className="mt-1 w-24 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-mist">Min line overage</label>
        <input
          type="text"
          inputMode="decimal"
          value={form.min_line_overage}
          onChange={(e) => set("min_line_overage", e.target.value)}
          className="mt-1 w-24 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums"
        />
      </div>
      <label className="flex items-center gap-1.5 text-[12px] text-ink pb-1.5">
        <input type="checkbox" checked={form.requires_manager} onChange={(e) => set("requires_manager", e.target.checked)} />
        Manager
      </label>
      <label className="flex items-center gap-1.5 text-[12px] text-ink pb-1.5">
        <input type="checkbox" checked={form.requires_finance} onChange={(e) => set("requires_finance", e.target.checked)} />
        Finance
      </label>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-bone hover:bg-ink/90 disabled:opacity-50"
      >
        <Plus className="size-3.5" /> {saving ? "Adding..." : "Add policy"}
      </button>
      {error && <p className="text-[11.5px] text-bad basis-full">{error}</p>}
    </form>
  );
}
