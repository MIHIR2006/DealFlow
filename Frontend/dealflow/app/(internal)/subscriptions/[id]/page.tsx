"use client";

import React, { useState, use } from "react";
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
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";

export default function SubscriptionBillingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const subId = resolvedParams.id || "SUB-8021";

  // Subscription state
  const [seats, setSeats] = useState(2);
  const [unitRate] = useState(25000); // ₹25,000 per seat/month
  const [prorationModalOpen, setProrationModalOpen] = useState(false);
  const [targetSeats, setTargetSeats] = useState(4);
  const [creditNoteGenerated, setCreditNoteGenerated] = useState(false);
  const [modificationApplied, setModificationApplied] = useState(false);

  // 30-day cycle simulation: 18 days elapsed, 12 days remaining
  const daysInPeriod = 30;
  const daysRemaining = 12;
  const prorationFactor = daysRemaining / daysInPeriod; // 0.40

  const deltaSeats = targetSeats - seats;
  const proratedCharge = deltaSeats * unitRate * prorationFactor;
  const nextCycleTotal = targetSeats * unitRate;

  function applyProration() {
    setSeats(targetSeats);
    setProrationModalOpen(false);
    setModificationApplied(true);
  }

  function handleCancelOrDowngrade() {
    setCreditNoteGenerated(true);
  }

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
                Hybrid Billing: {subId} (Acme Corp)
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-600 mr-1.5" />
                Active Subscription
              </span>
            </div>
            <p className="text-[12.5px] text-mist">
              Associated Order: <strong>SO-9042</strong> &middot; Plan:{" "}
              <strong>Enterprise Cloud Support 24/7 (Monthly)</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setTargetSeats(seats + 2);
              setProrationModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bone hover:bg-ink/90 shadow-xs transition-colors"
          >
            <Plus className="size-3.5" /> Modify Seats &amp; Prorate
          </button>
        </div>
      </div>

      <LifecycleBar currentStage="BILLING" />

      {modificationApplied && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center justify-between">
          <span>
            Mid-cycle modification applied! {seats} active seats. Prorated delta of &#8377;{proratedCharge.toLocaleString("en-IN")} added to next scheduled invoice.
          </span>
          <span className="text-[11px] font-mono text-emerald-800">
            Day-count proration factor: {prorationFactor.toFixed(2)}
          </span>
        </div>
      )}

      {creditNoteGenerated && (
        <div className="rounded-[18px] bg-amber-500/10 p-4 border border-amber-500/25 text-[13px] text-amber-950 font-medium flex items-center justify-between">
          <span>
            Formal Credit Note Issued: <strong>CN-2026-001</strong> for unearned revenue refund: <strong>&#8377;10,000</strong>.
          </span>
          <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
            Credit Note Recorded
          </span>
        </div>
      )}

      {/* TWO SEPARATE TRACKS: ONE-TIME VS RECURRING */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* TRACK 1: ONE-TIME INVOICE (4 cols) */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                <FileText className="size-4 text-ink/70" />
                Track 1: One-Time Invoice
              </span>
              <StatusBadge status="PAID" size="sm" />
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[16px] bg-cream/40 p-3.5 border border-ink/6">
                <p className="font-mono text-[11px] text-mist">
                  Invoice Ref: INV-9042-OT
                </p>
                <p className="font-serif text-[22px] font-semibold text-ink mt-1 tabular-nums">
                  &#8377;4,85,000
                </p>
                <p className="text-[12px] text-mist mt-0.5">
                  Hardware (Laptops) + Setup &amp; Migration Service
                </p>
              </div>

              <div className="text-[12.5px] space-y-1.5 text-mist pt-1">
                <div className="flex justify-between">
                  <span>Billing Date:</span>
                  <span className="text-ink font-medium">Aug 22, 2026</span>
                </div>
                <div className="flex justify-between">
                  <span>Settlement:</span>
                  <span className="text-emerald-800 font-semibold">100% Paid (NEFT)</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipment Split:</span>
                  <span className="text-ink font-medium">Main Depot + East Depot</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink/6">
            <Link
              href="/invoices/INV-9042-OT"
              className="inline-flex w-full items-center justify-center rounded-full border border-ink/10 py-2 text-[12.5px] font-medium text-ink hover:bg-cream transition-colors"
            >
              View Full One-Time Invoice &rarr;
            </Link>
          </div>
        </div>

        {/* TRACK 2: RECURRING SUBSCRIPTION SCHEDULE (8 cols) */}
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs lg:col-span-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink/6">
              <div>
                <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                  <Repeat className="size-4 text-purple-700" />
                  Track 2: Recurring Subscription Timeline
                </span>
                <p className="text-[12px] text-mist mt-0.5">
                  Monthly billing cadence with automated proration logic
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] uppercase font-semibold text-mist">
                  Current MRR
                </span>
                <p className="font-mono text-[18px] font-semibold text-emerald-800 tabular-nums">
                  &#8377;{(seats * unitRate).toLocaleString("en-IN")}/mo
                </p>
              </div>
            </div>

            {/* 12-Month Schedule Timeline */}
            <div className="mt-5">
              <h3 className="text-[13px] font-semibold text-ink mb-3">
                Upcoming 12-Month Billing Schedule
              </h3>

              <div className="space-y-2.5">
                {[
                  {
                    period: "Period 1",
                    date: "Aug 22, 2026",
                    amt: "₹50,000",
                    status: "PAID",
                    inv: "INV-SUB-1",
                  },
                  {
                    period: "Period 2",
                    date: "Sep 22, 2026",
                    amt: `₹${(seats * unitRate).toLocaleString("en-IN")}`,
                    status: "SCHEDULED",
                    inv: "Scheduled",
                  },
                  {
                    period: "Period 3",
                    date: "Oct 22, 2026",
                    amt: `₹${(seats * unitRate).toLocaleString("en-IN")}`,
                    status: "SCHEDULED",
                    inv: "Scheduled",
                  },
                  {
                    period: "Period 4",
                    date: "Nov 22, 2026",
                    amt: `₹${(seats * unitRate).toLocaleString("en-IN")}`,
                    status: "SCHEDULED",
                    inv: "Scheduled",
                  },
                ].map((item, idx) => (
                  <div
                    key={item.period}
                    className="flex items-center justify-between p-3 rounded-[16px] bg-cream/30 border border-ink/6 text-[12.5px]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="size-6 flex items-center justify-center rounded-full bg-white font-mono text-[11px] font-semibold text-ink shadow-2xs">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="font-medium text-ink">{item.period}</span>
                        <span className="text-mist ml-2 text-[11.5px]">
                          Due: {item.date}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {item.amt}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          item.status === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-ink/5 text-mist"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Downgrade & Cancel Controls */}
          <div className="mt-6 pt-4 border-t border-ink/6 flex items-center justify-between">
            <button
              type="button"
              onClick={handleCancelOrDowngrade}
              className="text-[12px] font-medium text-rose-700 hover:text-rose-900 transition-colors"
            >
              Cancel Subscription / Issue Partial Credit Note
            </button>
            <span className="text-[11.5px] text-mist font-mono">
              Day-count method: Actual/30
            </span>
          </div>
        </div>
      </div>

      {/* Mid-Cycle Proration Simulator Modal */}
      {prorationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl border border-ink/10">
            <div className="flex items-center justify-between pb-3 border-b border-ink/6">
              <h3 className="text-[17px] font-semibold text-ink">
                Mid-Cycle Day-Count Proration
              </h3>
              <button
                type="button"
                onClick={() => setProrationModalOpen(false)}
                className="text-mist hover:text-ink text-[13px]"
              >
                &times;
              </button>
            </div>

            <p className="text-[12.5px] text-mist mt-2 leading-relaxed">
              Adjust seat count mid-cycle. The billing engine calculates the exact pro-rata fee for the remaining days of the current 30-day period.
            </p>

            <div className="mt-4 space-y-4">
              {/* Seat Stepper */}
              <div>
                <label className="text-[12px] font-semibold text-ink block mb-1">
                  Adjust Subscription Seats
                </label>
                <div className="flex items-center justify-between rounded-xl border border-ink/15 p-2 bg-cream/40">
                  <span className="text-[13px] font-medium text-ink">
                    Seats: {targetSeats}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetSeats(Math.max(1, targetSeats - 1))}
                      className="size-7 flex items-center justify-center rounded-lg bg-white border border-ink/10 text-ink hover:bg-cream"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetSeats(targetSeats + 1)}
                      className="size-7 flex items-center justify-center rounded-lg bg-white border border-ink/10 text-ink hover:bg-cream"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Exact Formula Breakdown Box */}
              <div className="rounded-xl bg-purple-50 p-3.5 border border-purple-200 text-[12px] space-y-1.5 text-purple-950">
                <p className="font-semibold flex items-center gap-1.5 text-purple-900">
                  <Sparkles className="size-3.5" /> Proration Mathematical Formula:
                </p>
                <div className="font-mono text-[11.5px] space-y-1 pt-1">
                  <p>Days Elapsed: 18 / 30 &middot; Days Remaining: 12 / 30</p>
                  <p>Proration Factor: 12 &divide; 30 = 0.40</p>
                  <p className="text-purple-900 font-bold">
                    Adjustment: {deltaSeats} additional seats &times; &#8377;25,000 &times; 0.40 = +&#8377;{proratedCharge.toLocaleString("en-IN")}
                  </p>
                  <p className="pt-1 border-t border-purple-200/60">
                    Next Full Month: &#8377;{nextCycleTotal.toLocaleString("en-IN")}/mo
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-ink/8">
              <button
                type="button"
                onClick={() => setProrationModalOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-mist hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyProration}
                className="rounded-full bg-ink text-bone px-5 py-2 text-[13px] font-semibold hover:bg-ink/90"
              >
                Confirm &amp; Apply Proration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
