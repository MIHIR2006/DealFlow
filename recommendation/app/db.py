import asyncio
import logging
from typing import Any, List, Optional
import asyncpg
from app.config import settings

logger = logging.getLogger("dealflow360.db")

_pool: Optional[asyncpg.Pool] = None
_pool_loop: Optional[asyncio.AbstractEventLoop] = None


async def init_pool() -> Optional[asyncpg.Pool]:
    """Initialize asyncpg connection pool for the current event loop."""
    global _pool, _pool_loop
    current_loop = asyncio.get_running_loop()
    if _pool is None or _pool_loop != current_loop or getattr(_pool, "_closed", False):
        logger.info("Initializing asyncpg connection pool...")
        try:
            _pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=settings.DB_MIN_CONNECTIONS,
                max_size=settings.DB_MAX_CONNECTIONS,
                command_timeout=settings.DB_COMMAND_TIMEOUT,
            )
            _pool_loop = current_loop
            logger.info("Asyncpg connection pool successfully created.")
        except Exception as exc:
            logger.warning(f"Failed to connect to database at {settings.DATABASE_URL}: {exc}")
            _pool = None
            _pool_loop = None
    return _pool


async def close_pool() -> None:
    """Close asyncpg connection pool."""
    global _pool, _pool_loop
    if _pool is not None:
        logger.info("Closing asyncpg connection pool...")
        await _pool.close()
        _pool = None
        _pool_loop = None
        logger.info("Asyncpg connection pool closed.")


async def get_or_init_pool() -> Optional[asyncpg.Pool]:
    """Get active connection pool instance or attempt initialization."""
    global _pool, _pool_loop
    current_loop = asyncio.get_running_loop()
    if _pool is None or _pool_loop != current_loop or getattr(_pool, "_closed", False):
        await init_pool()
    return _pool



def get_pool() -> Optional[asyncpg.Pool]:
    """Get active connection pool instance."""
    return _pool


async def check_db_health() -> bool:
    """Execute a simple query to verify database connectivity."""
    pool = await get_or_init_pool()
    if pool is None:
        return False
    try:
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1")
            return val == 1
    except Exception as exc:
        logger.warning(f"Database health check failed: {exc}")
        return False


async def init_schema_tables() -> None:
    """Create product_recommendations table if not already existing."""
    pool = await get_or_init_pool()
    if pool is None:
        return
    ddl = """
    CREATE TABLE IF NOT EXISTS product_recommendations (
        product_id        INT NOT NULL,
        recommended_id    INT NOT NULL,
        co_purchase_count INT NOT NULL,
        confidence        FLOAT NOT NULL,
        updated_at        TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (product_id, recommended_id)
    );
    CREATE INDEX IF NOT EXISTS idx_product_recommendations_lookup 
    ON product_recommendations (product_id, co_purchase_count DESC);
    """
    try:
        async with pool.acquire() as conn:
            await conn.execute(ddl)
            logger.info("Verified product_recommendations table existence.")
    except Exception as exc:
        logger.warning(f"Could not auto-create product_recommendations table: {exc}")


async def fetch_rows(query: str, *args: Any) -> List[asyncpg.Record]:
    """Execute query and return list of records."""
    pool = await get_or_init_pool()
    if pool is None:
        raise RuntimeError("Database connection pool is not initialized. Check DATABASE_URL in .env.")
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetch_one(query: str, *args: Any) -> Optional[asyncpg.Record]:
    """Execute query and return single record or None."""
    pool = await get_or_init_pool()
    if pool is None:
        raise RuntimeError("Database connection pool is not initialized. Check DATABASE_URL in .env.")
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def execute_query(query: str, *args: Any) -> str:
    """Execute SQL query and return status."""
    pool = await get_or_init_pool()
    if pool is None:
        raise RuntimeError("Database connection pool is not initialized. Check DATABASE_URL in .env.")
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)

