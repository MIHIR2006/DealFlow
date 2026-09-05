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
  FileText,
  AlertTriangle,
  History,
  Info,
} from "lucide-react";
import { LifecycleBar } from "@/components/workspace/lifecycle-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { ApprovalStepper } from "@/components/ui/approval-stepper";

export default function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const quoteId = resolvedParams.id || "Q-1042";

  // Decision note state
  const [note, setNote] = useState("");
  const [actionDone, setActionDone] = useState<string | null>(null);

  // Mocked state mirroring the exact spec §10 & Mockup Screen 6
  const [approvalState, setApprovalState] = useState({
    quoteRef: quoteId,
    customer: "Acme Corp",
    tier: "Gold",
    grandTotal: "₹4,82,000",
    blendedRiskScore: "5.6%",
    status: "Pending Finance", // After Manager approved step 1
    steps: [
      {
        id: 1,
        round: 1,
        step: 1,
        required_role: "MANAGER",
        status: "APPROVED" as const,
        actor_name: "M. Shah (Sales Manager)",
        reason: "Reviewed setup service discount. Margin maintained via warranty line.",
        decided_at: "Aug 21, 14:15",
        created_at: "Aug 20, 11:00",
      },
      {
        id: 2,
        round: 1,
        step: 2,
        required_role: "FINANCE",
        status: "PENDING" as const,
        reason: "",
        created_at: "Aug 21, 14:15",
      },
    ],
    audit: [
      {
        id: 1,
        actor: "J. Rao (Sales Rep)",
        action: "Submitted",
        date: "Aug 20, 11:00",
        note: "Initial 12% discount on hardware, 18% on service to win account against competitor.",
      },
      {
        id: 2,
        actor: "M. Shah (Sales Manager)",
        action: "Returned for Revision",
        date: "Aug 21, 09:30",
        note: "Service margin too thin at 18%. Either lower discount or attach high-margin recurring line.",
      },
      {
        id: 3,
        actor: "J. Rao (Sales Rep)",
        action: "Resubmitted",
        date: "Aug 21, 11:45",
        note: "Bundled 3-year enterprise warranty and 24/7 cloud support plan. Overall margin back at 21.4%.",
      },
      {
        id: 4,
        actor: "M. Shah (Sales Manager)",
        action: "Approved Step 1",
        date: "Aug 21, 14:15",
        note: "Tier 1 manager sign-off granted. Escalating to Finance due to 5.6% blended score.",
      },
    ],
    flaggedLines: [
      {
        id: "l1",
        name: "Laptop Pro 16\" (Hardware)",
        category: "Hardware",
        givenDiscount: "12.0%",
        limitAllowed: "15.0% (Gold Tier)",
        overage: "0.0 pt OK",
        isOver: false,
        value: "₹4,40,000",
      },
      {
        id: "l2",
        name: "Setup & Migration Service (Service)",
        category: "Service",
        givenDiscount: "18.0%",
        limitAllowed: "10.0% (Service Limit)",
        overage: "+8.0 pt OVER",
        isOver: true,
        value: "₹45,000",
      },
      {
        id: "l3",
        name: "Enterprise Cloud Support 24/7",
        category: "Subscription",
        givenDiscount: "5.0%",
        limitAllowed: "20.0% (Sub Limit)",
        overage: "0.0 pt OK",
        isOver: false,
        value: "₹25,000",
      },
    ],
  });

  function handleDecision(decision: "APPROVE" | "RETURN" | "REJECT") {
    if (decision === "APPROVE") {
      setApprovalState((prev) => ({
        ...prev,
        status: "Approved",
        steps: prev.steps.map((s) =>
          s.required_role === "FINANCE"
            ? { ...s, status: "APPROVED", decided_at: "Just now", actor_name: "P. Nair (Finance)" }
            : s
        ),
        audit: [
          ...prev.audit,
          {
            id: prev.audit.length + 1,
            actor: "P. Nair (Finance Reviewer)",
            action: "Approved Step 2 (Final)",
            date: "Just now",
            note: note || "Final commercial risk sign-off granted. Ready for fulfillment.",
          },
        ],
      }));
      setActionDone("Quotation fully approved! Order ready to split across warehouses.");
    } else if (decision === "RETURN") {
      setApprovalState((prev) => ({
        ...prev,
        status: "Draft",
        audit: [
          ...prev.audit,
          {
            id: prev.audit.length + 1,
            actor: "Reviewer",
            action: "Returned for Revision",
            date: "Just now",
            note: note || "Returned to rep with revision instructions.",
          },
        ],
      }));
      setActionDone("Quotation returned to Draft status. Rep notified with revision note.");
    } else {
      setApprovalState((prev) => ({
        ...prev,
        status: "Rejected",
        audit: [
          ...prev.audit,
          {
            id: prev.audit.length + 1,
            actor: "Reviewer",
            action: "Rejected",
            date: "Just now",
            note: note || "Commercial terms unacceptable under current margin threshold.",
          },
        ],
      }));
      setActionDone("Quotation permanently rejected.");
    }
  }

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
                Approval Detail: {approvalState.quoteRef} ({approvalState.customer})
              </h1>
            </div>
            <p className="text-[12.5px] text-mist">
              Order Value:{" "}
              <strong className="font-mono text-ink">
                {approvalState.grandTotal}
              </strong>{" "}
              &middot; Customer Tier: <strong>Gold (15% Max)</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RiskBadge score={approvalState.blendedRiskScore} requiredLevel="FINANCE" size="md" />
          <StatusBadge status={approvalState.status} size="md" />
        </div>
      </div>

      <LifecycleBar currentStage="APPROVAL" quoteId={quoteId} />

      {actionDone && (
        <div className="rounded-[18px] bg-emerald-500/10 p-4 border border-emerald-500/20 text-[13px] text-emerald-950 font-medium flex items-center justify-between">
          <span>{actionDone}</span>
          <Link
            href={`/fulfillment/${quoteId}`}
            className="rounded-full bg-emerald-700 text-white px-3 py-1 text-[12px] font-semibold hover:bg-emerald-800 transition-colors"
          >
            Go to Fulfillment &rarr;
          </Link>
        </div>
      )}

      {/* SECTION 1: "WHY THIS QUOTE WAS FLAGGED" TABLE (Exact Mockup Screen 6) */}
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
            Rule Version: v2026.08 (Active)
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
              {approvalState.flaggedLines.map((line) => (
                <tr
                  key={line.id}
                  className={line.isOver ? "bg-amber-500/[0.04]" : "hover:bg-cream/40"}
                >
                  <td className="px-5 py-3.5 font-medium text-ink">
                    {line.name}
                  </td>
                  <td className="px-5 py-3.5 text-mist text-[12.5px]">
                    {line.category}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-semibold tabular-nums text-ink">
                    {line.givenDiscount}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-mist text-[12.5px]">
                    {line.limitAllowed}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[12px] font-semibold ${
                        line.isOver
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {line.overage}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-mist">
                    {line.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Yellow Callout Explaining the Blended Rationale */}
        <div className="mt-5 rounded-[18px] bg-amber-500/10 p-4 border border-amber-500/25 flex items-start gap-3">
          <Info className="size-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="text-[12.5px] leading-relaxed text-amber-950">
            <strong className="font-semibold block mb-0.5">
              Blended Risk Calculation Rationale (Score: 5.6%):
            </strong>
            Even though the customer holds <strong>Gold Tier</strong> status (normally granting up to 15% discretion), the Service line exceeded its stricter category ceiling (18% given vs 10% allowed, <strong>+8 percentage points over limit</strong>). Because the blended risk score of 5.6% crosses the 5.0% policy threshold, this deal cannot be approved by Sales Manager alone and requires mandatory Finance sign-off.
          </div>
        </div>
      </div>

      {/* SECTION 2: VISUAL WORKFLOW STEPPER */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <h2 className="text-[15px] font-semibold text-ink mb-2">
          Approval Chain Progression
        </h2>
        <ApprovalStepper
          steps={approvalState.steps as any}
          currentStatus={approvalState.status}
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
            {approvalState.audit.length} immutable events
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
              {approvalState.audit.map((entry) => (
                <tr key={entry.id} className="hover:bg-cream/30">
                  <td className="px-4 py-3 font-medium text-ink">
                    {entry.actor}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        entry.action.includes("Approved")
                          ? "bg-emerald-100 text-emerald-800"
                          : entry.action.includes("Returned")
                          ? "bg-orange-100 text-orange-800"
                          : entry.action.includes("Submitted")
                          ? "bg-ink/5 text-ink"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-mist text-[12px] whitespace-nowrap">
                    {entry.date}
                  </td>
                  <td className="px-4 py-3 text-ink/80 text-[12.5px] max-w-[420px]">
                    {entry.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: REVIEWER DECISION PANEL (3 Action Buttons) */}
      <div className="rounded-[24px] bg-white p-6 border border-ink/8 shadow-xs">
        <h2 className="text-[15px] font-semibold text-ink">
          Reviewer Decision
        </h2>
        <p className="text-[12.5px] text-mist mt-0.5">
          Record justification or return conditions for the sales rep.
        </p>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter authorization notes, required revision clauses, or commercial rejection reasoning..."
          rows={3}
          className="mt-3 w-full rounded-[16px] border border-ink/12 bg-cream/30 p-3.5 text-[13px] placeholder:text-mist focus:outline-hidden focus:border-ink/30"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-ink/6">
          <div className="text-[12px] text-mist">
            Logged with: <strong>P. Nair (Finance &amp; Operations)</strong>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Return for Revision */}
            <button
              type="button"
              onClick={() => handleDecision("RETURN")}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-4 py-2 text-[13px] font-medium text-amber-900 hover:bg-amber-500/25 transition-colors"
            >
              <RotateCcw className="size-3.5" />
              Return for Revision
            </button>

            {/* Reject */}
            <button
              type="button"
              onClick={() => handleDecision("REJECT")}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 px-4 py-2 text-[13px] font-medium text-rose-900 hover:bg-rose-500/25 transition-colors"
            >
              <X className="size-3.5" />
              Reject
            </button>

            {/* Approve */}
            <button
              type="button"
              onClick={() => handleDecision("APPROVE")}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-5 py-2 text-[13px] font-medium text-white hover:bg-emerald-800 shadow-xs transition-colors"
            >
              <Check className="size-3.5 stroke-[2.5]" />
              Approve Step 2 &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
