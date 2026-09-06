"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
  Check,
  RotateCcw,
  X,
  History,
  Info,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { ApprovalStepper } from "@/components/ui/approval-stepper";
import { QuotationApi, ApprovalApi, ApiError } from "@/lib/api";
import { inr } from "@/lib/hooks";
import type { Quotation } from "@/lib/types";

export default function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = use(params);
  const quotationId = Number(idParam);

  const [quote, setQuote] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [actionDone, setActionDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = await QuotationApi.get(quotationId);
      setQuote(q);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this quotation.");
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    load();
  }, [load]);

  // The step at the head of the queue is the only one anyone can act on —
  // approving/returning/rejecting anything else is rejected server-side too.
  const pendingStep = quote?.approvals?.find((s) => s.status === "PENDING");

  async function decide(action: "approve" | "return" | "reject") {
    if (!pendingStep) return;
    if ((action === "return" || action === "reject") && !note.trim()) {
      setError("A reason is required to return or reject a step.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fn =
        action === "approve"
          ? ApprovalApi.approve(pendingStep.id, note || undefined)
          : action === "return"
            ? ApprovalApi.returnForRevision(pendingStep.id, note)
            : ApprovalApi.reject(pendingStep.id, note);
      const updated = await fn;
      setQuote(updated);
      setNote("");
      if (action === "approve") {
        setActionDone(
          updated.status === "APPROVED"
            ? "Quotation fully approved. Order is ready to move to fulfillment."
            : "Step approved. Escalated to the next reviewer.",
        );
      } else if (action === "return") {
        setActionDone("Quotation returned to Draft. The rep has been notified to revise it.");
      } else {
        setActionDone("Quotation rejected.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record that decision.");
    } finally {
      setBusy(false);
    }
  }

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
        <Link href="/approvals" className="mt-3 inline-block text-[13px] text-ink underline">
          Back to approvals
        </Link>
      </div>
    );
  }

  const risk = quote.risk;
  const blended = parseFloat(risk.blended_score) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:items-center">
          <Link
            href="/approvals"
            className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-cream transition-colors text-ink sm:mt-0"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-serif text-[22px] font-medium tracking-tight text-ink sm:text-[30px]">
              Approval Detail: {quote.reference} ({quote.customer_name})
            </h1>
            <p className="text-[12.5px] text-mist">
              Order value: <strong className="text-ink">{inr(quote.totals.grand_total)}</strong>
              &middot; Customer tier: <strong>{quote.customer_tier}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge score={blended} requiredLevel={risk.required_level} size="md" />
          <StatusBadge status={quote.status} size="md" />
        </div>
      </div>

      <LifecycleBar currentStage="APPROVAL" />

      {error ? (
        <div className="rounded-[18px] tone-bad p-4 text-[13px] text-bad">{error}</div>
      ) : null}

      {actionDone ? (
        <div className="rounded-[18px] tone-ok p-4 text-[13px] font-medium flex flex-wrap items-center justify-between gap-3">
          <span>{actionDone}</span>
          {quote.status === "APPROVED" ? (
            <Link
              href={`/quotations/${quote.id}`}
              className="rounded-full fill-ok text-white px-3 py-1 text-[12px] font-semibold"
            >
              Open quotation &rarr;
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* "Why This Quote Was Flagged" — the mockup's core artifact */}
      <div className="rounded-[24px] bg-white p-5 card-shadow sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink/6">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-ink flex items-center gap-2">
              <ShieldAlert className="size-4 text-warn" />
              Why This Quote Was Flagged
            </h2>
            <p className="text-[12.5px] text-mist">
              Line-by-line breakdown comparing applied discounts against category and tier discretion.
            </p>
          </div>
          <span className="text-[11.5px] text-mist font-medium">
            Config v{risk.config_version}
          </span>
        </div>

        <div className="mt-4 md:overflow-x-auto">
          <table className="stack-table w-full text-left text-[13.5px]">
            <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
              <tr>
                <th className="px-5 py-3">Line</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Discount Given</th>
                <th className="px-5 py-3">Limit Allowed</th>
                <th className="px-5 py-3">Over By</th>
                <th className="px-5 py-3 text-right">Line Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {risk.breakdown.map((line) => (
                <tr key={line.line_id} className={line.is_over ? "bg-amber-500/5" : "hover:bg-cream/40"}>
                  <td data-stack="primary" className="px-5 py-3.5 font-medium text-ink">
                    {line.product_name}
                  </td>
                  <td data-label="Category" className="px-5 py-3.5 text-mist text-[12.5px]">
                    {line.category_name}
                  </td>
                  <td data-label="Discount given" className="px-5 py-3.5 font-semibold tabular-nums text-ink">
                    {line.given_pct}%
                  </td>
                  <td data-label="Limit allowed" className="px-5 py-3.5 text-mist text-[12.5px]">
                    {line.allowed_pct}%
                  </td>
                  <td data-label="Over by" className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold ${
                        line.is_over ? "tone-bad text-bad" : "tone-ok text-ok"
                      }`}
                    >
                      {line.is_over ? `+${line.overage_pts} pt OVER` : "0 pt OK"}
                    </span>
                  </td>
                  <td data-label="Line value" className="px-5 py-3.5 text-right tabular-nums text-mist">
                    {inr(line.list_value)}
                  </td>
                </tr>
              ))}
              {risk.breakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-mist">
                    No lines exceed their discount ceiling.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-[18px] tone-warn p-4 flex items-start gap-3">
          <Info className="size-5 text-warn shrink-0 mt-0.5" />
          <div className="text-[12.5px] leading-relaxed text-warn">
            <strong className="font-semibold block mb-0.5">
              Blended risk rationale (score: {risk.blended_score}%):
            </strong>
            {risk.rationale}
          </div>
        </div>
      </div>

      <div className="rounded-[24px] bg-white p-5 card-shadow sm:p-6">
        <h2 className="text-[15px] font-semibold text-ink mb-2">Approval chain progression</h2>
        <ApprovalStepper steps={quote.approvals ?? []} currentStatus={quote.status} />
      </div>

      <div className="rounded-[24px] bg-white p-5 card-shadow sm:p-6">
        <div className="flex items-center justify-between pb-3 border-b border-ink/6">
          <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <History className="size-4 text-mist" />
            Audit trail
          </h2>
          <span className="text-[11.5px] text-mist">{quote.audit?.length ?? 0} events</span>
        </div>

        <div className="mt-4 md:overflow-x-auto">
          <table className="stack-table w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
              <tr>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {(quote.audit ?? []).map((entry) => (
                <tr key={entry.id} className="hover:bg-cream/30">
                  <td data-stack="primary" className="px-4 py-3 font-medium text-ink">
                    {entry.actor_label}
                  </td>
                  <td data-label="Action" className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        entry.action.includes("APPROVED")
                          ? "tone-ok text-ok"
                          : entry.action.includes("RETURN")
                            ? "tone-warn text-warn"
                            : entry.action.includes("SUBMIT")
                              ? "bg-ink/5 text-ink"
                              : entry.action.includes("REJECT")
                                ? "tone-bad text-bad"
                                : "bg-ink/5 text-ink"
                      }`}
                    >
                      {entry.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td data-label="Date" className="px-4 py-3 text-mist text-[12px] md:whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td data-label="Note" className="px-4 py-3 text-ink/80 text-[12.5px] md:max-w-[420px]">
                    {entry.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pendingStep ? (
        <div className="rounded-[24px] bg-white p-5 card-shadow sm:p-6">
          <h2 className="text-[15px] font-semibold text-ink">
            Reviewer decision &middot; {pendingStep.required_role} step
          </h2>
          <p className="text-[12.5px] text-mist mt-0.5">
            Record justification or return conditions for the sales rep. A reason is required to
            return or reject.
          </p>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Enter authorization notes, required revision clauses, or rejection reasoning..."
            rows={3}
            disabled={busy}
            className="mt-3 w-full rounded-[16px] border border-ink/12 bg-cream/30 p-3.5 text-[13px] placeholder:text-mist focus:outline-hidden focus:border-ink/30"
          />

          <div className="mt-4 grid grid-cols-1 gap-2.5 pt-3 border-t border-ink/6 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => decide("return")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full tone-warn px-4 py-2.5 text-[13px] font-medium text-warn transition-colors disabled:opacity-50 sm:py-2"
            >
              <RotateCcw className="size-3.5" />
              Return for Revision
            </button>
            <button
              type="button"
              onClick={() => decide("reject")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full tone-bad px-4 py-2.5 text-[13px] font-medium text-bad transition-colors disabled:opacity-50 sm:py-2"
            >
              <X className="size-3.5" />
              Reject
            </button>
            <button
              type="button"
              onClick={() => decide("approve")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full fill-ok px-5 py-2.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50 sm:py-2"
            >
              <Check className="size-3.5 stroke-[2.5]" />
              Approve
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] bg-white p-5 card-shadow text-[13px] text-mist sm:p-6">
          No step is currently awaiting a decision on this quotation.
        </div>
      )}
    </div>
  );
}
