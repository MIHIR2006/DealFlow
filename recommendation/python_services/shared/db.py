import logging
from typing import Optional
import asyncpg
from shared.config import settings

logger = logging.getLogger(__name__)

pool: Optional[asyncpg.Pool] = None


async def init_pool() -> None:
    """Initialize asyncpg connection pool."""
    global pool
    if pool is None:
        try:
            pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=settings.DB_MIN_CONNECTIONS,
                max_size=settings.DB_MAX_CONNECTIONS,
                command_timeout=settings.DB_COMMAND_TIMEOUT,
            )
            logger.info("Database pool initialized")
        except Exception as exc:
            logger.error(f"Failed to initialize database pool: {exc}")
            raise


async def close_pool() -> None:
    """Close asyncpg connection pool."""
    global pool
    if pool is not None:
        await pool.close()
        pool = None
        logger.info("Database pool closed")


async def get_pool() -> asyncpg.Pool:
    """Get active connection pool or raise RuntimeError."""
    global pool
    if pool is None:
        raise RuntimeError("Database pool not initialized")
    return pool
