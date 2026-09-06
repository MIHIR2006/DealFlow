"use client";

import { Check, Clock, RotateCcw, X } from "lucide-react";
import { ApprovalStep } from "@/lib/types";

export function ApprovalStepper({
  steps = [],
  currentStatus,
  className = "",
}: {
  steps?: ApprovalStep[];
  currentStatus: string;
  className?: string;
}) {
  const isFinanceRequired = steps.some((s) => s.required_role === "FINANCE");

  type NodeDef = {
    id: string;
    label: string;
    status: "done" | "active" | "pending" | "returned" | "rejected";
  };

  const nodes: NodeDef[] = [
    { id: "submit", label: "Submitted", status: "done" },
    { id: "manager", label: "Sales Manager", status: "pending" },
  ];

  if (isFinanceRequired) {
    nodes.push({ id: "finance", label: "Finance", status: "pending" });
  }
  nodes.push({ id: "confirmed", label: "Confirmed", status: "pending" });

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
      else if (finStep.status === "PENDING" && mgrStep?.status === "APPROVED") {
        finNode.status = "active";
      }
    }
  }

  if (currentStatus === "CONFIRMED" || currentStatus === "APPROVED") {
    const confNode = nodes.find((n) => n.id === "confirmed");
    if (confNode) {
      confNode.status = currentStatus === "CONFIRMED" ? "done" : "active";
    }
  }

  return (
    <div className={`scroll-x flex items-center py-3 ${className}`}>
      {nodes.map((node, i) => {
        let circle = "border-ink/25 bg-transparent text-mist";
        let icon = <span className="size-2 rounded-full border border-current" />;

        if (node.status === "done") {
          circle = "bg-ink border-transparent text-bone";
          icon = <Check className="size-3.5" />;
        } else if (node.status === "active") {
          circle = "tone-warn border-transparent font-medium";
          icon = <Clock className="size-3.5" />;
        } else if (node.status === "returned") {
          circle = "tone-warn border-transparent font-medium";
          icon = <RotateCcw className="size-3.5" />;
        } else if (node.status === "rejected") {
          circle = "tone-bad border-transparent font-medium";
          icon = <X className="size-3.5" />;
        }

        return (
          <div key={node.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <span
                className={`flex size-7 items-center justify-center rounded-full border ${circle}`}
              >
                {icon}
              </span>
              <span className="whitespace-nowrap text-[12.5px] text-mist">{node.label}</span>
            </div>
            {i < nodes.length - 1 ? (
              <span className="mx-2 h-px min-w-3 flex-1 bg-ink/15 sm:mx-3" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
