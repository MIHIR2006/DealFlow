import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from shared.config import settings
from ai_salesman.agent.salesman import AssistantUnavailable, run_salesman
from ai_salesman.backend_client import DealFlowBackendClient, PortalAccessError
from ai_salesman.agent.tools import STATUS_MESSAGES

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dealflow360.ai_salesman.main")

# Every route here is reached with a customer portal token and nothing else.
# The token is passed straight through to the backend, which resolves exactly
# one quotation from it; this service holds no session of its own beyond the
# conversation history keyed by that same token.


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan manager for AI Salesman service."""
    logger.info("Starting DealFlow360 AI Salesman Service...")
    if not settings.llm_configured:
        logger.warning(
            "LLM_API_KEY is not configured: the assistant will report itself "
            "unavailable and the portal will hide it."
        )
    yield
    logger.info("Shutting down DealFlow360 AI Salesman Service...")


app = FastAPI(
    title="DealFlow360 AI Salesman",
    description="Conversational AI Sales Assistant for Customer Portal",
    version="1.0.0",
    lifespan=lifespan,
)


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=2000, description="Customer input message")


class ChatResponse(BaseModel):
    reply: str = Field(..., description="AI Salesman response message")


class HealthResponse(BaseModel):
    status: str
    service: str = "dealflow360-ai-salesman"
    configured: bool


@app.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    tags=["health"],
    summary="Health and configuration status",
)
async def health_check() -> HealthResponse:
    """Report whether the assistant has what it needs to answer.

    The portal reads `configured` to decide whether to offer the assistant at
    all, so an unconfigured deployment shows no broken control.
    """
    configured = settings.llm_configured
    return HealthResponse(
        status="healthy" if configured else "degraded",
        configured=configured,
    )


@app.post(
    "/ai-portal/q/{portal_token}/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Chat with AI Salesman",
)
async def chat_with_salesman(portal_token: str, request: ChatRequest) -> ChatResponse:
    """Handle conversational turn with the AI Salesman for a portal quotation session."""
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty",
        )

    try:
        return ChatResponse(reply=await run_salesman(portal_token, message))
    except PortalAccessError:
        # Same answer the backend gives for an unknown, revoked, or expired
        # token, so this endpoint does not reveal which tokens exist either.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This link is invalid or has expired",
        )
    except AssistantUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The assistant is not available right now",
        )
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
        quote = await client.get_quotation()
        raw_status = quote.get("status", "UNKNOWN")
        return {
            "status": raw_status,
            "label": STATUS_MESSAGES.get(raw_status, raw_status),
            "reference": quote.get("reference", "N/A"),
        }
    except PortalAccessError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quotation not found",
        )
    except Exception as exc:
        logger.error(f"Error fetching portal status: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error communicating with backend service",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "ai_salesman.main:app",
        host=settings.AI_SALESMAN_HOST,
        port=settings.AI_SALESMAN_PORT,
    )
