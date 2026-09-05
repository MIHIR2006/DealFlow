import logging
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from shared.config import settings
from shared.db import get_pool
from recommendation.app.models import (
    RecommendRequest,
    RecommendResponse,
    RecalculateResponse,
    Suggestion,
)
from recommendation.app.scoring import (
    compute_margin_pct,
    score_and_rank,
)
from recommendation.app.signals.co_purchase import (
    fetch_quotation_lines,
    fetch_recommendation_candidates,
    run_recalculation,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="")


@router.post(
    "/recommend",
    response_model=RecommendResponse,
    status_code=status.HTTP_200_OK,
    summary="Get ranked product recommendations",
)
async def get_recommendations(payload: RecommendRequest) -> RecommendResponse:
    """Generate ranked upsell and cross-sell product recommendations."""
    try:
        if not payload.product_ids:
            return RecommendResponse(suggestions=[])

        # 1. Fetch candidates from DB / fallback
        candidates = await fetch_recommendation_candidates(payload.product_ids)
        if not candidates:
            return RecommendResponse(suggestions=[])

        # 2. Compute individual margin_pct for each candidate
        for c in candidates:
            price = float(c.get("unit_price", 0.0) or 0.0)
            cost = float(c.get("unit_cost", 0.0) or 0.0)
            c["margin_pct"] = compute_margin_pct(price, cost)

        # 3. Compute baseline metrics if quotation_id provided
        baseline_margin_pct = 0.0
        baseline_revenue = 0.0
        baseline_cost = 0.0

        if payload.quotation_id:
            lines = await fetch_quotation_lines(payload.quotation_id)
            if lines:
                for line in lines:
                    u_price = float(line.get("unit_price", 0.0) or 0.0)
                    u_cost = float(line.get("unit_cost", 0.0) or 0.0)
                    qty = float(line.get("qty", 1.0) or 1.0)
                    disc = float(line.get("discount_pct", 0.0) or 0.0)

                    eff_price = u_price * (1.0 - (disc / 100.0))
                    baseline_revenue += eff_price * qty
                    baseline_cost += u_cost * qty

                if baseline_revenue > 0:
                    baseline_margin_pct = ((baseline_revenue - baseline_cost) / baseline_revenue) * 100.0

        # 4. Score, filter, rank, and calculate delta
        ranked = score_and_rank(
            candidates=candidates,
            cart_size=len(payload.product_ids),
            margin_threshold=settings.MARGIN_THRESHOLD_PCT,
            baseline_margin_pct=baseline_margin_pct,
            baseline_revenue=baseline_revenue,
            baseline_cost=baseline_cost,
        )

        top_candidates = ranked[: payload.top_n]
        suggestions = [
            Suggestion(
                product_id=int(r["product_id"]),
                name=str(r["name"]),
                is_promoted=bool(r.get("is_promoted", False)),
                margin_pct=float(r["margin_pct"]),
                margin_delta=float(r.get("margin_delta", 0.0)),
                confidence=round(float(r.get("confidence", 0.0)), 4),
                co_purchase_count=int(r.get("co_purchase_count", 0)),
            )
            for r in top_candidates
        ]

        return RecommendResponse(suggestions=suggestions)

    except Exception as exc:
        logger.error(f"Error computing recommendations: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate recommendations: {str(exc)}",
        )


@router.post(
    "/admin/recalculate",
    response_model=RecalculateResponse,
    status_code=status.HTTP_200_OK,
    summary="Batch recalculate co-purchase association matrix",
)
async def recalculate_associations() -> RecalculateResponse:
    """Run SQL CTE job to recompute co-purchase association stats."""
    try:
        updated_rows = await run_recalculation(
            min_support=settings.MIN_SUPPORT,
            top_k=settings.TOP_K,
        )
        return RecalculateResponse(
            status="success",
            rows_updated=updated_rows,
            message=f"Successfully recomputed co-purchase recommendations. Updated {updated_rows} rows.",
        )
    except Exception as exc:
        logger.error(f"Error in co-purchase recalculation: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recalculation failed: {str(exc)}",
        )


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Health check",
)
async def health():
    """Service health and database probe."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1")
            if val == 1:
                return {
                    "status": "healthy",
                    "service": "dealflow360-recommendation",
                    "database": "connected",
                }
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "service": "dealflow360-recommendation",
                "database": "error",
            },
        )
    except Exception as exc:
        logger.warning(f"Health check probe failed: {exc}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "service": "dealflow360-recommendation",
                "database": "error",
            },
        )
