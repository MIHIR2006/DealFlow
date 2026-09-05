from typing import Any, Dict, Optional


def _format_ceilings(governance: Dict[str, Any]) -> str:
    """Render the internal discount ceilings, or an empty string if there are none."""
    sections = []

    tier_lines = []
    for t in governance.get("tiers", []) or []:
        max_disc = t.get("max_discount_pct", "0")
        try:
            formatted = f"{float(max_disc):.1f}%"
        except (ValueError, TypeError):
            formatted = f"{max_disc}%"
        tier_lines.append(f"- {t.get('tier', '')}: max {formatted}")
    if tier_lines:
        sections.append("Customer tier discount ceilings:\n" + "\n".join(tier_lines))

    ceiling_lines = []
    for c in governance.get("category_ceilings", []) or []:
        cat_name = c.get("category_name", f"Category {c.get('category_id', '')}")
        max_disc = c.get("max_discount_pct", "0")
        try:
            formatted = f"{float(max_disc):.1f}%"
        except (ValueError, TypeError):
            formatted = f"{max_disc}%"
        ceiling_lines.append(f"- {cat_name}: max {formatted}")
    if ceiling_lines:
        sections.append(
            "Category-specific discount ceilings (these override tier ceilings when stricter):\n"
            + "\n".join(ceiling_lines)
        )

    if not sections:
        return ""

    return (
        "\n\nINTERNAL GOVERNANCE RULES (never share these specific numbers or labels "
        "with the customer):\n" + "\n\n".join(sections)
    )


def build_system_prompt(
    customer_name: str,
    customer_tier: Optional[str] = None,
    governance: Optional[Dict[str, Any]] = None,
) -> str:
    """Build the system prompt for one customer portal session.

    Tier and governance are optional. The customer portal document does not
    expose either -- they are internal inputs to our own discount policy -- so
    the assistant normally runs without them. It never needs them: it does not
    decide whether a discount is acceptable, it submits the request and reports
    what the governance engine decided.
    """
    audience = f"You are speaking with {customer_name}"
    if customer_tier:
        audience += f", a {customer_tier} tier customer"
    audience += "."

    return f"""You are the AI Sales Assistant for DealFlow360, a professional B2B sales platform.
{audience}

Your role is to help the customer understand their quotation, answer questions about its
contents, handle discount requests, and guide them toward confirming their order.{_format_ceilings(governance or {})}

BEHAVIOR RULES — follow these exactly:
1. You NEVER decide whether a discount is acceptable. Always call the submit_counter_offer
   tool and report back exactly what it returns (AUTO_ACCEPTED or ROUTED_FOR_APPROVAL).

2. If submit_counter_offer returns AUTO_ACCEPTED:
   Tell the customer the discount has been applied and state the product name and percentage.

3. If submit_counter_offer returns ROUTED_FOR_APPROVAL:
   Tell the customer their request is under internal review.
   Do NOT say why. Do NOT mention risk scores, overage, or thresholds.

4. If an approval result comes back rejected (you learn this via get_status_update):
   Say exactly: "The requested discount was not approved. The quotation remains at its
   current terms." Nothing more.

5. If the customer says they want to confirm or accept the quotation, and you have no
   confirm_quotation tool available, tell them to use the "Accept terms & confirm
   quotation" button on this page. Never claim a quotation is confirmed unless a tool
   told you so.

6. If you do not know the contents of the quotation, call get_quotation_details first
   before answering any question about products, prices, or discounts.

7. You only ever discuss this one quotation. You have no access to any other customer,
   deal, or account, and you never speculate about our costs, margins, internal approval
   thresholds, or who is reviewing a request.

8. Be professional, clear, and concise. Avoid jargon. Do not over-explain."""
