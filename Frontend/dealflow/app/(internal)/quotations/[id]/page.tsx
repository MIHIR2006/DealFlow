"use client";

import React, { useState, useMemo, use } from "react";
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
  Sparkles,
  Copy,
  ExternalLink,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { MarginBar } from "@/components/ui/margin-bar";
import { UpsellPanel } from "@/components/workspace/upsell-panel";
import { UpsellSuggestion } from "@/lib/types";

interface CartLineItem {
  id: string;
  productId: number;
  productName: string;
  sku: string;
  category: "Hardware" | "Service" | "Subscription";
  unitPrice: number;
  costPrice: number;
  qty: number;
  discountPct: number;
  taxRatePct: number;
  lineType: "ONE_TIME" | "RECURRING";
  planPeriod?: string;
}

const CATALOG = [
  {
    id: 1,
    name: "Laptop Pro 16\"",
    sku: "HW-LP-16",
    category: "Hardware" as const,
    unitPrice: 220000,
    costPrice: 155000,
    stock: "Mumbai: 42 · East: 12",
    lineType: "ONE_TIME" as const,
  },
  {
    id: 2,
    name: "Setup & Migration Service",
    sku: "SRV-SETUP-PRO",
    category: "Service" as const,
    unitPrice: 45000,
    costPrice: 38000,
    stock: "Available Immediately",
    lineType: "ONE_TIME" as const,
  },
  {
    id: 3,
    name: "Enterprise Cloud Support 24/7",
    sku: "SUB-CLOUD-247",
    category: "Subscription" as const,
    unitPrice: 25000,
    costPrice: 8000,
    stock: "Unlimited Seats",
    lineType: "RECURRING" as const,
    planPeriod: "Monthly",
  },
  {
    id: 4,
    name: "Server Rack Unit 2U",
    sku: "HW-SRV-2U",
    category: "Hardware" as const,
    unitPrice: 180000,
    costPrice: 130000,
    stock: "Kolkata: 4 · Mumbai: 0",
    lineType: "ONE_TIME" as const,
  },
  {
    id: 5,
    name: "Docking Station Ultra Dual-4K",
    sku: "HW-DOCK-4K",
    category: "Hardware" as const,
    unitPrice: 18500,
    costPrice: 11000,
    stock: "Out of Stock (Backorder)",
    lineType: "ONE_TIME" as const,
  },
];

