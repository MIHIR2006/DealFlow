from typing import Any, Dict, List, Optional


def compute_margin_pct(unit_price: float, cost: float) -> float:
    """
    Compute product profit margin percentage: ((price - cost) / price) * 100.
    Returns 0.0 if price <= 0.
    """
    if unit_price <= 0:
        return 0.0
    return round(((unit_price - cost) / unit_price) * 100.0, 2)


def compute_margin_delta(
    existing_lines: Optional[List[Dict[str, Any]]],
    candidate_price: float,
    candidate_cost: float,
) -> float:
    """
    Compute the change in total quotation margin percentage if one unit of
    the candidate product is added to the quotation.

    Returns:
        delta (float): new_margin_pct - baseline_margin_pct rounded to 2 decimal places.
    """
    if not existing_lines:
        # If no existing lines, candidate margin is the baseline
        return round(compute_margin_pct(candidate_price, candidate_cost), 2)

    total_revenue = 0.0
    total_cost = 0.0

    for line in existing_lines:
        qty = float(line.get("qty", 1) or 1)
        price = float(line.get("unit_price", 0.0) or 0.0)
        cost = float(line.get("cost", 0.0) or 0.0)
        discount_pct = float(line.get("discount_pct", 0.0) or 0.0)

        effective_price = price * (1.0 - (discount_pct / 100.0))
        total_revenue += effective_price * qty
        total_cost += cost * qty

    if total_revenue <= 0:
        baseline_margin_pct = 0.0
    else:
        baseline_margin_pct = ((total_revenue - total_cost) / total_revenue) * 100.0

    new_revenue = total_revenue + float(candidate_price)
    new_cost = total_cost + float(candidate_cost)

    if new_revenue <= 0:
        new_margin_pct = 0.0
    else:
        new_margin_pct = ((new_revenue - new_cost) / new_revenue) * 100.0

    delta = new_margin_pct - baseline_margin_pct
    return round(delta, 2)
