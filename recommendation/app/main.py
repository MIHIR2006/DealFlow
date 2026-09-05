import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db import check_db_health, close_pool, init_pool, init_schema_tables
from app.routers.admin import router as admin_router
from app.routers.recommend import router as recommend_router
from app.schemas import HealthResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dealflow360.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown events."""
    logger.info(f"Starting DealFlow360 Recommendation Service (env={settings.ENVIRONMENT})...")
    await init_pool()
    await init_schema_tables()
    yield
    logger.info("Shutting down Recommendation Service...")
    await close_pool()


app = FastAPI(
    title="DealFlow360 Recommendation Service",
    description="Real-time Upsell and Cross-Sell Recommendation Engine for B2B Quotations.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recommend_router)
app.include_router(admin_router)


@app.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    tags=["health"],
    summary="Health check endpoint",
)
async def health_check() -> HealthResponse:
    """Service health and database connectivity status."""
    is_connected = await check_db_health()
    return HealthResponse(
        status="healthy" if is_connected else "degraded",
        service="dealflow360-recommendation",
        database="connected" if is_connected else "disconnected",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
