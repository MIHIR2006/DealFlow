import logging
from typing import Any, Dict, List, Set
from app.config import settings
from app.db import execute_query, fetch_rows

logger = logging.getLogger("dealflow360.co_purchase")


async def run_co_purchase_recalculation(
    min_support: int = settings.MIN_SUPPORT,
    top_k: int = settings.TOP_K,
) -> int:
    """
    Execute batch SQL job to compute co-purchase count and confidence statistics.
    Filters by minimum support threshold and truncates/rebuilds product_recommendations.
    """
    logger.info(f"Starting co-purchase recalculation with min_support={min_support}, top_k={top_k}...")

    # Clean previous precomputed recommendations to prevent stale ranks
    await execute_query("TRUNCATE TABLE product_recommendations;")

    batch_sql = """
    WITH pair_counts AS (
        SELECT
            a.product_id,
            b.product_id AS recommended_id,
            COUNT(*) AS co_purchase_count
        FROM quotation_lines a
        JOIN quotation_lines b
            ON a.quotation_id = b.quotation_id
           AND a.product_id != b.product_id
        JOIN quotations q ON q.id = a.quotation_id
        WHERE q.status IN ('CONFIRMED','FULFILLED','INVOICED','PAID')
        GROUP BY a.product_id, b.product_id
        HAVING COUNT(*) >= $1
    ),
    base AS (
        SELECT a.product_id, COUNT(DISTINCT a.quotation_id) AS total_orders
        FROM quotation_lines a
        JOIN quotations q ON q.id = a.quotation_id
        WHERE q.status IN ('CONFIRMED','FULFILLED','INVOICED','PAID')
        GROUP BY a.product_id
    ),
    scored AS (
        SELECT
            p.product_id,
            p.recommended_id,
            p.co_purchase_count,
            p.co_purchase_count::float / base.total_orders AS confidence,
            ROW_NUMBER() OVER (
                PARTITION BY p.product_id
                ORDER BY p.co_purchase_count::float / base.total_orders DESC, p.co_purchase_count DESC
            ) AS rnk
        FROM pair_counts p
        JOIN base ON base.product_id = p.product_id
    )
    INSERT INTO product_recommendations (product_id, recommended_id, co_purchase_count, confidence, updated_at)
    SELECT product_id, recommended_id, co_purchase_count, confidence, now()
    FROM scored
    WHERE rnk <= $2
    ON CONFLICT (product_id, recommended_id)
    DO UPDATE SET co_purchase_count = EXCLUDED.co_purchase_count,
                  confidence = EXCLUDED.confidence,
                  updated_at = EXCLUDED.updated_at;
    """

    res = await execute_query(batch_sql, min_support, top_k)
    # Result string is typically 'INSERT 0 N'
    inserted_count = 0
    if res and " " in res:
        try:
            inserted_count = int(res.strip().split()[-1])
        except ValueError:
            inserted_count = 0

    logger.info(f"Co-purchase recalculation completed. Rows inserted: {inserted_count}")
    return inserted_count


async def fetch_recommendation_candidates(cart_product_ids: List[int]) -> List[Dict[str, Any]]:
    """
    Fetch precomputed recommendations for products in cart.
    Falls back to `upsell_rules` table for cold-start products with no computed history.
    """
    if not cart_product_ids:
        return []

    # 1. Query precomputed recommendations for all anchor product IDs in cart
    rec_query = """
    SELECT
        r.product_id AS anchor_id,
        r.recommended_id,
        p.name,
        p.unit_price,
        p.cost,
        p.is_promoted,
        r.confidence,
        r.co_purchase_count
    FROM product_recommendations r
    JOIN products p ON p.id = r.recommended_id
    WHERE r.product_id = ANY($1::int[])
      AND r.recommended_id != ALL($1::int[])
      AND p.is_active = true
    ORDER BY r.co_purchase_count DESC;
    """
    records = await fetch_rows(rec_query, cart_product_ids)
    candidates = [dict(r) for r in records]

    # 2. Check for cold-start anchors with zero recommendations
    found_anchors: Set[int] = {c["anchor_id"] for c in candidates}
    missing_anchors = [pid for pid in cart_product_ids if pid not in found_anchors]

    if missing_anchors:
        fallback_query = """
        SELECT
            u.product_id AS anchor_id,
            u.suggested_product_id AS recommended_id,
            p.name,
            p.unit_price,
            p.cost,
            p.is_promoted,
            0.0 AS confidence,
            0 AS co_purchase_count,
            u.priority
        FROM upsell_rules u
        JOIN products p ON p.id = u.suggested_product_id
        WHERE u.product_id = ANY($1::int[])
          AND u.suggested_product_id != ALL($1::int[])
          AND p.is_active = true
        ORDER BY u.priority ASC;
        """
        fallback_records = await fetch_rows(fallback_query, missing_anchors)
        for fr in fallback_records:
            candidates.append(dict(fr))

    return candidates


async def fetch_quotation_lines(quotation_id: int) -> List[Dict[str, Any]]:
    """Fetch existing line items for a quotation to compute margin delta."""
    if not quotation_id:
        return []
    query = """
    SELECT product_id, qty, unit_price, cost, discount_pct
    FROM quotation_lines
    WHERE quotation_id = $1;
    """
    records = await fetch_rows(query, quotation_id)
    return [dict(r) for r in records]
