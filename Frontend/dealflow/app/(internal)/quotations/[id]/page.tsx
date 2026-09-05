"use client";

import React, { useState, useMemo, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  Send,
  CheckCircle,
  Clock,
  ShieldAlert,
  Copy,
  ExternalLink,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { MarginBar } from "@/components/ui/margin-bar";
import { UpsellPanel } from "@/components/workspace/upsell-panel";
import { useFetch, useMutation, inr } from "@/lib/hooks";
import { api } from "@/lib/api";
import type { Quotation, QuotationLine, UpsellSuggestion } from "@/lib/types";

interface Product {
  id: number;
  name: string;
  sku: string;
  category_name: string;
  unit_price: string;
  stock_total: number;
  line_type: string;
  plan_period?: string;
}

export default function QuotationBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const quoteId = resolvedParams.id;

  // Load quotation from backend
  const { data: quoteRes, loading: quoteLoading, refetch: refetchQuote } =
    useFetch<{ data: Quotation }>(`/v1/quotations/${quoteId}`);
  const quote = quoteRes?.data;

  // Load product catalog
  const { data: productsRes } = useFetch<{ data: Product[] }>("/v1/products");
  const catalog = productsRes?.data ?? [];

  // Mutation helper
  const mutation = useMutation<{ data: Quotation }>();

  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryTab, setCategoryTab] = useState("ALL");
  const [portalCopied, setPortalCopied] = useState(false);

  // All mutations call the backend and refetch the quotation (server is source of truth)
  const mutateQuote = useCallback(async (path: string, init?: RequestInit) => {
    try {
      await mutation.trigger(path, init);
      refetchQuote();
    } catch {
      // Error state is in mutation.error
    }
  }, [mutation, refetchQuote]);

  async function addProductToCart(product: Product) {
    await mutateQuote(`/v1/quotations/${quoteId}/lines`, {
      method: "POST",
      body: JSON.stringify({
        product_id: product.id,
        qty: "1",
        discount_pct: "0",
      }),
    });
  }

  async function updateLine(lineId: number, qty: string, discountPct: string) {
    await mutateQuote(`/v1/quotations/${quoteId}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify({ qty, discount_pct: discountPct }),
    });
  }

  async function removeLine(lineId: number) {
    await mutateQuote(`/v1/quotations/${quoteId}/lines/${lineId}`, {
      method: "DELETE",
    });
  }

  async function setOrderDiscount(pct: string) {
    await mutateQuote(`/v1/quotations/${quoteId}/order-discount`, {
      method: "PUT",
      body: JSON.stringify({ order_discount_pct: pct }),
    });
  }

  async function handleSubmitQuote() {
    await mutateQuote(`/v1/quotations/${quoteId}/submit`, {
      method: "POST",
    });
    // After submit, the status changes; redirect appropriately
    const updated = await api<{ data: Quotation }>(`/v1/quotations/${quoteId}`);
    if (updated.data.status === "PENDING_APPROVAL") {
      router.push(`/approvals/${quoteId}`);
    } else {
      router.push(`/quotations`);
    }
  }

  async function handleSendToPortal() {
    await mutateQuote(`/v1/quotations/${quoteId}/send`, {
      method: "POST",
    });
  }

  function handleAddUpsell(suggestion: UpsellSuggestion) {
    mutateQuote(`/v1/quotations/${quoteId}/lines`, {
      method: "POST",
      body: JSON.stringify({
        product_id: suggestion.product_id,
        qty: "1",
        discount_pct: "0",
      }),
    });
  }

  function copyPortalLink() {
    if (!quote?.portal_token) return;
    const portalUrl = `${window.location.origin}/portal/q/${quote.portal_token}`;
    navigator.clipboard.writeText(portalUrl);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 3000);
  }

  const filteredCatalog = catalog.filter((p) => {
    const s = catalogSearch.toLowerCase();
    const matchSearch =
      !s ||
      p.name.toLowerCase().includes(s) ||
      p.sku.toLowerCase().includes(s);
    const matchCategory =
      categoryTab === "ALL" ||
      p.category_name.toUpperCase() === categoryTab.toUpperCase();
    return matchSearch && matchCategory;
  });

  // Loading state
  if (quoteLoading || !quote) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/quotations"
            className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white shadow-xs hover:bg-cream transition-colors text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="h-7 w-64 rounded bg-ink/5 animate-pulse" />
            <div className="mt-2 h-4 w-40 rounded bg-ink/5 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="h-[740px] rounded-[24px] bg-ink/5 animate-pulse lg:col-span-3" />
          <div className="h-[740px] rounded-[24px] bg-ink/5 animate-pulse lg:col-span-5" />
          <div className="space-y-4 lg:col-span-4">
            <div className="h-80 rounded-[24px] bg-ink/5 animate-pulse" />
            <div className="h-40 rounded-[24px] bg-ink/5 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const lines = quote.lines;
  const totals = quote.totals;
  const risk = quote.risk;
  const isDraft = quote.status === "DRAFT";

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/quotations"
            className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white shadow-xs hover:bg-cream transition-colors text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[24px] font-medium tracking-tight text-ink sm:text-[28px]">
                {quote.reference} &middot; {quote.customer_name}
              </h1>
              <StatusBadge status={quote.status} size="sm" />
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 border border-amber-500/20">
                {quote.customer_tier} Customer
              </span>
            </div>
            <p className="text-[12.5px] text-mist">
              Created by {quote.rep_name} &middot; Version {quote.version ?? 1}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {quote.portal_token && (
            <>
              <button
                type="button"
                onClick={copyPortalLink}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink shadow-xs hover:bg-cream transition-colors"
              >
                {portalCopied ? (
                  <>
                    <CheckCircle className="size-3.5 text-emerald-600" />
                    Copied Link!
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5 text-mist" />
                    Customer Portal Link
                  </>
                )}
              </button>

              <Link
                href={`/portal/q/${quote.portal_token}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-3 py-2 text-[12.5px] font-medium text-mist hover:text-ink transition-colors"
                title="Open customer portal in isolated view"
              >
                <ExternalLink className="size-3.5" />
              </Link>
            </>
          )}

          {!quote.portal_token && isDraft && (
            <button
              type="button"
              onClick={handleSendToPortal}
              disabled={mutation.loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink shadow-xs hover:bg-cream transition-colors disabled:opacity-50"
            >
              <Send className="size-3.5" />
              Send to Customer Portal
            </button>
          )}
        </div>
      </div>

      <LifecycleBar currentStage="PRICING" />

      {mutation.error && (
        <div className="rounded-[18px] bg-rose-50 p-3 border border-rose-200 text-[13px] text-rose-900">
          <strong>Error:</strong> {mutation.error.message}
        </div>
      )}

      {/* ASYMMETRIC 3-PANEL WORKSPACE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* PANEL 1: PRODUCT CATALOG BROWSER (3 cols) */}
        <div className="rounded-[24px] bg-white p-4 border border-ink/8 shadow-xs lg:col-span-3 flex flex-col h-[740px]">
          <div className="pb-3 border-b border-ink/6">
            <h2 className="text-[14px] font-semibold text-ink">Catalog &amp; Stock</h2>
            <p className="text-[11.5px] text-mist mt-0.5">
              Select products to add to quotation cart
            </p>

            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search catalog..."
              className="mt-3 w-full rounded-full bg-ink/[0.03] px-3 py-1.5 text-[12px] border border-ink/6 focus:outline-hidden"
            />

            <div className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-1">
              {["ALL", "Hardware", "Service", "Subscription"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCategoryTab(tab)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    categoryTab === tab
                      ? "bg-ink text-bone"
                      : "bg-ink/[0.03] text-mist hover:text-ink"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2 flex-1 overflow-y-auto pr-1">
            {filteredCatalog.map((product) => (
              <div
                key={product.id}
                className="group rounded-[16px] bg-cream/30 p-3 border border-ink/6 hover:border-ink/15 hover:bg-cream/60 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <h4 className="text-[12.5px] font-semibold text-ink leading-tight">
                      {product.name}
                    </h4>
                    <span className="text-[9.5px] uppercase font-bold px-1.5 py-0.5 rounded bg-ink/5 text-mist">
                      {product.category_name}
                    </span>
                  </div>
                  <p className="text-[11px] text-mist mt-1">
                    {product.stock_total > 0 ? `${product.stock_total} units` : "Backorder"}
                  </p>
                </div>

                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-ink/6">
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-ink">
                    {inr(product.unit_price)}
                  </span>
                  <button
                    type="button"
                    onClick={() => addProductToCart(product)}
                    disabled={!isDraft || mutation.loading}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
                  >
                    <Plus className="size-3" /> Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PANEL 2: QUOTATION CART & ACTIVE LINES (5 cols) */}
        <div className="rounded-[24px] bg-white p-5 border border-ink/8 shadow-xs lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight text-ink">
                  Quotation Cart
                </h2>
                <p className="text-[12px] text-mist">
                  {lines.length} line items configured
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-mist font-medium uppercase">
                  Net Cart Value
                </span>
                <p className="font-mono text-[18px] font-serif font-semibold text-ink tabular-nums">
                  {inr(totals.net_subtotal)}
                </p>
              </div>
            </div>

            {/* Lines List */}
            <div className="mt-4 space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {lines.map((line) => {
                const riskLine = risk.breakdown.find((r) => r.line_id === line.id);
                const isOver = riskLine?.is_over ?? false;
                return (
                  <div
                    key={line.id}
                    className={`rounded-[18px] p-3.5 border transition-all ${
                      isOver
                        ? "border-amber-500/40 bg-amber-500/[0.04]"
                        : "border-ink/8 bg-white shadow-2xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[13.5px] text-ink">
                            {line.product_name}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-ink/5 text-mist">
                            {line.category_name}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-mist">
                          {line.sku} &middot; List: {inr(line.unit_price)} each
                        </p>
                      </div>

                      {isDraft && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={mutation.loading}
                          className="text-mist hover:text-rose-600 transition-colors p-1 disabled:opacity-50"
                          title="Remove line item"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Qty & Discount Controls */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-ink/6">
                      {/* Qty Stepper */}
                      <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream/60 px-2 py-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateLine(
                              line.id,
                              String(Math.max(1, parseInt(line.qty) - 1)),
                              line.line_discount_pct
                            )
                          }
                          disabled={!isDraft || mutation.loading}
                          className="text-mist hover:text-ink transition-colors disabled:opacity-50"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="font-mono text-[12px] font-semibold px-2 tabular-nums">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateLine(
                              line.id,
                              String(parseInt(line.qty) + 1),
                              line.line_discount_pct
                            )
                          }
                          disabled={!isDraft || mutation.loading}
                          className="text-mist hover:text-ink transition-colors disabled:opacity-50"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>

                      {/* Discount Input */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11.5px] text-mist font-medium">
                          Disc %:
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={line.line_discount_pct}
                          onChange={(e) =>
                            updateLine(line.id, line.qty, e.target.value || "0")
                          }
                          disabled={!isDraft}
                          className={`w-14 rounded-md px-1.5 py-0.5 text-right font-mono text-[12.5px] font-semibold border focus:outline-hidden ${
                            isOver
                              ? "border-amber-500 bg-amber-50 text-amber-900"
                              : "border-ink/15 bg-white text-ink"
                          } disabled:opacity-60`}
                        />
                      </div>

                      {/* Line Total & Line Margin */}
                      <div className="text-right">
                        <span className="font-mono text-[13px] font-semibold text-ink tabular-nums">
                          {inr(line.net_amount)}
                        </span>
                        <span className="ml-1.5 text-[11px] font-mono font-medium text-emerald-800">
                          ({line.margin_pct}% mg)
                        </span>
                      </div>
                    </div>

                    {/* Ceiling Violation Warning Box */}
                    {isOver && riskLine && (
                      <div className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[11.5px] text-amber-900 border border-amber-500/20 flex items-start gap-1.5">
                        <ShieldAlert className="size-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <span>
                          <strong>Exceeds category discretion:</strong> Allowed{" "}
                          {riskLine.allowed_pct}% ({line.category_name}), Applied{" "}
                          {riskLine.given_pct}%.{" "}
                          <strong>+{riskLine.overage_pts}pt over limit.</strong>{" "}
                          Will auto-route to Approvals.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {lines.length === 0 && (
                <div className="flex h-40 flex-col items-center justify-center rounded-[18px] border border-dashed border-ink/15 text-center p-4">
                  <p className="text-[13px] font-medium text-ink">
                    Quotation cart is empty
                  </p>
                  <p className="text-[11.5px] text-mist mt-1">
                    Add products from the catalog on the left to begin pricing.
                  </p>
                </div>
              )}
            </div>

            {/* Order Level Discount */}
            {isDraft && (
              <div className="mt-4 pt-3 border-t border-ink/6 flex items-center justify-between text-[12.5px]">
                <span className="text-mist font-medium">
                  Overall Order Discount (%):
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={quote.order_discount_pct}
                    onChange={(e) => setOrderDiscount(e.target.value || "0")}
                    className="w-16 rounded-md border border-ink/15 bg-white px-2 py-1 text-right font-mono text-[12.5px] font-semibold focus:outline-hidden"
                  />
                  <span className="font-mono text-mist">%</span>
                </div>
              </div>
            )}
          </div>

          {/* Workflow Action Bar */}
          {isDraft && (
            <div className="mt-6 pt-4 border-t border-ink/8 space-y-2">
              <button
                type="button"
                onClick={handleSubmitQuote}
                disabled={mutation.loading || lines.length === 0}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-semibold transition-all shadow-sm disabled:opacity-50 ${
                  risk.required_level === "FINANCE"
                    ? "bg-rose-700 text-white hover:bg-rose-800"
                    : risk.required_level === "MANAGER"
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : "bg-ink text-bone hover:bg-ink/90"
                }`}
              >
                {risk.required_level === "FINANCE" ? (
                  <>
                    <ShieldAlert className="size-4" />
                    Submit for Approval (Manager + Finance) &rarr;
                  </>
                ) : risk.required_level === "MANAGER" ? (
                  <>
                    <Clock className="size-4" />
                    Submit for Approval (Sales Manager) &rarr;
                  </>
                ) : (
                  <>
                    <CheckCircle className="size-4" />
                    Submit &amp; Move to Fulfillment &rarr;
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[11.5px] text-mist px-1">
                <span>Status: {quote.status}</span>
                <span>Blended Engine: Auto-Routing Active</span>
              </div>
            </div>
          )}
        </div>

        {/* PANEL 3: FINANCIAL SUMMARY, LIVE MARGIN & INTELLIGENCE (4 cols) */}
        <div className="space-y-4 lg:col-span-4">
          {/* Financial Summary Card */}
          <div className="rounded-[24px] bg-white p-5 border border-ink/8 shadow-xs">
            <h3 className="text-[14px] font-semibold text-ink pb-2.5 border-b border-ink/6">
              Financial Summary
            </h3>

            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-mist">List Subtotal</dt>
                <dd className="font-mono tabular-nums text-ink">
                  {inr(totals.list_subtotal)}
                </dd>
              </div>

              <div className="flex justify-between text-amber-800 font-medium">
                <dt>Discount Reductions</dt>
                <dd className="font-mono tabular-nums">
                  -{inr(totals.discount_total)}
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-mist">Net Subtotal</dt>
                <dd className="font-mono tabular-nums text-ink font-semibold">
                  {inr(totals.net_subtotal)}
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-mist">Applicable GST</dt>
                <dd className="font-mono tabular-nums text-ink">
                  {inr(totals.tax_total)}
                </dd>
              </div>

              <div className="pt-2 border-t border-ink/8 flex justify-between text-[15px] font-semibold">
                <dt className="text-ink">Grand Total</dt>
                <dd className="font-mono text-ink tabular-nums">
                  {inr(totals.grand_total)}
                </dd>
              </div>

              <div className="pt-2 border-t border-ink/4 flex justify-between text-[11.5px] text-mist">
                <dt>One-time items:</dt>
                <dd className="font-mono tabular-nums font-medium">
                  {inr(totals.one_time_total)}
                </dd>
              </div>
              <div className="flex justify-between text-[11.5px] text-mist">
                <dt>Recurring subscriptions:</dt>
                <dd className="font-mono tabular-nums font-medium">
                  {inr(totals.recurring_total)}
                </dd>
              </div>
            </dl>

            {/* Live Margin Indicator Bar */}
            <div className="mt-4 pt-3 border-t border-ink/6">
              <MarginBar
                marginPct={parseFloat(totals.margin_pct) || 0}
                targetPct={25}
                floorPct={12}
              />
            </div>
          </div>

          {/* Governance Risk Verdict Card */}
          <div
            className={`rounded-[24px] p-5 border shadow-xs transition-all ${
              risk.required_level === "FINANCE"
                ? "bg-rose-50/70 border-rose-200"
                : risk.required_level === "MANAGER"
                ? "bg-amber-50/70 border-amber-200"
                : "bg-emerald-50/70 border-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-ink/6">
              <h3 className="text-[13.5px] font-semibold text-ink">
                Governance Determination
              </h3>
              <RiskBadge
                score={risk.blended_score}
                requiredLevel={risk.required_level}
                size="sm"
              />
            </div>

            <p className="mt-2.5 text-[12px] leading-relaxed text-ink/80">
              {risk.rationale}
            </p>

            <div className="mt-3 pt-2.5 border-t border-ink/6 flex items-center justify-between text-[11.5px] text-mist">
              <span>Max line overage: +{risk.max_line_overage}pt</span>
              <Link
                href={`/approvals/${quoteId}`}
                className="font-semibold text-ink hover:underline"
              >
                Inspect Policy Table &rarr;
              </Link>
            </div>
          </div>

          {/* Smart Recommendations Upsell Panel */}
          <UpsellPanel onAddSuggestion={handleAddUpsell} />
        </div>
      </div>
    </div>
  );
}
