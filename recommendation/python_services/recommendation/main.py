import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.db import close_pool, init_pool
from recommendation.routers.recommend import router as recommend_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dealflow360.recommendation.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager to initialize and teardown database pool."""
    logger.info("Starting DealFlow360 Recommendation Engine...")
    await init_pool()
    yield
    logger.info("Shutting down DealFlow360 Recommendation Engine...")
    await close_pool()


app = FastAPI(
    title="DealFlow360 Recommendation Engine",
    description="Real-time Upsell and Cross-Sell Recommendation Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(recommend_router)
