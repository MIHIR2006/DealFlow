from typing import Any, Dict, List, Optional
from app.schemas import Suggestion
from app.signals.margin import compute_margin_delta, compute_margin_pct


def score_and_rank(
    candidates: List[Dict[str, Any]],
    quotation_lines: Optional[List[Dict[str, Any]]] = None,
    num_cart_products: int = 1,
    margin_threshold_pct: float = 20.0,
    top_n: int = 5,
) -> List[Suggestion]:
    """
    Pure function ranking pipeline:
    1. Deduplicate candidates across anchors.
    2. Hard filter: drop candidates with margin_pct < margin_threshold_pct.
    3. Rank candidates:
       - Single product cart: rank by co_purchase_count DESC
       - Multi product cart: rank by confidence DESC
    4. Promotion boost: stable sort placing is_promoted = True first.
    5. Compute margin_delta against existing quotation lines.
    6. Return top_n suggestions.
    """
    if not candidates:
        return []

    # 1. Deduplicate by recommended_id
    deduped: Dict[int, Dict[str, Any]] = {}
    for c in candidates:
        rec_id = int(c["recommended_id"])
        if rec_id not in deduped:
            deduped[rec_id] = c
        else:
            existing = deduped[rec_id]
            if num_cart_products > 1:
                # In multi-product cart (N >= 2), retain candidate with higher confidence; break ties by co_purchase_count
                new_conf = float(c.get("confidence", 0.0) or 0.0)
                ext_conf = float(existing.get("confidence", 0.0) or 0.0)
                if new_conf > ext_conf:
                    deduped[rec_id] = c
                elif new_conf == ext_conf:
                    if int(c.get("co_purchase_count", 0) or 0) > int(existing.get("co_purchase_count", 0) or 0):
                        deduped[rec_id] = c
            else:
                # In single-product cart, retain candidate with higher co_purchase_count
                if int(c.get("co_purchase_count", 0) or 0) > int(existing.get("co_purchase_count", 0) or 0):
                    deduped[rec_id] = c

    candidate_list = list(deduped.values())

    # 2. Hard filter by margin threshold & calculate product margin
    surviving: List[Dict[str, Any]] = []
    for c in candidate_list:
        unit_price = float(c.get("unit_price", 0.0) or 0.0)
        cost = float(c.get("cost", 0.0) or 0.0)
        margin_pct = compute_margin_pct(unit_price, cost)

        if margin_pct >= margin_threshold_pct:
            item = dict(c)
            item["calculated_margin_pct"] = margin_pct
            surviving.append(item)

    if not surviving:
        return []

    # 3 & 4. Rank candidates with Promotion boost
    # If single anchor product: sort key is (is_promoted, co_purchase_count, confidence)
    # If multi anchor products (N >= 2): sort key is (is_promoted, confidence, co_purchase_count)
    if num_cart_products <= 1:
        surviving.sort(
            key=lambda item: (
                1 if item.get("is_promoted") else 0,
                int(item.get("co_purchase_count", 0) or 0),
                round(float(item.get("confidence", 0.0) or 0.0), 6),
                -int(item.get("recommended_id", 0)),
            ),
            reverse=True,
        )
    else:
        surviving.sort(
            key=lambda item: (
                1 if item.get("is_promoted") else 0,
                round(float(item.get("confidence", 0.0) or 0.0), 6),
                int(item.get("co_purchase_count", 0) or 0),
                -int(item.get("recommended_id", 0)),
            ),
            reverse=True,
        )

    # 5. Compute margin delta and construct Suggestion models
    top_candidates = surviving[:top_n]
    results: List[Suggestion] = []

    for c in top_candidates:
        price = float(c.get("unit_price", 0.0) or 0.0)
        cost = float(c.get("cost", 0.0) or 0.0)
        delta = compute_margin_delta(quotation_lines, price, cost)

        results.append(
            Suggestion(
                product_id=int(c["recommended_id"]),
                name=str(c.get("name", "")),
                is_promoted=bool(c.get("is_promoted", False)),
                margin_pct=float(c["calculated_margin_pct"]),
                margin_delta=float(delta),
                confidence=round(float(c.get("confidence", 0.0) or 0.0), 4),
                co_purchase_count=int(c.get("co_purchase_count", 0) or 0),
            )
        )

    return results
