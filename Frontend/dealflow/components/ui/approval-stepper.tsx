"use client";

import React from "react";
import { Check, Clock, RotateCcw, X } from "lucide-react";
import { ApprovalStep } from "@/lib/types";

interface ApprovalStepperProps {
  steps?: ApprovalStep[];
  currentStatus: string;
  className?: string;
}

export function ApprovalStepper({
  steps = [],
  currentStatus,
  className = "",
}: ApprovalStepperProps) {
  // Determine display nodes based on approval chain
  // Default sequence: Submitted -> Sales Manager -> Finance -> Confirmed
  const isFinanceRequired = steps.some((s) => s.required_role === "FINANCE");

  type NodeDef = {
    id: string;
    label: string;
    subtext?: string;
    status: "done" | "active" | "pending" | "returned" | "rejected";
  };

  const nodes: NodeDef[] = [
    {
      id: "submit",
      label: "Submitted",
      subtext: "Sales Rep",
      status: "done",
    },
    {
      id: "manager",
      label: "Sales Manager",
      subtext: "Tier 1 Approval",
      status: "pending",
    },
  ];

  if (isFinanceRequired) {
    nodes.push({
      id: "finance",
      label: "Finance Review",
      subtext: "High Risk Ceiling",
      status: "pending",
    });
  }

  nodes.push({
    id: "confirmed",
    label: "Confirmed",
    subtext: "Ready to Fulfill",
    status: "pending",
  });

  // Map backend steps into nodes
  const mgrStep = steps.find((s) => s.required_role === "MANAGER" || s.step === 1);
  const finStep = steps.find((s) => s.required_role === "FINANCE" || s.step === 2);

  if (mgrStep) {
    const mgrNode = nodes.find((n) => n.id === "manager");
    if (mgrNode) {
      if (mgrStep.status === "APPROVED") mgrNode.status = "done";
      else if (mgrStep.status === "REJECTED") mgrNode.status = "rejected";
      else if (mgrStep.status === "RETURNED") mgrNode.status = "returned";
      else if (mgrStep.status === "PENDING") mgrNode.status = "active";
    }
  }

  if (finStep) {
    const finNode = nodes.find((n) => n.id === "finance");
    if (finNode) {
      if (finStep.status === "APPROVED") finNode.status = "done";
      else if (finStep.status === "REJECTED") finNode.status = "rejected";
      else if (finStep.status === "RETURNED") finNode.status = "returned";
      else if (finStep.status === "PENDING" && mgrStep?.status === "APPROVED") finNode.status = "active";
    }
  }

  if (currentStatus === "CONFIRMED" || currentStatus === "APPROVED") {
    const confNode = nodes.find((n) => n.id === "confirmed");
    if (confNode) confNode.status = currentStatus === "CONFIRMED" ? "done" : "active";
  }

  return (
    <div className={`w-full py-4 ${className}`}>
      <div className="relative flex items-center justify-between">
        {/* Connecting Track Line */}
        <div className="absolute left-6 right-6 top-4 -translate-y-1/2 h-0.5 bg-ink/10 -z-0" />

        {nodes.map((node) => {
          let circleBg = "bg-white text-mist border-ink/20";
          let icon = <Clock className="size-3.5" />;

          if (node.status === "done") {
            circleBg = "bg-emerald-600 text-white border-emerald-600 ring-4 ring-emerald-500/15";
            icon = <Check className="size-3.5 stroke-[2.5]" />;
          } else if (node.status === "active") {
            circleBg = "bg-amber-500 text-white border-amber-500 ring-4 ring-amber-500/20 animate-pulse";
            icon = <Clock className="size-3.5 stroke-[2.5]" />;
          } else if (node.status === "returned") {
            circleBg = "bg-orange-500 text-white border-orange-500 ring-4 ring-orange-500/20";
            icon = <RotateCcw className="size-3.5 stroke-[2.5]" />;
          } else if (node.status === "rejected") {
            circleBg = "bg-rose-600 text-white border-rose-600 ring-4 ring-rose-600/20";
            icon = <X className="size-3.5 stroke-[2.5]" />;
          }

          return (
            <div key={node.id} className="relative z-10 flex flex-col items-center text-center">
              <div
                className={`flex size-8 items-center justify-center rounded-full border transition-all duration-300 ${circleBg}`}
              >
                {icon}
              </div>
              <p className="mt-2 text-[12.5px] font-medium text-ink">
                {node.label}
              </p>
              {node.subtext && (
                <p className="text-[11px] text-mist">{node.subtext}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
