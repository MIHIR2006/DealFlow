"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  Clock,
  ShieldAlert,
  Copy,
  ExternalLink,
  Lock,
  Info,
  Mail,
} from "lucide-react";
import { LifecycleBar, type DealStage } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { MarginBar } from "@/components/ui/margin-bar";
import { ApprovalStepper } from "@/components/ui/approval-stepper";
import { UpsellPanel } from "@/components/workspace/upsell-panel";
import { NegotiationPanel } from "@/components/workspace/negotiation-panel";
import { QuotationApi, ConfigApi, ApiError } from "@/lib/api";
import { inr } from "@/lib/hooks";
import type {
  Quotation,
  Product,
  Category,
  SubscriptionPlan,
  Upsell,
  Page,
  ProductStock,
} from "@/lib/types";

const STAGE_BY_STATUS: Record<string, DealStage> = {
  DRAFT: "PRICING",
  PENDING_APPROVAL: "APPROVAL",
  APPROVED: "APPROVAL",
  SENT: "APPROVAL",
  UNDER_NEGOTIATION: "APPROVAL",
  CONFIRMED: "FULFILLMENT",
  REJECTED: "APPROVAL",
};

export default function QuotationBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = use(params);
  const id = Number(idParam);
  const router = useRouter();

  const [quote, setQuote] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  // Availability per product, keyed by product id. A rep needs to see what
  // they can actually promise before they put it in a cart.
  const [stock, setStock] = useState<Record<number, ProductStock>>({});
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [upsellLoading, setUpsellLoading] = useState(false);

  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryTab, setCategoryTab] = useState("ALL");
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [portalCopied, setPortalCopied] = useState(false);
  // Whether the backend also emailed the link, and to whom. It only claims
  // this when a send actually happened, so the rep is never told a customer
  // was mailed on a deployment with no SMTP configured.
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  const [discountDraft, setDiscountDraft] = useState<Record<number, string>>({});
  const [orderDiscountDraft, setOrderDiscountDraft] = useState("");

  const loadQuote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = await QuotationApi.get(id);
      setQuote(q);
      setOrderDiscountDraft(q.order_discount_pct);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this quotation.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadUpsells = useCallback(async () => {
    setUpsellLoading(true);
    try {
      const page = await QuotationApi.upsell(id);
      setUpsells(page.data);
    } catch {
      setUpsells([]);
    } finally {
      setUpsellLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadQuote();
    loadUpsells();
    ConfigApi.listProducts({ limit: 100 }).then((p: Page<Product>) => setProducts(p.data));
    ConfigApi.listCategories().then((p: Page<Category>) => setCategories(p.data));
    ConfigApi.listPlans().then((p: Page<SubscriptionPlan>) => setPlans(p.data));
    ConfigApi.listStock()
      .then((p: Page<ProductStock>) =>
        setStock(Object.fromEntries(p.data.map((r) => [r.product_id, r]))),
      )
      // Stock is an aid, not a gate — the split engine re-reads it under lock
      // at fulfilment. A failure here must not stop a rep pricing a deal.
      .catch(() => setStock({}));
  }, [loadQuote, loadUpsells]);

  const isDraft = quote?.status === "DRAFT";

  async function withErrorHandling(fn: () => Promise<Quotation>) {
    setBusy(true);
    setError(null);
    try {
      const q = await fn();
      setQuote(q);
      setOrderDiscountDraft(q.order_discount_pct);
      return q;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const refreshStock = useCallback(() => {
    ConfigApi.listStock()
      .then((p: Page<ProductStock>) =>
        setStock(Object.fromEntries(p.data.map((r) => [r.product_id, r]))),
      )
      .catch(() => {});
  }, []);

  async function addProduct(product: Product, planId?: number) {
    const q = await withErrorHandling(() =>
      QuotationApi.addLine(id, {
        product_id: product.id,
        qty: "1",
        discount_pct: "0",
        plan_id: product.is_subscription ? planId ?? plans[0]?.id ?? null : null,
      }),
    );
    if (q) {
      loadUpsells();
      refreshStock();
    }
  }

  async function changeQty(lineId: number, currentQty: string, currentDiscount: string, delta: number) {
    const newQty = Math.max(1, Math.round(parseFloat(currentQty) || 1) + delta);
    await withErrorHandling(() =>
      QuotationApi.updateLine(id, lineId, { qty: String(newQty), discount_pct: currentDiscount }),
    );
  }

  async function commitDiscount(lineId: number, currentQty: string) {
    const raw = discountDraft[lineId];
    if (raw === undefined) return;
    const pct = Math.max(0, Math.min(100, parseFloat(raw) || 0));
    await withErrorHandling(() =>
      QuotationApi.updateLine(id, lineId, { qty: currentQty, discount_pct: String(pct) }),
    );
  }

  async function removeLine(lineId: number) {
    const q = await withErrorHandling(() => QuotationApi.deleteLine(id, lineId));
    if (q) loadUpsells();
  }

  async function commitOrderDiscount() {
    const pct = Math.max(0, Math.min(100, parseFloat(orderDiscountDraft) || 0));
    await withErrorHandling(() => QuotationApi.setOrderDiscount(id, String(pct)));
  }

  async function submitQuote() {
    const q = await withErrorHandling(() => QuotationApi.submit(id));
    if (q && q.status === "APPROVED") {
      // No approval needed: straight to fulfillment per the spec's flow.
    }
  }

  async function sendToPortal() {
    setBusy(true);
    setError(null);
    try {
      const res = await QuotationApi.send(id);
      setPortalLink(`${window.location.origin}/portal/q/${res.token}`);
      setEmailedTo(res.emailed_to ?? null);
      await loadQuote();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate a portal link.");
    } finally {
      setBusy(false);
    }
  }

  // Re-send the live link. Deliberately not "send again": sending mints a new
  // token and revokes this one, which would break the link already in the
  // customer's inbox.
  async function emailPortalLink() {
    setResending(true);
    setResendNote(null);
    setError(null);
    try {
      const res = await QuotationApi.resendLink(id);
      setResendNote(`Link emailed to ${res.emailed_to}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not email that link.");
    } finally {
      setResending(false);
    }
  }

  function copyPortalLink() {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 3000);
  }

  async function confirmOrder() {
    setBusy(true);
    setError(null);
    try {
      const order = await QuotationApi.confirm(id);
      router.push(`/fulfillment/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm this order.");
      setBusy(false);
    }
  }

  const filteredCatalog = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchCategory = categoryTab === "ALL" || p.category_name === categoryTab;
    return matchSearch && matchCategory;
  });

  const addedProductIds = quote?.lines.map((l) => l.product_id) ?? [];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="mx-auto max-w-[480px] py-16 text-center">
        <p className="text-[14px] font-medium text-rose-800">{error ?? "Quotation not found."}</p>
        <Link href="/quotations" className="mt-3 inline-block text-[13px] text-ink underline">
          Back to quotations
        </Link>
      </div>
    );
  }

  const risk = quote.risk;
  const blended = parseFloat(risk.blended_score) || 0;
  const maxOverage = parseFloat(risk.max_line_overage) || 0;

  // A quotation reaches the customer only once it has cleared approval. The
  // backend enforces this; the button explains it rather than disappearing,
  // so the rep can see where the deal actually is.
  const canSendToPortal =
    quote.status === "APPROVED" || quote.status === "SENT" || quote.status === "UNDER_NEGOTIATION";
  const sendBlockedReason = canSendToPortal
    ? null
    : quote.status === "DRAFT"
      ? "Submit this quotation first — it has to clear approval before the customer can see it."
      : quote.status === "PENDING_APPROVAL"
        ? "Waiting on internal approval. You can send the portal link as soon as it is approved."
        : quote.status === "CONFIRMED"
          ? "The customer already confirmed this quotation."
          : "This quotation cannot be sent to the customer portal.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:items-center">
          <Link
            href="/quotations"
            className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-cream transition-colors text-ink sm:mt-0"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-[24px] font-medium tracking-tight text-ink sm:text-[28px]">
                {quote.reference} &middot; {quote.customer_name}
              </h1>
              <StatusBadge status={quote.status} />
              <span className="rounded-full tone-warn px-2.5 py-0.5 text-[11px] font-semibold text-warn">
                {quote.customer_tier} customer
              </span>
            </div>
            <p className="text-[12.5px] text-mist">
              Owned by {quote.rep_name} &middot; Last activity {new Date(quote.last_activity_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-2.5">
          {/* The rep's own step in the flow. It stays on screen in every state
              so the action is discoverable, and says why when it cannot run --
              a quotation still in approval has nothing to send yet. */}
          {quote.status !== "REJECTED" ? (
            <button
              type="button"
              onClick={portalLink ? copyPortalLink : sendToPortal}
              disabled={busy || !canSendToPortal}
              title={sendBlockedReason ?? undefined}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:flex-none sm:justify-start"
            >
              {portalCopied ? (
                <>
                  <CheckCircle className="size-3.5 text-ok" /> Copied link!
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-mist" />
                  {portalLink ? "Copy portal link" : "Send to customer portal"}
                </>
              )}
            </button>
          ) : null}
          {canSendToPortal ? (
            <button
              type="button"
              onClick={emailPortalLink}
              disabled={busy || resending}
              title="Email this link to the customer without changing it"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="size-3.5 text-mist" />
              {resending ? "Sending…" : "Email to customer"}
            </button>
          ) : null}
          {portalLink ? (
            <Link
              href={portalLink.replace(window.location.origin, "")}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-3 py-2 text-[12.5px] font-medium text-mist hover:text-ink transition-colors"
              title="Open customer portal in isolated view"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      <LifecycleBar currentStage={STAGE_BY_STATUS[quote.status] ?? "PRICING"} />

      {sendBlockedReason && quote.status !== "REJECTED" ? (
        <p className="flex items-center gap-1.5 text-[12px] text-mist">
          <Info className="size-3.5 shrink-0" />
          {sendBlockedReason}
        </p>
      ) : null}

      {resendNote ? (
        <p className="flex items-center gap-1.5 text-[12px] text-ok">
          <CheckCircle className="size-3.5 shrink-0" />
          {resendNote} The link itself is unchanged.
        </p>
      ) : null}

      {portalLink ? (
        <p className="flex items-center gap-1.5 text-[12px] text-mist">
          <Info className="size-3.5 shrink-0" />
          {emailedTo
            ? `Link emailed to ${emailedTo}. You can also copy it and share it yourself.`
            : "Link ready to copy. Outbound email is not configured on this deployment, so send it to the customer yourself."}
        </p>
      ) : null}

      {error ? (
        <div className="rounded-[16px] tone-bad p-3 text-[12.5px] text-bad">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {isDraft ? (
          <div className="flex h-[420px] flex-col rounded-[24px] bg-white p-4 card-shadow lg:col-span-3 lg:h-[740px]">
            <div className="pb-3 border-b border-ink/6">
              <h2 className="text-[14px] font-semibold text-ink">Catalog &amp; Stock</h2>
              <p className="text-[11.5px] text-mist mt-0.5">Select products to add to the cart</p>

              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search catalog..."
                className="mt-3 w-full rounded-full bg-ink/[0.03] px-3 py-1.5 text-[12px] border border-ink/6 focus:outline-hidden"
              />

              <div className="scroll-x mt-2.5 flex items-center gap-1 pb-1">
                {["ALL", ...categories.map((c) => c.name)].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCategoryTab(tab)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      categoryTab === tab ? "bg-ink text-bone" : "bg-ink/[0.03] text-mist hover:text-ink"
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
                  className="group rounded-[16px] bg-cream/30 p-3 border border-ink/6 hover:border-ink/15 hover:bg-cream/60 transition-all"
                >
                  <div className="flex items-start justify-between gap-1">
                    <h4 className="text-[12.5px] font-semibold text-ink leading-tight">{product.name}</h4>
                    <span className="text-[9.5px] uppercase font-bold px-1.5 py-0.5 rounded bg-ink/5 text-mist">
                      {product.category_name}
                    </span>
                  </div>
                  <p className="text-[11px] text-mist mt-1">SKU {product.sku}</p>

                  {/* What the rep can actually promise. A subscription has no
                      inventory, so it says so rather than reporting zero. */}
                  {(() => {
                    const st = stock[product.id];
                    if (product.is_subscription) {
                      return (
                        <p className="mt-1.5 text-[11px] text-mist">No stock held &middot; billed per period</p>
                      );
                    }
                    if (!st) {
                      return <p className="mt-1.5 text-[11px] text-mist">Stock not tracked</p>;
                    }
                    const tone =
                      st.available <= 0
                        ? "tone-bad text-bad"
                        : st.available <= 5
                          ? "tone-warn text-warn"
                          : "tone-ok text-ok";
                    return (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ${tone}`}
                          title={`${st.on_hand} on hand, ${st.on_hand - st.available} reserved by other orders`}
                        >
                          {st.available > 0 ? `${st.available} in stock` : "Out of stock"}
                        </span>
                        <span className="text-[10.5px] text-mist">
                          across {st.warehouse_count} warehouse{st.warehouse_count === 1 ? "" : "s"}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-ink/6">
                    <span className="text-[12px] font-semibold tabular-nums text-ink">
                      {inr(product.unit_price)}
                      {product.is_subscription ? "/period" : ""}
                    </span>
                    <button
                      type="button"
                      disabled={busy || (product.is_subscription && plans.length === 0)}
                      onClick={() => addProduct(product)}
                      className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-2 text-[11px] font-medium text-bone hover:bg-ink/90 transition-colors disabled:opacity-50 sm:px-2.5 sm:py-1"
                    >
                      <Plus className="size-3" /> Add
                    </button>
                  </div>
                  {product.is_subscription && plans.length > 0 ? (
                    <p className="mt-1 text-[10px] text-mist">Plan: {plans[0].name} ({plans[0].period})</p>
                  ) : null}
                  {product.is_subscription && plans.length === 0 ? (
                    <p className="mt-1 text-[10px] text-bad">No subscription plans configured</p>
                  ) : null}
                </div>
              ))}
              {filteredCatalog.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-mist">No products match.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={`rounded-[24px] bg-white p-5 card-shadow flex flex-col justify-between ${isDraft ? "lg:col-span-5" : "lg:col-span-8"}`}>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight text-ink">Quotation cart</h2>
                <p className="text-[12px] text-mist">{quote.lines.length} line items</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-mist font-medium uppercase">Net value</span>
                <p className="text-[18px] font-serif font-semibold text-ink tabular-nums">
                  {inr(quote.totals.net_subtotal)}
                </p>
              </div>
            </div>

            {!isDraft ? (
              <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-cream/60 p-2.5 text-[12px] text-mist">
                <Lock className="size-3.5 shrink-0" />
                Editing is locked while this quotation is {quote.status.replace(/_/g, " ").toLowerCase()}.
                {quote.status === "PENDING_APPROVAL"
                  ? " A reviewer must return it for revision before lines can change."
                  : ""}
              </div>
            ) : null}

            <div className="mt-4 space-y-3 lg:max-h-[460px] lg:overflow-y-auto lg:pr-1">
              {quote.lines.map((line) => {
                const isOver = parseFloat(line.margin_pct) < 0 || risk.breakdown.find((b) => b.line_id === line.id)?.is_over;
                const breakdown = risk.breakdown.find((b) => b.line_id === line.id);
                return (
                  <div
                    key={line.id}
                    className={`rounded-[18px] p-3.5 border transition-all ${
                      breakdown?.is_over ? "border-transparent bg-amber-500/5" : "border-ink/8 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[13.5px] text-ink">{line.product_name}</span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-ink/5 text-mist">
                            {line.category_name}
                          </span>
                          {line.line_type === "RECURRING" ? (
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded tone-lilac">
                              {line.plan_name} &middot; {line.plan_period}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-mist">
                          {line.sku} &middot; List: {inr(line.unit_price)} each
                        </p>
                      </div>
                      {isDraft ? (
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={busy}
                          className="-m-1 p-2 text-mist transition-colors hover:text-bad sm:m-0 sm:p-1"
                          title="Remove line item"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-ink/6">
                      <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream/60 px-2 py-0.5">
                        <button
                          type="button"
                          disabled={!isDraft || busy}
                          onClick={() => changeQty(line.id, line.qty, line.line_discount_pct, -1)}
                          className="-m-2 p-2 text-mist transition-colors hover:text-ink disabled:opacity-30 sm:m-0 sm:p-0"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="text-[12px] font-semibold px-2 tabular-nums">{line.qty}</span>
                        <button
                          type="button"
                          disabled={!isDraft || busy}
                          onClick={() => changeQty(line.id, line.qty, line.line_discount_pct, 1)}
                          className="-m-2 p-2 text-mist transition-colors hover:text-ink disabled:opacity-30 sm:m-0 sm:p-0"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11.5px] text-mist font-medium">Disc %:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          disabled={!isDraft || busy}
                          value={discountDraft[line.id] ?? line.line_discount_pct}
                          onChange={(e) => setDiscountDraft((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          onBlur={() => commitDiscount(line.id, line.qty)}
                          className={`w-14 rounded-md px-1.5 py-0.5 text-right text-[12.5px] font-semibold border focus:outline-hidden disabled:opacity-60 ${
                            breakdown?.is_over ? "border-ink/20 tone-warn" : "border-ink/15 bg-white text-ink"
                          }`}
                        />
                      </div>

                      <div className="text-right">
                        <span className="text-[13px] font-semibold text-ink tabular-nums">
                          {inr(line.net_amount)}
                        </span>
                        <span className="ml-1.5 text-[11px] font-medium text-ok">
                          ({parseFloat(line.margin_pct).toFixed(0)}% mg)
                        </span>
                      </div>
                    </div>

                    {breakdown?.is_over ? (
                      <div className="mt-2 rounded-lg tone-warn p-2 text-[11.5px] text-warn flex items-start gap-1.5">
                        <ShieldAlert className="size-3.5 text-warn shrink-0 mt-0.5" />
                        <span>
                          <strong>Exceeds category discretion:</strong> allowed {breakdown.allowed_pct}%, given{" "}
                          {breakdown.given_pct}%. <strong>+{breakdown.overage_pts}pt over limit.</strong>
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {quote.lines.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-[18px] border border-dashed border-ink/15 text-center p-4">
                  <p className="text-[13px] font-medium text-ink">Quotation cart is empty</p>
                  <p className="text-[11.5px] text-mist mt-1">Add products from the catalog to begin pricing.</p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 pt-3 border-t border-ink/6 flex items-center justify-between text-[12.5px]">
              <span className="text-mist font-medium">Overall order discount (%):</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={!isDraft || busy}
                  value={orderDiscountDraft}
                  onChange={(e) => setOrderDiscountDraft(e.target.value)}
                  onBlur={commitOrderDiscount}
                  className="w-16 rounded-md border border-ink/15 bg-white px-2 py-1 text-right text-[12.5px] font-semibold focus:outline-hidden disabled:opacity-60"
                />
                <span className="text-mist">%</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/8 space-y-3">
            {isDraft ? (
              <button
                type="button"
                onClick={submitQuote}
                disabled={busy || quote.lines.length === 0}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-semibold transition-all shadow-sm disabled:opacity-50 ${
                  risk.required_level === "NONE" ? "bg-ink text-bone hover:bg-ink/90" : "fill-warn"
                }`}
              >
                {risk.required_level === "FINANCE" ? (
                  <>
                    <ShieldAlert className="size-4" /> Submit for approval (Manager &rarr; Finance)
                  </>
                ) : risk.required_level === "MANAGER" ? (
                  <>
                    <Clock className="size-4" /> Submit for approval (Sales Manager)
                  </>
                ) : (
                  <>
                    <CheckCircle className="size-4" /> Submit &amp; move to fulfillment
                  </>
                )}
              </button>
            ) : quote.status === "APPROVED" ? (
              <button
                type="button"
                onClick={confirmOrder}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-[13.5px] font-semibold text-bone hover:bg-ink/90 disabled:opacity-50"
              >
                <CheckCircle className="size-4" /> Confirm &amp; move to fulfillment
              </button>
            ) : quote.status === "CONFIRMED" ? (
              <button
                type="button"
                onClick={confirmOrder}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-[13.5px] font-semibold text-bone hover:bg-ink/90 disabled:opacity-50"
              >
                View fulfillment &rarr;
              </button>
            ) : null}

            {quote.approvals && quote.approvals.length > 0 ? (
              <ApprovalStepper steps={quote.approvals} currentStatus={quote.status} />
            ) : null}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-[24px] bg-white p-5 card-shadow">
            <h3 className="text-[14px] font-semibold text-ink pb-2.5 border-b border-ink/6">
              Financial summary
            </h3>
            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-mist">List subtotal</dt>
                <dd className="tabular-nums text-ink">{inr(quote.totals.list_subtotal)}</dd>
              </div>
              <div className="flex justify-between text-warn font-medium">
                <dt>Discount reductions</dt>
                <dd className="tabular-nums">-{inr(quote.totals.discount_total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist">Net subtotal</dt>
                <dd className="tabular-nums text-ink font-semibold">{inr(quote.totals.net_subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist">Tax</dt>
                <dd className="tabular-nums text-ink">{inr(quote.totals.tax_total)}</dd>
              </div>
              <div className="pt-2 border-t border-ink/8 flex justify-between text-[15px] font-semibold">
                <dt className="text-ink">Grand total</dt>
                <dd className="text-ink tabular-nums">{inr(quote.totals.grand_total)}</dd>
              </div>
              <div className="pt-2 border-t border-ink/4 flex justify-between text-[11.5px] text-mist">
                <dt>One-time items:</dt>
                <dd className="tabular-nums font-medium">{inr(quote.totals.one_time_total)}</dd>
              </div>
              <div className="flex justify-between text-[11.5px] text-mist">
                <dt>Recurring per period:</dt>
                <dd className="tabular-nums font-medium">{inr(quote.totals.recurring_total)}</dd>
              </div>
            </dl>
            <div className="mt-4 pt-3 border-t border-ink/6">
              <MarginBar marginPct={quote.totals.margin_pct} targetPct={25} floorPct={12} />
            </div>
          </div>

          <div
            className={`rounded-[24px] p-5 border transition-all ${
              risk.required_level === "FINANCE"
                ? "tone-bad border-transparent"
                : risk.required_level === "MANAGER"
                  ? "tone-warn border-transparent"
                  : "tone-ok border-transparent"
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-ink/6">
              <h3 className="text-[13.5px] font-semibold text-ink">Governance determination</h3>
              <RiskBadge score={blended} requiredLevel={risk.required_level} size="sm" />
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink/80">{risk.rationale}</p>
            <div className="mt-3 pt-2.5 border-t border-ink/6 flex items-center justify-between text-[11.5px] text-mist">
              <span>Max line overage: +{maxOverage}pt</span>
              {quote.status !== "DRAFT" ? (
                <Link href="/approvals" className="font-semibold text-ink hover:underline">
                  Approvals inbox &rarr;
                </Link>
              ) : null}
            </div>
          </div>

          {isDraft ? (
            <UpsellPanel
              suggestions={upsells}
              addedIds={addedProductIds}
              loading={upsellLoading}
              onAddSuggestion={(u) => {
                const product = products.find((p) => p.id === u.product_id);
                if (product) addProduct(product);
              }}
            />
          ) : null}

          {/* The customer's side of this deal. It renders once the quotation
              has left draft, which is the point a customer can be talking to
              us at all. */}
          {!isDraft ? (
            <NegotiationPanel
              quotationId={id}
              lines={quote.lines}
              onReplied={loadQuote}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
