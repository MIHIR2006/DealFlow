from typing import Any, Dict, Optional
import httpx
from shared.config import settings


class PortalAccessError(Exception):
    """The portal token is unknown, revoked, or expired.

    The backend answers 404 for all three so it never confirms which tokens
    exist. The assistant carries that through unchanged rather than guessing.
    """


class BackendRequestError(Exception):
    """The backend rejected a request and explained why.

    The message is the backend's own, already written for a customer, so tools
    can hand it straight back to the conversation.
    """


def _detail(exc: httpx.HTTPStatusError) -> str:
    """Pull the customer-facing message out of the backend's error envelope."""
    try:
        body = exc.response.json()
    except Exception:
        return exc.response.text or str(exc)

    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        for key in ("message", "detail"):
            if body.get(key):
                return str(body[key])
    return exc.response.text or str(exc)


class DealFlowBackendClient:
    """Async HTTP client wrapping the core DealFlow360 backend portal and governance routes.

    Every call is scoped to one portal token. The backend resolves the
    quotation from that token and never accepts a quotation id, so this client
    structurally cannot reach another customer's deal.
    """

    def __init__(self, portal_token: str):
        self.portal_token = portal_token
        self.base_url = settings.BACKEND_BASE_URL.rstrip("/")
        self.timeout = settings.BACKEND_TIMEOUT_SECONDS

    async def get_quotation(self) -> Dict[str, Any]:
        """Fetch quotation state for the customer portal token."""
        url = f"{self.base_url}/portal/q/{self.portal_token}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url)
            if resp.status_code in (401, 403, 404):
                raise PortalAccessError("this link is invalid or has expired")
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
        """Submit a discount proposal to trigger the autonomous re-governance engine.

        Returns the refreshed quotation. The outcome of this proposal is the
        head of its counter_offers list, which the backend returns newest
        first.
        """
        url = f"{self.base_url}/portal/q/{self.portal_token}/counter-offer"
        payload: Dict[str, Any] = {
            "proposed_discount_pct": str(proposed_discount_pct),
            "note": note,
        }
        if line_id is not None:
            payload["line_id"] = line_id

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code in (401, 403, 404):
                raise PortalAccessError("this link is invalid or has expired")
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if 400 <= exc.response.status_code < 500:
                    raise BackendRequestError(_detail(exc)) from exc
                raise
            return resp.json()

    async def send_message(self, body: str, line_id: Optional[int] = None) -> Dict[str, Any]:
        """Post a customer negotiation comment or line-level question."""
        url = f"{self.base_url}/portal/q/{self.portal_token}/messages"
        payload: Dict[str, Any] = {"body": body}
        if line_id is not None:
            payload["line_id"] = line_id

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code in (401, 403, 404):
                raise PortalAccessError("this link is invalid or has expired")
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if 400 <= exc.response.status_code < 500:
                    raise BackendRequestError(_detail(exc)) from exc
                raise
            return resp.json()

    async def confirm_quotation(self) -> Dict[str, Any]:
        """Confirm the quotation terms on customer's behalf."""
        url = f"{self.base_url}/portal/q/{self.portal_token}/confirm"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url)
            if resp.status_code in (401, 403, 404):
                raise PortalAccessError("this link is invalid or has expired")
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if 400 <= exc.response.status_code < 500:
                    raise BackendRequestError(_detail(exc)) from exc
                raise
            return resp.json()
