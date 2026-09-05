import logging
from fastapi import APIRouter, HTTPException, status
from app.config import settings
from app.schemas import RecommendRequest, RecommendResponse
from app.scoring import score_and_rank
from app.signals.co_purchase import (
    fetch_quotation_lines,
    fetch_recommendation_candidates,
)

logger = logging.getLogger("dealflow360.routers.recommend")

router = APIRouter(tags=["recommendations"])


@router.post(
    "/recommend",
    response_model=RecommendResponse,
    status_code=status.HTTP_200_OK,
    summary="Get ranked product recommendations",
    description="Returns up to top_n product recommendations based on cart contents, margin thresholds, and active promotions.",
)
async def get_recommendations(payload: RecommendRequest) -> RecommendResponse:
    try:
        cart_product_ids = payload.product_ids
        if not cart_product_ids:
            return RecommendResponse(suggestions=[])

        # 1. Fetch precomputed candidates (or fallback to upsell_rules)
        candidates = await fetch_recommendation_candidates(cart_product_ids)
        if not candidates:
            return RecommendResponse(suggestions=[])

        # 2. Fetch existing quotation lines if quotation_id is provided
        quotation_lines = []
        if payload.quotation_id:
            quotation_lines = await fetch_quotation_lines(payload.quotation_id)

        # 3. Pure scoring, filtering, and ranking pipeline
        ranked_suggestions = score_and_rank(
            candidates=candidates,
            quotation_lines=quotation_lines,
            num_cart_products=len(cart_product_ids),
            margin_threshold_pct=settings.MARGIN_THRESHOLD_PCT,
            top_n=payload.top_n,
        )

        return RecommendResponse(suggestions=ranked_suggestions)

    except Exception as exc:
        logger.error(f"Error computing recommendations: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate recommendations: {str(exc)}",
        )
