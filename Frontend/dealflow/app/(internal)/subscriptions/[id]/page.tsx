"use client";

import React, { useMemo, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Repeat,
  RotateCcw,
  Sparkles,
  ReceiptText,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch } from "@/lib/hooks";
import { inr } from "@/lib/hooks";
import { OrderApi } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { SalesOrder, OrderBilling, BillingSchedule, SubscriptionChangeResponse } from "@/lib/types";

export default function SubscriptionBillingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;
  const orderIdNum = Number(orderId);

  const orderFetch = useFetch<SalesOrder>(`/v1/orders/${orderId}`);
  const billingFetch = useFetch<OrderBilling>(`/v1/orders/${orderId}/billing`);

  // Local billing override — set wholesale with whatever the server returns
  // after a mutation (generate, change quantity). We never patch it by hand.
  // Until a mutation happens, the effective view is just what was fetched.
  const [billingOverride, setBillingOverride] = useState<OrderBilling | null>(null);
  const billing = billingOverride ?? billingFetch.data ?? null;
  function setBilling(next: OrderBilling) {
    setBillingOverride(next);
  }

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await OrderApi.generateInvoice(orderIdNum);
      setBilling(result);
    } catch (e) {
      setGenerateError(e instanceof ApiError ? e.message : "Failed to generate invoice and billing schedule.");
    } finally {
      setGenerating(false);
    }
  }

  // Mid-cycle quantity change, per recurring line.
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({});
  const [changingLineId, setChangingLineId] = useState<number | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<SubscriptionChangeResponse | null>(null);

  async function handleChangeQty(lineId: number) {
    const draft = (qtyDrafts[lineId] ?? "").trim();
    if (!draft) return;
    setChangingLineId(lineId);
    setChangeError(null);
    setChangeResult(null);
    try {
      const result = await OrderApi.changeSubscription(orderIdNum, lineId, draft);
      setBilling(result.billing);
      setChangeResult(result);
      setQtyDrafts((prev) => ({ ...prev, [lineId]: "" }));
    } catch (e) {
      setChangeError(e instanceof ApiError ? e.message : "Failed to change subscription quantity.");
    } finally {
      setChangingLineId(null);
    }
  }

  const scheduleGroups = useMemo(() => {
    const map = new Map<number, BillingSchedule[]>();
    for (const s of billing?.schedules ?? []) {
      const arr = map.get(s.quotation_line_id) ?? [];
      arr.push(s);
      map.set(s.quotation_line_id, arr);
    }
    return Array.from(map.entries()).map(([lineId, schedules]) => ({
      lineId,
      schedules: [...schedules].sort((a, b) => a.seq - b.seq),
    }));
  }, [billing]);

  const oneTimeInvoices = billing?.invoices.filter((i) => i.kind === "ONETIME") ?? [];
  const hasNoBillingYet = !!billing && billing.invoices.length === 0 && billing.schedules.length === 0;

  const loading = orderFetch.loading || billingFetch.loading;
  const fatalError = orderFetch.error ?? billingFetch.error;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-[13px] text-mist font-medium">Loading billing detail...</p>
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-[14px] font-medium text-bad">Failed to load this order</p>
          <p className="text-[12px] text-mist mt-1">{fatalError.message}</p>
          <button
            type="button"
            onClick={() => {
              orderFetch.refetch();
              billingFetch.refetch();
            }}
            className="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const order = orderFetch.data!;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:items-center">
          <Link
            href="/subscriptions"
            className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-cream transition-colors text-ink sm:mt-0"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-[22px] font-medium tracking-tight text-ink sm:text-[30px]">
                Billing: {order.reference} ({order.customer_name})
              </h1>
              <StatusBadge status={order.status} size="sm" />
            </div>
            <p className="text-[12.5px] text-mist">
              Quotation: <strong>{order.quotation_reference}</strong>
              {order.promised_date ? (
                <>
                  {" "}
                  &middot; Promised: <strong>{order.promised_date}</strong>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <LifecycleBar currentStage="BILLING" />

      {changeResult && (
        <div
          className={`rounded-[18px] p-4 text-[13px] font-medium flex flex-wrap items-center justify-between gap-3 ${
            changeResult.proration.kind === "CREDIT" ? "tone-warn text-warn" : "tone-ok text-ok"
          }`}
        >
          <span>
            {changeResult.proration.kind === "CHARGE" &&
              `Mid-cycle change applied — prorated charge of ${inr(changeResult.proration.amount)} added.`}
            {changeResult.proration.kind === "CREDIT" &&
              `Mid-cycle change applied — a credit note for ${inr(changeResult.proration.amount)} was issued.`}
            {changeResult.proration.kind === "NONE" && "Mid-cycle change applied — no charge or credit was due."}
          </span>
          <span className="text-[11px]">Proration factor: {changeResult.proration.factor}</span>
        </div>
      )}

      {changeError && (
        <div className="rounded-[18px] tone-bad p-4 border border-transparent text-[13px] text-bad font-medium">
          {changeError}
        </div>
      )}

      {hasNoBillingYet ? (
        <div className="rounded-[24px] bg-white p-6 card-shadow text-center sm:p-8">
          <Sparkles className="size-6 text-lilac mx-auto" />
          <h3 className="mt-3 text-[17px] font-semibold text-ink">
            No billing set up for this order yet
          </h3>
          <p className="mt-1.5 text-[13px] text-mist max-w-md mx-auto">
            Generate the one-time invoice and the recurring billing schedule for this order in a single step.
          </p>
          {generateError && (
            <p className="mt-3 text-[12.5px] text-bad font-medium">{generateError}</p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <span className="size-3.5 border-2 border-bone/40 border-t-bone rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <ReceiptText className="size-3.5" /> Generate Invoice &amp; Billing Schedule
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* TRACK 1: ONE-TIME INVOICES */}
          <div className="rounded-[24px] bg-white p-5 card-shadow lg:col-span-4 flex flex-col justify-between sm:p-6">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-ink/6">
                <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                  <FileText className="size-4 text-ink/70" />
                  One-Time Invoices
                </span>
              </div>

              {oneTimeInvoices.length === 0 ? (
                <p className="mt-4 text-[12.5px] text-mist">
                  This order has no one-time invoice.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {oneTimeInvoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="block rounded-[16px] bg-cream/40 p-3.5 border border-ink/6 hover:bg-cream/60 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-mist">Invoice Ref: {inv.reference}</p>
                        <StatusBadge status={inv.status} size="sm" />
                      </div>
                      <p className="font-serif text-[22px] font-semibold text-ink mt-1 tabular-nums">
                        {inr(inv.total)}
                      </p>
                      <div className="text-[12px] text-mist mt-1.5 space-y-0.5">
                        <div className="flex justify-between">
                          <span>Issue Date:</span>
                          <span className="text-ink font-medium">{inv.issue_date}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Paid:</span>
                          <span className="text-ok font-semibold">{inr(inv.amount_paid)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* TRACK 2: RECURRING SUBSCRIPTION SCHEDULE */}
          <div className="rounded-[24px] bg-white p-5 card-shadow lg:col-span-8 flex flex-col justify-between sm:p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink/6">
                <div>
                  <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                    <Repeat className="size-4 text-lilac" />
                    Recurring Billing Schedule
                  </span>
                  <p className="text-[12px] text-mist mt-0.5">
                    One-time and recurring lines are billed separately on this order.
                  </p>
                </div>
              </div>

              {scheduleGroups.length === 0 ? (
                <p className="mt-4 text-[12.5px] text-mist">
                  This order has no recurring lines.
                </p>
              ) : (
                <div className="mt-5 space-y-5">
                  {scheduleGroups.map((group) => {
                    const first = group.schedules[0];
                    return (
                      <div key={group.lineId} className="rounded-[18px] border border-ink/8 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-ink text-[13.5px]">{first.product_name}</p>
                            <p className="text-[11.5px] text-mist">{first.plan_name}</p>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {group.schedules.map((s) => (
                            <div
                              key={s.id}
                              className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-[14px] bg-cream/30 border border-ink/6 text-[12.5px]"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="size-6 shrink-0 flex items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink">
                                  {s.seq}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-medium text-ink">Period {s.seq}</span>
                                  <span className="text-mist ml-2 text-[11.5px]">
                                    {s.period_start} &ndash; {s.period_end}
                                  </span>
                                </div>
                              </div>

                              <div className="ml-auto flex items-center gap-3 sm:gap-4">
                                <span className="font-semibold tabular-nums text-ink">
                                  {inr(s.amount)}
                                </span>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    s.status === "PAID"
                                      ? "tone-ok text-ok"
                                      : s.status === "INVOICED"
                                        ? "tone-warn text-warn"
                                        : "bg-ink/5 text-mist"
                                  }`}
                                >
                                  {s.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Change quantity / cancel control */}
                        <div className="mt-3 pt-3 border-t border-ink/6 flex flex-wrap items-center gap-2.5">
                          <label className="basis-full text-[11.5px] font-medium text-mist sm:basis-auto">
                            Change quantity (0 to cancel this line):
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            placeholder="New qty"
                            value={qtyDrafts[group.lineId] ?? ""}
                            onChange={(e) =>
                              setQtyDrafts((prev) => ({ ...prev, [group.lineId]: e.target.value }))
                            }
                            className="w-24 rounded-lg border border-ink/15 px-2.5 py-1.5 text-[12.5px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleChangeQty(group.lineId)}
                            disabled={changingLineId === group.lineId || !(qtyDrafts[group.lineId] ?? "").trim()}
                            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {changingLineId === group.lineId ? (
                              <>
                                <span className="size-3 border-2 border-bone/40 border-t-bone rounded-full animate-spin" />
                                Applying...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="size-3" /> Apply Proration
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credit Notes */}
      {billing && billing.credit_notes.length > 0 && (
        <div className="rounded-[24px] bg-white p-5 card-shadow sm:p-6">
          <h3 className="text-[14px] font-semibold text-ink pb-3 border-b border-ink/6">
            Credit Notes
          </h3>
          <div className="mt-3 divide-y divide-ink/5">
            {billing.credit_notes.map((cn) => (
              <div key={cn.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12.5px]">
                <div>
                  <p className="font-medium text-ink">{cn.reference}</p>
                  <p className="text-mist text-[11.5px]">{cn.reason}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-warn">{inr(cn.amount)}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tone-warn text-warn">
                    {cn.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
