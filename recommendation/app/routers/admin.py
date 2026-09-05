import logging
from fastapi import APIRouter, HTTPException, status
from app.config import settings
from app.schemas import RecalculateResponse
from app.signals.co_purchase import run_co_purchase_recalculation

logger = logging.getLogger("dealflow360.routers.admin")

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post(
    "/recalculate",
    response_model=RecalculateResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger batch recomputation of co-purchase statistics",
    description="Recomputes co_purchase_count and confidence statistics from confirmed orders in the database.",
)
async def trigger_recalculation() -> RecalculateResponse:
    try:
        updated_rows = await run_co_purchase_recalculation(
            min_support=settings.MIN_SUPPORT,
            top_k=settings.TOP_K,
        )
        return RecalculateResponse(
            status="success",
            rows_updated=updated_rows,
            message=f"Successfully recomputed co-purchase recommendations. Updated {updated_rows} rows.",
        )
    except Exception as exc:
        logger.error(f"Failed to recalculate co-purchases: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Co-purchase recalculation failed: {str(exc)}",
        )
