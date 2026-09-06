"use client";

import React from "react";
import { History } from "lucide-react";
import type { PortalCounterOffer, PortalLine } from "@/lib/types";

/**
 * OutcomeBadge states what happened to a proposal without stating why.
 *
 * Each state says what the customer needs and nothing more. None of them
 * reveals the ceiling the proposal was measured against, who reviewed it, or
 * how close it came -- keeping the portal's vocabulary separate from the
 * internal one is the whole point.
 *
 * "Under review" is a waiting state, not a resting one: a routed proposal is
 * resolved to approved or declined the moment the approval round closes, so a
 * customer is never left reading it after a decision has been made.
 */
function OutcomeBadge({ outcome }: { outcome: string }) {
  const { text, tone } = ((): { text: string; tone: string } => {
    switch (outcome) {
      case "AUTO_ACCEPTED":
        return { text: "Applied", tone: "tone-ok" };
      case "APPROVED":
        return { text: "Approved", tone: "tone-ok" };
      case "REJECTED":
        return { text: "Declined", tone: "tone-bad" };
      default:
        return { text: "Under review", tone: "tone-warn" };
    }
  })();

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap ${tone}`}
    >
      {text}
    </span>
  );
}

/**
 * NegotiationTable is the history of what the customer asked for and what came
 * of it. The backend returns counter-offers newest first, which is the order
 * shown.
 */
export function NegotiationTable({
  offers,
  lines,
}: {
  offers: PortalCounterOffer[];
  lines: PortalLine[];
}) {
  const lineName = React.useCallback(
    (id?: number | null) => {
      if (id == null) return "Whole order";
      return lines.find((l) => l.id === id)?.product_name ?? "A line item";
    },
    [lines],
  );

  return (
    <div className="rounded-[24px] bg-white card-shadow overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 pt-5 pb-3 sm:px-6">
        <History className="size-4 text-mist" />
        <h2 className="text-[16px] font-semibold text-ink">Negotiation history</h2>
        {offers.length > 0 ? (
          <span className="text-[12px] text-mist">
            {offers.length} request{offers.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {offers.length === 0 ? (
        <p className="px-5 pb-6 text-[12.5px] text-mist leading-relaxed sm:px-6">
          No change requests yet. If the commercial terms need to move, propose a discount from the{" "}
          <strong className="font-semibold text-ink">Messages</strong> tab — it is reviewed against
          our standard terms straight away.
        </p>
      ) : (
        <div className="md:overflow-x-auto">
          <table className="stack-table w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-y border-ink/6">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Applies to</th>
                <th className="px-6 py-3 text-right">Previous</th>
                <th className="px-6 py-3 text-right">Requested</th>
                <th className="px-6 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {offers.map((offer) => (
                <tr key={offer.id} className="align-top hover:bg-cream/20">
                  <td data-label="Date" className="px-6 py-4 text-mist md:whitespace-nowrap">
                    {new Date(offer.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td data-stack="primary" className="px-6 py-4">
                    <p className="font-medium text-ink">{lineName(offer.line_id)}</p>
                    {offer.note ? (
                      <p className="mt-0.5 text-[12px] text-mist leading-relaxed md:max-w-[320px]">
                        &ldquo;{offer.note}&rdquo;
                      </p>
                    ) : null}
                  </td>
                  <td data-label="Previous" className="px-6 py-4 text-right tabular-nums text-mist">
                    {offer.previous_discount_pct}%
                  </td>
                  <td data-label="Requested" className="px-6 py-4 text-right tabular-nums font-semibold text-ink">
                    {offer.proposed_discount_pct}%
                  </td>
                  <td data-label="Outcome" className="px-6 py-4">
                    <OutcomeBadge outcome={offer.outcome} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
