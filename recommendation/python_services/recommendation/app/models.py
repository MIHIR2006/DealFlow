from typing import List, Optional
from pydantic import BaseModel, Field


class RecommendRequest(BaseModel):
    product_ids: List[int] = Field(..., min_length=1, description="List of product IDs in cart")
    quotation_id: Optional[int] = Field(default=None, description="Optional quotation ID for margin delta")
    top_n: int = Field(default=5, ge=1, le=20, description="Max suggestions to return")


class Suggestion(BaseModel):
    product_id: int
    name: str
    is_promoted: bool
    margin_pct: float
    margin_delta: float
    confidence: float
    co_purchase_count: int


class RecommendResponse(BaseModel):
    suggestions: List[Suggestion]


class RecalculateResponse(BaseModel):
    status: str
    rows_updated: int
    message: str
