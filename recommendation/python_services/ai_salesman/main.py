import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status
import httpx
from pydantic import BaseModel, Field

from ai_salesman.agent.salesman import run_salesman
from ai_salesman.backend_client import DealFlowBackendClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dealflow360.ai_salesman.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan manager for AI Salesman service."""
    logger.info("Starting DealFlow360 AI Salesman Service...")
    yield
    logger.info("Shutting down DealFlow360 AI Salesman Service...")


app = FastAPI(
    title="DealFlow360 AI Salesman",
    description="Conversational AI Sales Assistant for Customer Portal",
    version="1.0.0",
    lifespan=lifespan,
)


class ChatRequest(BaseModel):
    message: str = Field(..., description="Customer input message")


class ChatResponse(BaseModel):
    reply: str = Field(..., description="AI Salesman response message")


@app.post(
    "/ai-portal/q/{portal_token}/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Chat with AI Salesman",
)
async def chat_with_salesman(portal_token: str, request: ChatRequest) -> ChatResponse:
    """Handle conversational turn with the AI Salesman for a portal quotation session."""
    if not request.message or not request.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty",
        )

    try:
        reply = await run_salesman(portal_token, request.message.strip())
        return ChatResponse(reply=reply)
    except Exception as exc:
        logger.error(f"Unexpected chat error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while processing chat message",
        )


@app.get(
    "/ai-portal/q/{portal_token}/status",
    status_code=status.HTTP_200_OK,
    summary="Get customer-friendly quotation status",
)
async def get_portal_status(portal_token: str):
    """Retrieve formatted status and reference for customer portal header."""
    client = DealFlowBackendClient(portal_token)
    try:
        data = await client.get_quotation()
        quote = data.get("quotation", data)
        header = quote.get("header", {})
        raw_status = header.get("status", "UNKNOWN")
        reference = header.get("reference", "N/A")

        status_labels = {
            "SENT": "Awaiting your review",
            "UNDER_NEGOTIATION": "Under negotiation",
            "PENDING_APPROVAL": "Your request is under review",
            "APPROVED": "Ready to confirm",
            "CONFIRMED": "Confirmed — order in progress",
            "REJECTED": "Not approved",
        }
        label = status_labels.get(raw_status, raw_status)

        return {
            "status": raw_status,
            "label": label,
            "reference": reference,
        }
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403, 404):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quotation not found",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error communicating with backend service",
        )
    except Exception as exc:
        logger.error(f"Error fetching portal status: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )
