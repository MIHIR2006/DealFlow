import logging
from typing import Any, Dict, List, Set
from shared.db import get_pool

logger = logging.getLogger(__name__)


async def fetch_recommendation_candidates(product_ids: List[int]) -> List[Dict[str, Any]]:
    """Fetch recommendation candidates from precomputed table, falling back to upsell_rules for cold-start."""
    if not product_ids:
        return []

    pool = await get_pool()
    cart_set = set(product_ids)
    candidates: List[Dict[str, Any]] = []

    async with pool.acquire() as conn:
        # Source A: Precomputed product_recommendations
        query_a = """
        SELECT 
            pr.product_id AS anchor_id,
            pr.recommended_id AS product_id,
            pr.co_purchase_count,
            pr.confidence,
            p.name,
            p.unit_price::float,
            p.unit_cost::float,
            p.is_promoted
        FROM product_recommendations pr
        JOIN products p ON p.id = pr.recommended_id
        WHERE pr.product_id = ANY($1::int[])
        ORDER BY pr.confidence DESC;
        """
        rows_a = await conn.fetch(query_a, product_ids)
        for r in rows_a:
            d = dict(r)
            if d["product_id"] not in cart_set:
                candidates.append(d)

        # Source B: Check cold-start anchors with zero recommendations
        found_anchors: Set[int] = {c["anchor_id"] for c in candidates}
        missing_anchors = [pid for pid in product_ids if pid not in found_anchors]

        if missing_anchors:
            query_b = """
            SELECT 
                u.product_id AS anchor_id,
                u.suggested_product_id AS product_id,
                0 AS co_purchase_count,
                0.0::float AS confidence,
                p.name,
                p.unit_price::float,
                p.unit_cost::float,
                p.is_promoted
            FROM upsell_rules u
            JOIN products p ON p.id = u.suggested_product_id
            WHERE u.product_id = ANY($1::int[])
              AND u.is_active = true
            ORDER BY u.priority ASC;
            """
            rows_b = await conn.fetch(query_b, missing_anchors)
            for r in rows_b:
                d = dict(r)
                if d["product_id"] not in cart_set:
                    candidates.append(d)

    return candidates


async def fetch_quotation_lines(quotation_id: int) -> List[Dict[str, Any]]:
    """Fetch lines of a quotation to compute baseline revenue, cost, and margin."""
    if not quotation_id:
        return []

    pool = await get_pool()
    query = """
    SELECT 
        ql.unit_price::float,
        ql.unit_cost::float,
        ql.qty::float,
        ql.line_discount_pct::float AS discount_pct
    FROM quotation_lines ql
    WHERE ql.quotation_id = $1;
    """
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, quotation_id)
            return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning(f"Error fetching quotation lines for quotation {quotation_id}: {exc}")
        return []


async def run_recalculation(min_support: int, top_k: int) -> int:
    """Execute batch SQL CTE to mine co-purchase associations and populate product_recommendations."""
    pool = await get_pool()
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

    async with pool.acquire() as conn:
        async with conn.transaction():
            status_str = await conn.execute(batch_sql, min_support, top_k)
            # asyncpg returns status string e.g. "INSERT 0 42"
            if status_str and " " in status_str:
                try:
                    return int(status_str.strip().split()[-1])
                except (ValueError, IndexError):
                    pass
            return 0
