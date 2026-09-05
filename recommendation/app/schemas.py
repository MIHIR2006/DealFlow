from typing import List, Optional
from pydantic import BaseModel, Field


class RecommendRequest(BaseModel):
    """Payload for requesting product recommendations."""
    quotation_id: Optional[int] = Field(
        default=None,
        description="Optional ID of current quotation to calculate margin delta against existing lines"
    )
    product_ids: List[int] = Field(
        ...,
        min_length=1,
        description="List of product IDs currently in the cart / quotation"
    )
    top_n: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of recommendations to return"
    )


class Suggestion(BaseModel):
    """Ranked recommendation suggestion item."""
    product_id: int = Field(..., description="ID of recommended product")
    name: str = Field(..., description="Product name")
    is_promoted: bool = Field(default=False, description="Whether product is flagged for promotion boost")
    margin_pct: float = Field(..., description="Calculated margin percentage of the candidate product")
    margin_delta: float = Field(default=0.0, description="Delta in quotation overall margin when item is added")
    confidence: float = Field(default=0.0, description="Conditional probability P(Candidate | Anchor)")
    co_purchase_count: int = Field(default=0, description="Number of historical co-purchases with anchor product")


class RecommendResponse(BaseModel):
    """Response containing ranked recommendations."""
    suggestions: List[Suggestion] = Field(
        default_factory=list,
        description="Ranked list of upsell / cross-sell suggestions"
    )


class RecalculateResponse(BaseModel):
    """Response returned after running batch co-purchase statistics recalculation."""
    status: str
    rows_updated: int
    message: str


class HealthResponse(BaseModel):
    """Service health status check response."""
    status: str
    service: str = "dealflow360-recommendation"
    database: str
