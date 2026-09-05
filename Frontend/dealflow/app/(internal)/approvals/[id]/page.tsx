"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useFetch, useMutation, inr, timeAgo } from "@/lib/hooks";
import type { Quotation } from "@/lib/types";

export default function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const quoteId = resolvedParams.id;
  const router = useRouter();

  const { data: quoteRes, loading, error, refetch } = useFetch<{ data: Quotation }>(
    `/v1/quotations/${quoteId}`
  );
  const quote = quoteRes?.data;

  const { trigger: decide, loading: deciding, error: decisionError } = useMutation();

  const [note, setNote] = useState("");
  const [actionDone, setActionDone] = useState<string | null>(null);

  const pendingStep = quote?.approvals?.find((s) => s.status === "PENDING");
  const isPending = quote?.status === "PENDING_APPROVAL" && !!pendingStep;

  async function handleDecision(action: "approve" | "return" | "reject") {
    if (!pendingStep) return;
    try {
      await decide(`/v1/approvals/${pendingStep.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: note.trim() }),
      });
      if (action === "approve") {
        setActionDone(
          pendingStep.required_role === "FINANCE" || (quote?.approvals?.filter((s) => s.status === "PENDING").length ?? 0) <= 1
            ? "Quotation fully approved! Order ready to confirm and fulfill."
            : "Approval step recorded. Moving to subsequent review in chain."
        );
      } else if (action === "return") {
        setActionDone("Quotation returned to Draft status. Rep notified with revision note.");
      } else {
        setActionDone("Quotation permanently rejected.");
      }
      setNote("");
      refetch();
    } catch (e) {
      // Error captured by useMutation
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="space-y-4">
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to Approvals
        </Link>
        <div className="rounded-[20px] bg-rose-50 border border-rose-200 p-6 text-center">
          <p className="font-semibold text-rose-900">Failed to load quotation review</p>
          <p className="text-[13px] text-rose-700 mt-1">{error?.message ?? "Quotation not found"}</p>
        </div>
      </div>
    );
  }

  const breakdown = quote.risk?.breakdown ?? [];
  const approvals = quote.approvals ?? [];
  const audit = quote.audit ?? [];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/approvals"
            className="flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white shadow-xs hover:bg-cream transition-colors text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-[26px] font-medium tracking-tight text-ink sm:text-[30px]">
                Approval Detail: {quote.reference} ({quote.customer_name})
              </h1>
            </div>
            <p className="text-[12.5px] text-mist">
              Order Value:{" "}
              <strong className="font-mono text-ink">
                {inr(quote.totals?.grand_total ?? "0")}
              </strong>{" "}
              &middot; Customer Tier: <strong>{quote.customer_tier}</strong> &middot; Rep: <strong>{quote.rep_name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RiskBadge
            score={quote.risk?.blended_score ?? "0"}
            requiredLevel={quote.risk?.required_level}
            size="md"
          />
          <StatusBadge status={quote.status} size="md" />
        </div>
      </div>

      <LifecycleBar currentStage="APPROVAL" quoteId={String(quote.id)} />

      {actionDone && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center justify-between">
          <span>{actionDone}</span>
          {quote.status === "APPROVED" && (
            <Link
              href={`/quotations/${quote.id}`}
              className="rounded-full bg-emerald-700 text-white px-3.5 py-1 text-[12px] font-semibold hover:bg-emerald-800 transition-colors"
            >
              View Quotation &rarr;
            </Link>
          )}
        </div>
      )}

      {decisionError && (
        <div className="rounded-[18px] bg-rose-500/10 p-4 border border-rose-500/20 text-[13px] text-rose-950 font-medium">
          Error executing approval action: {decisionError.message}
        </div>
      )}

      {/* SECTION 1: "WHY THIS QUOTE WAS FLAGGED" TABLE */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-ink/6">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-ink flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-700" />
              Why This Quote Was Flagged
            </h2>
            <p className="text-[12.5px] text-mist">
              Line-by-line breakdown comparing applied discounts against category and customer tier discretion.
            </p>
          </div>
          <span className="text-[11.5px] font-mono text-mist font-medium">
            Rule Version: v{quote.risk?.config_version ?? "1"} (Active)
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-5 py-3">Line Item</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Discount Given</th>
                <th className="px-5 py-3">Limit Allowed</th>
                <th className="px-5 py-3">Overage</th>
                <th className="px-5 py-3 text-right">Line Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-mist text-[13px]">
                    No line-level discount exceptions detected.
                  </td>
                </tr>
              ) : (
                breakdown.map((line) => (
                  <tr
                    key={line.line_id}
                    className={line.is_over ? "bg-amber-500/[0.04]" : "hover:bg-cream/40"}
                  >
                    <td className="px-5 py-3.5 font-medium text-ink">
                      {line.product_name}
                    </td>
                    <td className="px-5 py-3.5 text-mist text-[12.5px]">
                      {line.category_name}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-semibold tabular-nums text-ink">
                      {line.given_pct}%
                    </td>
                    <td className="px-5 py-3.5 font-mono text-mist text-[12.5px]">
                      {line.allowed_pct}%
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[12px] font-semibold ${
                          line.is_over
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {line.is_over ? `+${line.overage_pts} pt OVER` : "0.0 pt OK"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-mist">
                      {inr(line.list_value)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Yellow Callout Explaining the Blended Rationale */}
        {quote.risk?.rationale && (
          <div className="mt-5 rounded-[18px] bg-amber-500/10 p-4 border border-amber-500/25 flex items-start gap-3">
            <Info className="size-5 text-amber-800 shrink-0 mt-0.5" />
            <div className="text-[12.5px] leading-relaxed text-amber-950">
              <strong className="font-semibold block mb-0.5">
                Blended Risk Calculation Rationale (Score: {quote.risk.blended_score}%):
              </strong>
              {quote.risk.rationale}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: VISUAL WORKFLOW STEPPER */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <h2 className="text-[15px] font-semibold text-ink mb-2">
          Approval Chain Progression
        </h2>
        <ApprovalStepper
          steps={approvals}
          currentStatus={quote.status}
        />
      </div>

      {/* SECTION 3: AUDIT TRAIL TABLE */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-ink/6">
          <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <History className="size-4 text-mist" />
            Audit Trail &amp; Negotiation History
          </h2>
          <span className="text-[11.5px] text-mist font-mono">
            {audit.length} immutable events
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold uppercase tracking-wider text-mist bg-ink/[0.02] border-b border-ink/6">
              <tr>
                <th className="px-4 py-2.5">Reviewer / User</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Reason &amp; Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {audit.map((entry) => (
                <tr key={entry.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium text-ink">
                    {entry.actor_label}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        entry.action.includes("Approved") || entry.action === "APPROVED"
                          ? "bg-emerald-100 text-emerald-800"
                          : entry.action.includes("Returned") || entry.action === "RETURNED"
                          ? "bg-orange-100 text-orange-800"
                          : entry.action.includes("Submitted") || entry.action === "SUBMITTED"
                          ? "bg-ink/5 text-ink"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-mist text-[12px] whitespace-nowrap">
                    {timeAgo(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 text-ink/80 text-[12.5px] max-w-[420px]">
                    {entry.note || "—"}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-mist">
                    No audit records logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: REVIEWER DECISION PANEL */}
      {isPending ? (
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">
                Reviewer Decision ({pendingStep?.required_role} Step {pendingStep?.step})
              </h2>
              <p className="text-[12.5px] text-mist mt-0.5">
                Record justification or return conditions for the sales rep.
              </p>
            </div>
            <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
              Action Required: {pendingStep?.required_role}
            </span>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={deciding}
            placeholder="Enter authorization notes, required revision clauses, or commercial rejection reasoning..."
            rows={3}
            className="mt-3 w-full rounded-[16px] border border-ink/12 bg-cream/30 p-3.5 text-[13px] placeholder:text-mist focus:outline-hidden focus:border-ink/30 disabled:opacity-50"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-ink/6">
            <div className="text-[12px] text-mist">
              Acting on approval round #{pendingStep?.round} &middot; step #{pendingStep?.step}
            </div>

            <div className="flex items-center gap-2.5">
              {/* Return for Revision */}
              <button
                type="button"
                disabled={deciding}
                onClick={() => handleDecision("return")}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-4 py-2 text-[13px] font-medium text-amber-900 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" />
                Return for Revision
              </button>

              {/* Reject */}
              <button
                type="button"
                disabled={deciding}
                onClick={() => handleDecision("reject")}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 px-4 py-2 text-[13px] font-medium text-rose-900 hover:bg-rose-500/25 transition-colors disabled:opacity-50"
              >
                <X className="size-3.5" />
                Reject
              </button>

              {/* Approve */}
              <button
                type="button"
                disabled={deciding}
                onClick={() => handleDecision("approve")}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-5 py-2 text-[13px] font-medium text-white hover:bg-emerald-800 shadow-xs transition-colors disabled:opacity-50"
              >
                <Check className="size-3.5 stroke-[2.5]" />
                {deciding ? "Submitting..." : `Approve (${pendingStep?.required_role})`}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold text-ink">
              Quotation Status: {quote.status}
            </p>
            <p className="text-[12.5px] text-mist mt-0.5">
              {quote.status === "APPROVED"
                ? "All required approvals have been granted. Deal is cleared for order confirmation."
                : quote.status === "DRAFT"
                ? "This deal is currently in draft and not awaiting approval."
                : "No pending authorization actions currently required for this quotation."}
            </p>
          </div>
          <Link
            href={`/quotations/${quote.id}`}
            className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-bone hover:bg-ink/90 transition-colors"
          >
            Open in Builder &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