export default function QuotationBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const quoteId = resolvedParams.id || "Q-1042";

  // Initial cart seeded to mirror the spec §10 worked example
  const [lines, setLines] = useState<CartLineItem[]>([
    {
      id: "l1",
      productId: 1,
      productName: "Laptop Pro 16\"",
      sku: "HW-LP-16",
      category: "Hardware",
      unitPrice: 220000,
      costPrice: 155000,
      qty: 2,
      discountPct: 12, // Gold allowed: 15% -> 0pt over
      taxRatePct: 18,
      lineType: "ONE_TIME",
    },
    {
      id: "l2",
      productId: 2,
      productName: "Setup & Migration Service",
      sku: "SRV-SETUP-PRO",
      category: "Service",
      unitPrice: 45000,
      costPrice: 38000,
      qty: 1,
      discountPct: 18, // Service allowed: 10% -> 8pt OVER
      taxRatePct: 18,
      lineType: "ONE_TIME",
    },
  ]);

  const [orderDiscountPct, setOrderDiscountPct] = useState(0);
  const [customerTier] = useState<"Gold" | "Silver" | "Bronze">("Gold");
  const [customerName] = useState("Acme Corporation");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryTab, setCategoryTab] = useState("ALL");
  const [portalCopied, setPortalCopied] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);

  // Ceilings Matrix (Spec §10 & A3)
  const tierCeiling = customerTier === "Gold" ? 15 : customerTier === "Silver" ? 10 : 5;
  const categoryCeilings: Record<string, number> = {
    Hardware: 15,
    Service: 10,
    Subscription: 20,
  };

  // Live Recalculations (Pricing & Risk Engine logic)
  const totals = useMemo(() => {
    let listSubtotal = 0;
    let lineDiscountTotal = 0;
    let totalCost = 0;
    let oneTimeTotal = 0;
    let recurringTotal = 0;

    let weightedOverageSum = 0;
    let maxLineOverage = 0;

    const computedLines = lines.map((line) => {
      const lineList = line.unitPrice * line.qty;
      const lineCost = line.costPrice * line.qty;
      const lineDiscountAmt = (lineList * line.discountPct) / 100;
      const lineNet = lineList - lineDiscountAmt;
      const lineTax = (lineNet * line.taxRatePct) / 100;
      const lineMargin = lineNet - lineCost;
      const lineMarginPct = lineNet > 0 ? (lineMargin / lineNet) * 100 : 0;

      // Effective ceiling = min(tier, category)
      const allowedCeiling = Math.min(tierCeiling, categoryCeilings[line.category] ?? tierCeiling);
      const overagePts = Math.max(0, line.discountPct - allowedCeiling);

      weightedOverageSum += overagePts * lineList;
      if (overagePts > maxLineOverage) {
        maxLineOverage = overagePts;
      }

      listSubtotal += lineList;
      lineDiscountTotal += lineDiscountAmt;
      totalCost += lineCost;

      if (line.lineType === "ONE_TIME") {
        oneTimeTotal += lineNet + lineTax;
      } else {
        recurringTotal += lineNet + lineTax;
      }

      return {
        ...line,
        lineList,
        lineNet,
        lineTax,
        lineMarginPct,
        allowedCeiling,
        overagePts,
        isOver: overagePts > 0,
      };
    });

    const netBeforeOrderDisc = listSubtotal - lineDiscountTotal;
    const orderDiscountAmt = (netBeforeOrderDisc * orderDiscountPct) / 100;
    const finalNet = netBeforeOrderDisc - orderDiscountAmt;
    const finalTax = (finalNet * 18) / 100;
    const grandTotal = finalNet + finalTax;

    const totalMarginAmt = finalNet - totalCost;
    const totalMarginPct = finalNet > 0 ? (totalMarginAmt / finalNet) * 100 : 0;

    // Blended risk calculation: value-weighted overage
    const blendedRiskScore =
      listSubtotal > 0 ? Number((weightedOverageSum / listSubtotal).toFixed(1)) : 0;

    // Governance determination
    let requiredLevel: "NONE" | "MANAGER" | "FINANCE" = "NONE";
    let rationale = "Discounts are fully within customer tier and category discretion.";

    if (blendedRiskScore >= 5.0 || maxLineOverage >= 10) {
      requiredLevel = "FINANCE";
      rationale = `Blended risk score is ${blendedRiskScore}% (≥5%) or maximum single-line overage is ${maxLineOverage}pt (≥10pt). Two-level approval required (Sales Manager ➔ Finance).`;
    } else if (maxLineOverage > 0 || blendedRiskScore > 0) {
      requiredLevel = "MANAGER";
      rationale = `Line item exceeds category discretion by ${maxLineOverage}pt. Requires Sales Manager review.`;
    }

    return {
      listSubtotal,
      lineDiscountTotal,
      orderDiscountAmt,
      finalNet,
      finalTax,
      grandTotal,
      totalCost,
      totalMarginAmt,
      totalMarginPct,
      oneTimeTotal,
      recurringTotal,
      blendedRiskScore,
      maxLineOverage,
      requiredLevel,
      rationale,
      computedLines,
    };
  }, [lines, orderDiscountPct, tierCeiling]);

  // Cart operations
  function updateQty(id: string, delta: number) {
    setLines((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartLineItem[]
    );
  }

  function updateDiscount(id: string, pct: number) {
    setLines((prev) =>
      prev.map((item) => (item.id === id ? { ...item, discountPct: Math.max(0, Math.min(100, pct)) } : item))
    );
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((i) => i.id !== id));
  }

  function addProductToCart(product: (typeof CATALOG)[0]) {
    setLines((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: `l_${Date.now()}`,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          category: product.category,
          unitPrice: product.unitPrice,
          costPrice: product.costPrice,
          qty: 1,
          discountPct: 0,
          taxRatePct: 18,
          lineType: product.lineType,
          planPeriod: product.planPeriod,
        },
      ];
    });
  }

  function handleAddUpsell(suggestion: UpsellSuggestion) {
    setLines((prev) => [
      ...prev,
      {
        id: `l_upsell_${Date.now()}`,
        productId: suggestion.product_id,
        productName: suggestion.product_name,
        sku: suggestion.sku,
        category: (suggestion.category_name as any) || "Service",
        unitPrice: 34000,
        costPrice: 18000,
        qty: 1,
        discountPct: 0,
        taxRatePct: 18,
        lineType: "ONE_TIME",
      },
    ]);
  }

  function copyPortalLink() {
    const token = "pt_acme_839f201d4a67b8e";
    const portalUrl = `${window.location.origin}/portal/q/${token}`;
    navigator.clipboard.writeText(portalUrl);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 3000);
  }

  function handleSubmitQuote() {
    if (totals.requiredLevel === "FINANCE" || totals.requiredLevel === "MANAGER") {
      setSubmittedStatus("PENDING_APPROVAL");
      router.push(`/approvals/${quoteId}`);
    } else {
      setSubmittedStatus("APPROVED");
      router.push(`/fulfillment/${quoteId}`);
    }
  }

  const filteredCatalog = CATALOG.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchCategory =
      categoryTab === "ALL" ||
      p.category.toUpperCase() === categoryTab.toUpperCase();
    return matchSearch && matchCategory;
  });

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
                {quoteId} &middot; {customerName}
              </h1>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 border border-amber-500/20">
                {customerTier} Customer (15% Discretion)
              </span>
            </div>
            <p className="text-[12.5px] text-mist">
              Created by J. Rao &middot; Last modified 4 mins ago
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
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
            href={`/portal/q/pt_acme_839f201d4a67b8e`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-3 py-2 text-[12.5px] font-medium text-mist hover:text-ink transition-colors"
            title="Open customer portal in isolated view"
          >
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      <LifecycleBar currentStage="PRICING" />

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

            {/* Category tabs */}
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
                      {product.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-mist mt-1">{product.stock}</p>
                </div>

                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-ink/6">
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-ink">
                    &#8377;{product.unitPrice.toLocaleString("en-IN")}
                  </span>
                  <button
                    type="button"
                    onClick={() => addProductToCart(product)}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-bone hover:bg-ink/90 transition-colors"
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
                  {totals.computedLines.length} line items configured
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-mist font-medium uppercase">
                  Net Cart Value
                </span>
                <p className="font-mono text-[18px] font-serif font-semibold text-ink tabular-nums">
                  &#8377;{totals.finalNet.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Lines List */}
            <div className="mt-4 space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {totals.computedLines.map((line) => (
                <div
                  key={line.id}
                  className={`rounded-[18px] p-3.5 border transition-all ${
                    line.isOver
                      ? "border-amber-500/40 bg-amber-500/[0.04]"
                      : "border-ink/8 bg-white shadow-2xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13.5px] text-ink">
                          {line.productName}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-ink/5 text-mist">
                          {line.category}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-mist">
                        {line.sku} &middot; List: &#8377;
                        {line.unitPrice.toLocaleString("en-IN")} each
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-mist hover:text-rose-600 transition-colors p-1"
                      title="Remove line item"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {/* Qty & Discount Controls */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-ink/6">
                    {/* Qty Stepper */}
                    <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream/60 px-2 py-0.5">
                      <button
                        type="button"
                        onClick={() => updateQty(line.id, -1)}
                        className="text-mist hover:text-ink transition-colors"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="font-mono text-[12px] font-semibold px-2 tabular-nums">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(line.id, 1)}
                        className="text-mist hover:text-ink transition-colors"
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
                        value={line.discountPct}
                        onChange={(e) =>
                          updateDiscount(line.id, parseFloat(e.target.value) || 0)
                        }
                        className={`w-14 rounded-md px-1.5 py-0.5 text-right font-mono text-[12.5px] font-semibold border focus:outline-hidden ${
                          line.isOver
                            ? "border-amber-500 bg-amber-50 text-amber-900"
                            : "border-ink/15 bg-white text-ink"
                        }`}
                      />
                    </div>

                    {/* Line Total & Line Margin */}
                    <div className="text-right">
                      <span className="font-mono text-[13px] font-semibold text-ink tabular-nums">
                        &#8377;{line.lineNet.toLocaleString("en-IN")}
                      </span>
                      <span className="ml-1.5 text-[11px] font-mono font-medium text-emerald-800">
                        ({line.lineMarginPct.toFixed(0)}% mg)
                      </span>
                    </div>
                  </div>

                  {/* Ceiling Violation Warning Box */}
                  {line.isOver && (
                    <div className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[11.5px] text-amber-900 border border-amber-500/20 flex items-start gap-1.5">
                      <ShieldAlert className="size-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>
                        <strong>Exceeds category discretion:</strong> Allowed{" "}
                        {line.allowedCeiling}% ({line.category}), Applied{" "}
                        {line.discountPct}%. <strong>+{line.overagePts}pt over limit.</strong> Will auto-route to Approvals.
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {totals.computedLines.length === 0 && (
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
            <div className="mt-4 pt-3 border-t border-ink/6 flex items-center justify-between text-[12.5px]">
              <span className="text-mist font-medium">
                Overall Order Discount (%):
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={orderDiscountPct}
                  onChange={(e) =>
                    setOrderDiscountPct(parseFloat(e.target.value) || 0)
                  }
                  className="w-16 rounded-md border border-ink/15 bg-white px-2 py-1 text-right font-mono text-[12.5px] font-semibold focus:outline-hidden"
                />
                <span className="font-mono text-mist">%</span>
              </div>
            </div>
          </div>

          {/* Workflow Action Bar */}
          <div className="mt-6 pt-4 border-t border-ink/8 space-y-2">
            <button
              type="button"
              onClick={handleSubmitQuote}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-semibold transition-all shadow-sm ${
                totals.requiredLevel === "FINANCE"
                  ? "bg-rose-700 text-white hover:bg-rose-800"
                  : totals.requiredLevel === "MANAGER"
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-ink text-bone hover:bg-ink/90"
              }`}
            >
              {totals.requiredLevel === "FINANCE" ? (
                <>
                  <ShieldAlert className="size-4" />
                  Submit for Approval (Manager + Finance) &rarr;
                </>
              ) : totals.requiredLevel === "MANAGER" ? (
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
              <span>Status: Draft (Unsaved)</span>
              <span>Blended Engine: Auto-Routing Active</span>
            </div>
          </div>
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
                  &#8377;{totals.listSubtotal.toLocaleString("en-IN")}
                </dd>
              </div>

              <div className="flex justify-between text-amber-800 font-medium">
                <dt>Discount Reductions</dt>
                <dd className="font-mono tabular-nums">
                  -&#8377;
                  {(totals.lineDiscountTotal + totals.orderDiscountAmt).toLocaleString(
                    "en-IN"
                  )}
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-mist">Net Subtotal</dt>
                <dd className="font-mono tabular-nums text-ink font-semibold">
                  &#8377;{totals.finalNet.toLocaleString("en-IN")}
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-mist">Applicable GST (18%)</dt>
                <dd className="font-mono tabular-nums text-ink">
                  &#8377;{totals.finalTax.toLocaleString("en-IN")}
                </dd>
              </div>

              <div className="pt-2 border-t border-ink/8 flex justify-between text-[15px] font-semibold">
                <dt className="text-ink">Grand Total</dt>
                <dd className="font-mono text-ink tabular-nums">
                  &#8377;{totals.grandTotal.toLocaleString("en-IN")}
                </dd>
              </div>

              <div className="pt-2 border-t border-ink/4 flex justify-between text-[11.5px] text-mist">
                <dt>One-time items:</dt>
                <dd className="font-mono tabular-nums font-medium">
                  &#8377;{totals.oneTimeTotal.toLocaleString("en-IN")}
                </dd>
              </div>
              <div className="flex justify-between text-[11.5px] text-mist">
                <dt>Recurring subscriptions:</dt>
                <dd className="font-mono tabular-nums font-medium">
                  &#8377;{totals.recurringTotal.toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>

            {/* Live Margin Indicator Bar */}
            <div className="mt-4 pt-3 border-t border-ink/6">
              <MarginBar
                marginPct={totals.totalMarginPct}
                targetPct={25}
                floorPct={12}
              />
            </div>
          </div>

          {/* Governance Risk Verdict Card */}
          <div
            className={`rounded-[24px] p-5 border shadow-xs transition-all ${
              totals.requiredLevel === "FINANCE"
                ? "bg-rose-50/70 border-rose-200"
                : totals.requiredLevel === "MANAGER"
                ? "bg-amber-50/70 border-amber-200"
                : "bg-emerald-50/70 border-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-ink/6">
              <h3 className="text-[13.5px] font-semibold text-ink">
                Governance Determination
              </h3>
              <RiskBadge
                score={totals.blendedRiskScore}
                requiredLevel={totals.requiredLevel}
                size="sm"
              />
            </div>

            <p className="mt-2.5 text-[12px] leading-relaxed text-ink/80">
              {totals.rationale}
            </p>

            <div className="mt-3 pt-2.5 border-t border-ink/6 flex items-center justify-between text-[11.5px] text-mist">
              <span>Max line overage: +{totals.maxLineOverage}pt</span>
              <Link
                href={`/approvals/${quoteId}`}
                className="font-semibold text-ink hover:underline"
              >
                Inspect Policy Table &rarr;
              </Link>
            </div>
          </div>

          {/* Smart Recommendations Upsell Panel (SALES-06) */}
          <UpsellPanel onAddSuggestion={handleAddUpsell} />
        </div>
      </div>
    </div>
  );
}
