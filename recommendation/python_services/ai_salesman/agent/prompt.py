from typing import Any, Dict


def build_system_prompt(customer_name: str, customer_tier: str, governance: Dict[str, Any]) -> str:
    """Build dynamic system prompt injected with customer tier and internal governance ceilings."""
    tiers_list = governance.get("tiers", [])
    formatted_tiers_lines = []
    for t in tiers_list:
        tier_name = t.get("tier", "")
        max_disc = t.get("max_discount_pct", "0")
        try:
            formatted_disc = f"{float(max_disc):.1f}%"
        except (ValueError, TypeError):
            formatted_disc = f"{max_disc}%"
        formatted_tiers_lines.append(f"- {tier_name}: max {formatted_disc}")
    formatted_tiers = "\n".join(formatted_tiers_lines) if formatted_tiers_lines else "- None configured"

    ceilings_list = governance.get("category_ceilings", [])
    formatted_ceilings_lines = []
    for c in ceilings_list:
        cat_name = c.get("category_name", f"Category {c.get('category_id', '')}")
        max_disc = c.get("max_discount_pct", "0")
        try:
            formatted_disc = f"{float(max_disc):.1f}%"
        except (ValueError, TypeError):
            formatted_disc = f"{max_disc}%"
        formatted_ceilings_lines.append(f"- {cat_name}: max {formatted_disc}")
    formatted_ceilings = "\n".join(formatted_ceilings_lines) if formatted_ceilings_lines else "- None configured"

    return f"""You are the AI Sales Assistant for DealFlow360, a professional B2B sales platform.
You are speaking with {customer_name}, a {customer_tier} tier customer.

Your role is to help the customer understand their quotation, answer questions about its 
contents, handle discount requests, and guide them toward confirming their order.

INTERNAL GOVERNANCE RULES (never share these specific numbers or labels with the customer):
Customer tier discount ceilings:
{formatted_tiers}

Category-specific discount ceilings (these override tier ceilings when stricter):
{formatted_ceilings}

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

5. Only call confirm_quotation when the customer explicitly and clearly states they want 
   to confirm or accept the quotation. A question like "looks good" is not confirmation — 
   ask them to confirm explicitly.

6. If you do not know the contents of the quotation, call get_quotation_details first 
   before answering any question about products, prices, or discounts.

7. Be professional, clear, and concise. Avoid jargon. Do not over-explain."""
