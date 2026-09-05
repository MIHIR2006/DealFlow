from typing import Any, Dict, List


def compute_margin_pct(unit_price: float, unit_cost: float) -> float:
    """Compute candidate product margin percentage."""
    if unit_price <= 0:
        return 0.0
    return round((unit_price - unit_cost) / unit_price * 100, 2)


def compute_baseline_margin(lines: List[Dict[str, Any]]) -> float:
    """Compute overall baseline quotation margin percentage."""
    if not lines:
        return 0.0

    total_revenue = 0.0
    total_cost = 0.0

    for line in lines:
        unit_price = float(line.get("unit_price", 0.0) or 0.0)
        unit_cost = float(line.get("unit_cost", 0.0) or 0.0)
        qty = float(line.get("qty", 1.0) or 1.0)
        discount_pct = float(line.get("discount_pct", 0.0) or 0.0)

        effective_price = unit_price * (1.0 - (discount_pct / 100.0))
        total_revenue += effective_price * qty
        total_cost += unit_cost * qty

    if total_revenue <= 0:
        return 0.0
    return (total_revenue - total_cost) / total_revenue * 100.0


def compute_margin_delta(
    baseline_margin_pct: float,
    baseline_revenue: float,
    baseline_cost: float,
    candidate_price: float,
    candidate_cost: float,
) -> float:
    """Compute change in total quotation margin percentage if 1 unit of candidate added."""
    proj_revenue = baseline_revenue + candidate_price
    proj_cost = baseline_cost + candidate_cost

    if proj_revenue <= 0:
        return 0.0

    projected_margin = (proj_revenue - proj_cost) / proj_revenue * 100.0
    return round(projected_margin - baseline_margin_pct, 2)


def deduplicate_candidates(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate candidate products across multiple anchors, keeping best confidence / co_purchase."""
    deduped: Dict[int, Dict[str, Any]] = {}
    for c in candidates:
        pid = int(c["product_id"])
        if pid not in deduped:
            deduped[pid] = c
        else:
            existing = deduped[pid]
            new_conf = float(c.get("confidence", 0.0) or 0.0)
            ext_conf = float(existing.get("confidence", 0.0) or 0.0)
            if new_conf > ext_conf:
                deduped[pid] = c
            elif new_conf == ext_conf:
                new_cnt = int(c.get("co_purchase_count", 0) or 0)
                ext_cnt = int(existing.get("co_purchase_count", 0) or 0)
                if new_cnt > ext_cnt:
                    deduped[pid] = c

    return list(deduped.values())


def score_and_rank(
    candidates: List[Dict[str, Any]],
    cart_size: int,
    margin_threshold: float,
    baseline_margin_pct: float,
    baseline_revenue: float,
    baseline_cost: float,
) -> List[Dict[str, Any]]:
    """Rank candidates with margin filter, promotion boost, sorting, and margin delta calculation."""
    if not candidates:
        return []

    # Step 1: Deduplicate
    deduped = deduplicate_candidates(candidates)

    # Step 2: Hard margin filter
    filtered: List[Dict[str, Any]] = []
    for c in deduped:
        margin_pct = float(c.get("margin_pct", 0.0) or 0.0)
        if margin_pct >= margin_threshold:
            filtered.append(dict(c))

    if not filtered:
        return []

    # Step 3: Sort
    if cart_size <= 1:
        filtered.sort(
            key=lambda item: (
                1 if item.get("is_promoted") else 0,
                int(item.get("co_purchase_count", 0) or 0),
                float(item.get("confidence", 0.0) or 0.0),
                -int(item.get("product_id", 0)),
            ),
            reverse=True,
        )
    else:
        filtered.sort(
            key=lambda item: (
                1 if item.get("is_promoted") else 0,
                float(item.get("confidence", 0.0) or 0.0),
                int(item.get("co_purchase_count", 0) or 0),
                -int(item.get("product_id", 0)),
            ),
            reverse=True,
        )

    # Step 4: Compute margin delta
    results: List[Dict[str, Any]] = []
    for c in filtered:
        item = dict(c)
        cand_price = float(c.get("unit_price", 0.0) or 0.0)
        cand_cost = float(c.get("unit_cost", 0.0) or 0.0)
        item["margin_delta"] = compute_margin_delta(
            baseline_margin_pct=baseline_margin_pct,
            baseline_revenue=baseline_revenue,
            baseline_cost=baseline_cost,
            candidate_price=cand_price,
            candidate_cost=cand_cost,
        )
        results.append(item)

    return results
