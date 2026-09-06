import logging
import multiprocessing
import os
import signal
import sys
import time
import uvicorn
from shared.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dealflow360.runner")


def run_recommendation():
    """Run recommendation engine on port 8001."""
    port = int(os.environ.get("RECOMMENDATION_PORT", 8001))
    host = os.environ.get("HOST", "0.0.0.0")
    logger.info(f"Starting recommendation engine on {host}:{port}")
    uvicorn.run(
        "recommendation.main:app",
        host=host,
        port=port,
        log_level="info",
    )


def run_ai_salesman():
    """Run AI salesman service on port 8002."""
    port = int(os.environ.get("AI_SALESMAN_PORT", settings.AI_SALESMAN_PORT or 8002))
    host = os.environ.get("AI_SALESMAN_HOST", settings.AI_SALESMAN_HOST or "0.0.0.0")
    logger.info(f"Starting AI salesman service on {host}:{port}")
    uvicorn.run(
        "ai_salesman.main:app",
        host=host,
        port=port,
        log_level="info",
    )


def main():
    service = os.environ.get("SERVICE", "all").lower()

    if service == "recommendation":
        run_recommendation()
        return
    elif service in ("ai_salesman", "ai-salesman"):
        run_ai_salesman()
        return

    logger.info("Starting unified DealFlow360 Python Services (recommendation:8001 + ai_salesman:8002)...")
    p_rec = multiprocessing.Process(target=run_recommendation, name="recommendation-service")
    p_ai = multiprocessing.Process(target=run_ai_salesman, name="ai-salesman-service")

    p_rec.start()
    p_ai.start()

    def shutdown(signum, frame):
        logger.info(f"Received signal {signum}, gracefully shutting down child services...")
        for p in (p_rec, p_ai):
            if p.is_alive():
                p.terminate()
        p_rec.join(timeout=5)
        p_ai.join(timeout=5)
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    while True:
        if not p_rec.is_alive():
            logger.error("Recommendation service exited unexpectedly.")
            if p_ai.is_alive():
                p_ai.terminate()
            sys.exit(p_rec.exitcode if p_rec.exitcode is not None else 1)
        if not p_ai.is_alive():
            logger.error("AI Salesman service exited unexpectedly.")
            if p_rec.is_alive():
                p_rec.terminate()
            sys.exit(p_ai.exitcode if p_ai.exitcode is not None else 1)
        time.sleep(1)


if __name__ == "__main__":
    main()
