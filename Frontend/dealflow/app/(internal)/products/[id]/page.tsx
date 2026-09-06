"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Pencil, Check, X } from "lucide-react";
import { useFetch, useAuth, inr } from "@/lib/hooks";
import { ConfigApi } from "@/lib/api";
import type { Product, ProductInput } from "@/lib/types";

function toInput(p: Product): ProductInput {
  return {
    category_id: p.category_id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    unit: p.unit,
    unit_price: p.unit_price,
    unit_cost: p.unit_cost,
    tax_rate_pct: p.tax_rate_pct,
    is_promoted: p.is_promoted,
    is_subscription: p.is_subscription,
    is_active: p.is_active,
  };
}

/**
 * Display-only catalogue margin. This is informational math for a static
 * catalogue entry (list price vs. cost), not a quotation-time business rule —
 * the pricing/risk engine on the server owns every number that matters for a
 * live deal.
 */
function catalogueMarginPct(unitPrice: string, unitCost: string): number | null {
  const price = parseFloat(unitPrice);
  const cost = parseFloat(unitCost);
  if (!isFinite(price) || !isFinite(cost) || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = use(params);
  const id = Number(idParam);

  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const { data: product, error, loading, refetch } = useFetch<Product>(
    Number.isFinite(id) ? `/v1/products/${id}` : null,
  );

  // `form` is null in read-only mode; it is populated only when the user
  // starts editing, and cleared on save/cancel. Its presence *is* the edit
  // flag, so there is no separate boolean state to keep in sync.
  const [form, setForm] = useState<ProductInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function startEditing() {
    if (!product) return;
    setForm(toInput(product));
    setSaveError(null);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      await ConfigApi.updateProduct(id, form);
      setForm(null);
      refetch();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm(null);
    setSaveError(null);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <Link href="/products" className="inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-ink">
          <ArrowLeft className="size-3.5" /> Back to catalogue
        </Link>
        <div className="rounded-[18px] tone-bad p-4 text-[13px] font-medium flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" />
          {error?.message ?? "Product not found."}
        </div>
      </div>
    );
  }

  const margin = catalogueMarginPct(product.unit_price, product.unit_cost);

  return (
    <div className="space-y-6 max-w-[820px]">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <Link href="/products" className="inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-ink">
          <ArrowLeft className="size-3.5" /> Back to catalogue
        </Link>

        {isAdmin && !form && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-cream transition-colors"
          >
            <Pencil className="size-3.5" /> Edit Product
          </button>
        )}

        {isAdmin && form && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-[12.5px] font-medium text-mist hover:text-ink transition-colors"
            >
              <X className="size-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 disabled:opacity-50 transition-colors"
            >
              <Check className="size-3.5" /> {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="rounded-[18px] tone-bad p-4 text-[13px] font-medium flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" />
          {saveError}
        </div>
      )}

      <div className="rounded-[24px] bg-white p-5 card-shadow space-y-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-ink/6 sm:gap-4">
          <div className="min-w-0 flex-1">
            {form ? (
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[20px] font-serif font-medium text-ink"
              />
            ) : (
              <h1 className="font-serif text-[26px] font-medium tracking-tight text-ink">{product.name}</h1>
            )}
            <p className="mt-1 text-[12.5px] text-mist">
              SKU:{" "}
              {form ? (
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => set("sku", e.target.value)}
                  className="ml-1 rounded border border-ink/15 bg-white px-1.5 py-0.5 text-[12.5px]"
                />
              ) : (
                <span className="font-medium text-ink">{product.sku}</span>
              )}
              {" · "}Category: <span className="font-medium text-ink">{product.category_name ?? product.category_id}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {form ? (
              <>
                <label className="flex items-center gap-1 text-[11px] font-semibold text-ink">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
                  Active
                </label>
                <label className="flex items-center gap-1 text-[11px] font-semibold text-ink">
                  <input type="checkbox" checked={form.is_promoted} onChange={(e) => set("is_promoted", e.target.checked)} />
                  Promoted
                </label>
                <label className="flex items-center gap-1 text-[11px] font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={form.is_subscription}
                    onChange={(e) => set("is_subscription", e.target.checked)}
                  />
                  Subscription
                </label>
              </>
            ) : (
              <>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    product.is_active ? "tone-ok text-ok" : "tone-bad text-bad"
                  }`}
                >
                  {product.is_active ? "Active" : "Inactive"}
                </span>
                {product.is_promoted && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tone-warn">Promoted</span>
                )}
                {product.is_subscription && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ink/5 text-mist">
                    Subscription
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <label className="text-[11.5px] font-medium text-mist">Description</label>
          {form ? (
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[13px]"
            />
          ) : (
            <p className="mt-1 text-[13.5px] text-ink/80 leading-relaxed">
              {product.description || <span className="text-mist italic">No description provided.</span>}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-ink/6 sm:grid-cols-4">
          <div>
            <span className="text-[11px] font-medium uppercase text-mist">Unit</span>
            {form ? (
              <input
                type="text"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[13px]"
              />
            ) : (
              <p className="mt-0.5 text-[14px] font-semibold text-ink">{product.unit || "—"}</p>
            )}
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase text-mist">Unit Price</span>
            {form ? (
              <input
                type="text"
                inputMode="decimal"
                value={form.unit_price}
                onChange={(e) => set("unit_price", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[13px] tabular-nums"
              />
            ) : (
              <p className="mt-0.5 text-[14px] font-semibold text-ink tabular-nums">{inr(product.unit_price)}</p>
            )}
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase text-mist">Unit Cost</span>
            {form ? (
              <input
                type="text"
                inputMode="decimal"
                value={form.unit_cost}
                onChange={(e) => set("unit_cost", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[13px] tabular-nums"
              />
            ) : (
              <p className="mt-0.5 text-[14px] font-semibold text-ink tabular-nums">{inr(product.unit_cost)}</p>
            )}
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase text-mist">Tax Rate</span>
            {form ? (
              <input
                type="text"
                inputMode="decimal"
                value={form.tax_rate_pct}
                onChange={(e) => set("tax_rate_pct", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[13px] tabular-nums"
              />
            ) : (
              <p className="mt-0.5 text-[14px] font-semibold text-ink tabular-nums">{product.tax_rate_pct}%</p>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-ink/6">
          <span className="text-[11px] font-medium uppercase text-mist">Catalogue Margin (informational)</span>
          <p className="mt-1 text-[15px] font-semibold tabular-nums text-ok">
            {margin === null ? "—" : `${margin.toFixed(1)}%`}
          </p>
          <p className="mt-0.5 text-[11.5px] text-mist">
            (Unit Price &minus; Unit Cost) / Unit Price. Static catalogue figure only — quotation-time margin is always
            computed and returned by the server.
          </p>
        </div>

        <div>
          <label className="text-[11.5px] font-medium text-mist">Category ID</label>
          {form ? (
            <input
              type="number"
              min={1}
              value={form.category_id || ""}
              onChange={(e) => set("category_id", Number(e.target.value))}
              className="mt-1 w-32 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[13px] tabular-nums"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
