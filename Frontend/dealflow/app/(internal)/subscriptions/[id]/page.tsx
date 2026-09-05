"use client";

import React, { useState, use, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
  Repeat,
  X,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetch, useMutation, inr, timeAgo } from "@/lib/hooks";

interface BillingInvoice {
  id: number;
  reference: string;
  kind: string;
  status: string;
  issue_date: string;
  due_date?: string;
  total: string;
  amount_paid: string;
}

interface BillingSchedule {
  id: number;
  quotation_line_id: number;
  product_name: string;
  seq: number;
  period_start: string;
  period_end: string;
  amount: string;
  proration_factor: string;
  status: string;
}

interface CreditNote {
  id: number;
  reference: string;
  amount: string;
  reason: string;
  status: string;
  created_at: string;
}

interface BillingView {
  order_id: number;
  order_reference: string;
  customer_name: string;
  invoices: BillingInvoice[];
  schedules: BillingSchedule[];
  credit_notes: CreditNote[];
}

export default function SubscriptionBillingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;

  const {
    data: billingRes,
    loading,
    error,
    refetch,
  } = useFetch<BillingView>(`/v1/orders/${orderId}/billing`);
  const billing = billingRes;

  const { trigger: generateInvoice, loading: generating } = useMutation();
  const { trigger: changeSubscription, loading: changing } = useMutation();

  const [prorationModalOpen, setProrationModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<BillingSchedule | null>(null);
  const [newQty, setNewQty] = useState(4);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleGenerateInvoice() {
    try {
      await generateInvoice(`/v1/orders/${orderId}/invoices`, {
        method: "POST",
        headers: {
          "Idempotency-Key": `gen-inv-${orderId}-${Date.now()}`,
        },
      });
      setNotice("One-time invoice successfully generated!");
      refetch();
    } catch (e: any) {
      setNotice(`Error: ${e.message}`);
    }
  }

  async function handleApplyProration(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSchedule) return;
    try {
      const lineId = selectedSchedule.quotation_line_id;
      const res: any = await changeSubscription(
        `/v1/orders/${orderId}/subscriptions/${lineId}/change`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": `sub-chg-${orderId}-${lineId}-${Date.now()}`,
          },
          body: JSON.stringify({ qty: String(newQty) }),
        }
      );
      setProrationModalOpen(false);
      setNotice(
        `Subscription modified (${res.kind ?? "UPDATED"})! Prorated adjustment: ${inr(
          res.amount ?? 0
        )} with proration factor ${res.factor ?? "1.00"}.`
      );
      refetch();
    } catch (e: any) {
      alert(`Modification error: ${e.message}`);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !billing) {
    return (
      <div className="space-y-4">
        <Link
          href="/subscriptions"
          className="inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to Subscriptions
        </Link>
        <div className="rounded-[20px] bg-rose-50 border border-rose-200 p-6 text-center">
          <p className="font-semibold text-rose-900">Failed to load billing tracks</p>
          <p className="text-[13px] text-rose-700 mt-1">{error?.message ?? "Order billing not found"}</p>
        </div>
      </div>
    );
  }

  const invoices = billing.invoices ?? [];
  const schedules = billing.schedules ?? [];
  const creditNotes = billing.credit_notes ?? [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/subscriptions"
            className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white shadow-xs hover:bg-cream transition-colors text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[26px] font-medium tracking-tight text-ink sm:text-[30px]">
                Hybrid Billing: {billing.order_reference} ({billing.customer_name})
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-600 mr-1.5" />
                Active Billing Ledger
              </span>
            </div>
            <p className="text-[12.5px] text-mist">
              Order ID: <strong>{billing.order_id}</strong> &middot; Track dual one-time and subscription cash schedules.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {invoices.length === 0 && (
            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateInvoice}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 shadow-xs transition-colors disabled:opacity-50"
            >
              <FileText className="size-3.5" />
              {generating ? "Generating..." : "Generate One-Time Invoice"}
            </button>
          )}

          {schedules.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedSchedule(schedules[0]);
                setProrationModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 shadow-xs transition-colors"
            >
              <Plus className="size-3.5" /> Modify Seats &amp; Prorate
            </button>
          )}
        </div>
      </div>

      <LifecycleBar currentStage="BILLING" quoteId={String(billing.order_id)} />

      {notice && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-700 shrink-0" />
          {notice}
        </div>
      )}

      {/* DUAL-TRACK ARCHITECTURE BANNER */}
      <div className="rounded-[20px] bg-white p-5 border border-ink/8 shadow-xs flex items-start gap-3">
        <Sparkles className="size-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-[13px] text-ink leading-relaxed">
          <p className="font-semibold">Dual-Track Billing Engine (One-Time + Recurring Schedules)</p>
          <p className="mt-0.5 text-mist">
            One-time hardware lines generate an immediate invoice, while subscription lines create an automated schedule across contract cycles with day-count proration on mid-cycle changes.
          </p>
        </div>
      </div>

      {/* TRACK 1: INVOICES (ONE-TIME & RECURRING CYCLES) */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-ink/6">
          <h2 className="text-[16px] font-semibold text-ink flex items-center gap-2">
            <FileText className="size-4 text-mist" />
            Track 1: Generated Invoices &amp; Payments
          </h2>
          <span className="text-[12px] font-mono text-mist font-medium">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-4 py-2.5">Invoice Ref</th>
                <th className="px-4 py-2.5">Kind</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Total Amount</th>
                <th className="px-4 py-2.5">Amount Paid</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-mono font-medium text-ink">
                    {inv.reference}
                  </td>
                  <td className="px-4 py-3 text-mist text-[12px]">
                    {inv.kind === "RECURRING_PERIOD" ? "Subscription Period" : "One-Time Lines"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} size="sm" />
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold tabular-nums text-ink">
                    {inr(inv.total)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-emerald-800">
                    {inr(inv.amount_paid)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href="/invoices"
                      className="text-[12px] font-semibold text-ink hover:underline"
                    >
                      View Invoice &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-mist">
                    No invoices generated yet. Click &quot;Generate One-Time Invoice&quot; to post billing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRACK 2: RECURRING BILLING SCHEDULES */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-ink/6">
          <h2 className="text-[16px] font-semibold text-ink flex items-center gap-2">
            <Calendar className="size-4 text-mist" />
            Track 2: Recurring Subscription Schedules
          </h2>
          <span className="text-[12px] font-mono text-mist font-medium">
            {schedules.length} scheduled periods
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-4 py-2.5">Cycle #</th>
                <th className="px-4 py-2.5">Plan / Product</th>
                <th className="px-4 py-2.5">Period Window</th>
                <th className="px-4 py-2.5">Proration Factor</th>
                <th className="px-4 py-2.5">Period Amount</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-mono font-medium text-ink">
                    #{s.seq}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {s.product_name}
                  </td>
                  <td className="px-4 py-3 text-mist text-[12px] whitespace-nowrap">
                    {new Date(s.period_start).toLocaleDateString()} &ndash;{" "}
                    {new Date(s.period_end).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]">
                    {s.proration_factor}x
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold tabular-nums text-ink">
                    {inr(s.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSchedule(s);
                        setProrationModalOpen(true);
                      }}
                      className="text-[12px] font-semibold text-ink hover:underline"
                    >
                      Prorate &rarr;
                    </button>
                  </td>
                </tr>
              ))}
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-mist">
                    No recurring subscription plans attached to this order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRACK 3: CREDIT NOTES */}
      {creditNotes.length > 0 && (
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
          <h2 className="text-[16px] font-semibold text-ink pb-3 border-b border-ink/6">
            Credit Notes &amp; Refunds
          </h2>
          <div className="mt-4 space-y-3">
            {creditNotes.map((cn) => (
              <div
                key={cn.id}
                className="flex items-center justify-between p-3.5 rounded-[16px] bg-cream/40 border border-ink/6 text-[13px]"
              >
                <div>
                  <span className="font-mono font-semibold text-ink">{cn.reference}</span>
                  <p className="text-[12px] text-mist">{cn.reason}</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-rose-800">{inr(cn.amount)}</span>
                  <p className="text-[11px] text-mist">{cn.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: PRORATION & SEAT MODIFICATION */}
      {prorationModalOpen && selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-xl border border-ink/10 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <div>
                <h3 className="font-semibold text-[16px] text-ink">
                  Mid-Cycle Subscription Change
                </h3>
                <p className="text-[12px] text-mist">
                  {selectedSchedule.product_name} &middot; Cycle #{selectedSchedule.seq}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProrationModalOpen(false)}
                className="size-7 rounded-full flex items-center justify-center text-mist hover:text-ink hover:bg-cream"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleApplyProration} className="mt-4 space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-ink mb-1">
                  Updated Seat / Unit Quantity
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={newQty}
                  onChange={(e) => setNewQty(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-ink/15 bg-cream/30 p-2.5 font-mono text-[14px] text-ink focus:outline-hidden focus:border-ink"
                />
                <p className="text-[11px] text-mist mt-1">
                  Day-count convention (30/360) will compute the exact prorated invoice or credit note.
                </p>
              </div>

              <div className="rounded-[16px] bg-cream/50 p-3 text-[12px] text-mist border border-ink/6 leading-relaxed">
                Upgrading adds an immediate prorated delta invoice; downgrading generates a credit note against future cycles.
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/6">
                <button
                  type="button"
                  onClick={() => setProrationModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[12.5px] font-medium text-mist hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changing}
                  className="rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-bone hover:bg-ink/90 transition-colors disabled:opacity-50"
                >
                  {changing ? "Calculating Proration..." : "Apply Modification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
