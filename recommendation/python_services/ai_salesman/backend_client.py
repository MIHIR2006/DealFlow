from typing import Any, Dict, Optional
import httpx
from shared.config import settings


class DealFlowBackendClient:
    """Async HTTP client wrapping the core DealFlow360 backend portal and governance routes."""

    def __init__(self, portal_token: str):
        self.portal_token = portal_token
        self.base_url = settings.BACKEND_BASE_URL.rstrip("/")
        self.timeout = 10.0

    async def get_quotation(self) -> Dict[str, Any]:
        """Fetch quotation state for the customer portal token."""
        url = f"{self.base_url}/portal/q/{self.portal_token}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()

    async def get_governance_rules(self) -> Dict[str, Any]:
        """Fetch internal discount tiers and governance ceilings using service account JWT."""
        url = f"{self.base_url}/governance"
        headers = {"Authorization": f"Bearer {settings.SERVICE_ACCOUNT_JWT}"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def submit_counter_offer(
        self,
        line_id: Optional[int],
        proposed_discount_pct: float,
        note: str,
    ) -> Dict[str, Any]:
        """Submit a discount proposal to trigger the autonomous re-governance engine."""
        url = f"{self.base_url}/portal/q/{self.portal_token}/counter-offer"
        payload: Dict[str, Any] = {
            "proposed_discount_pct": str(proposed_discount_pct),
            "note": note,
        }
        if line_id is not None:
            payload["line_id"] = line_id

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def send_message(self, body: str, line_id: Optional[int] = None) -> Dict[str, Any]:
        """Post a customer negotiation comment or line-level question."""
        url = f"{self.base_url}/portal/q/{self.portal_token}/messages"
        payload: Dict[str, Any] = {"body": body}
        if line_id is not None:
            payload["line_id"] = line_id

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def confirm_quotation(self) -> Dict[str, Any]:
        """Confirm the quotation terms on customer's behalf."""
        url = f"{self.base_url}/portal/q/{self.portal_token}/confirm"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.post(url)
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (400, 409):
                    try:
                        err_data = exc.response.json()
                        detail = err_data.get("message") or err_data.get("detail") or str(exc)
                    except Exception:
                        detail = exc.response.text or str(exc)
                    raise ValueError(detail) from exc
                raise
