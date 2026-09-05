"""The assistant's contract with the DealFlow360 backend.

Every fixture here is a verbatim response shape from the Go handlers:
dto.PortalQuotation for the portal document, and apierr's {"error": {...}}
envelope for a rejection. These are the seams where the assistant reads the
backend, and where a drift in either direction goes unnoticed until a customer
is told something wrong.
"""

import httpx
import pytest

from ai_salesman.agent.prompt import build_system_prompt
from ai_salesman.agent.tools import STATUS_MESSAGES, build_tools, format_quotation
from ai_salesman.backend_client import (
    BackendRequestError,
    DealFlowBackendClient,
    PortalAccessError,
    _detail,
)
from shared.config import settings


# A portal document exactly as dto.PortalQuotation serialises it: flat, with
# no cost, margin, ceiling, risk score, tier, or approval chain.
PORTAL_QUOTATION = {
    "reference": "Q-2026-0042",
    "status": "UNDER_NEGOTIATION",
    "customer_name": "Acme Corporation",
    "customer_email": "ap@acme.test",
    "expires_at": "2026-09-20T00:00:00Z",
    "order_discount_pct": "5",
    "awaiting_review": False,
    "can_confirm": True,
    "lines": [
        {
            "id": 11,
            "position": 0,
            "product_name": "Enterprise Laptop",
            "qty": "2",
            "unit_price": "45000.00",
            "discount_pct": "12",
            "list_value": "90000.00",
            "discount_amount": "10800.00",
            "net_amount": "79200.00",
            "tax_amount": "0.00",
            "line_type": "ONETIME",
        }
    ],
    "totals": {
        "list_subtotal": "90000.00",
        "discount_total": "10800.00",
        "net_subtotal": "79200.00",
        "tax_total": "0.00",
        "grand_total": "79200.00",
        "one_time_total": "79200.00",
        "recurring_total_per_period": "0.00",
    },
    "messages": [],
    "counter_offers": [],
}


def tool_named(tools, name):
    for t in tools:
        if t.name == name:
            return t
    return None


# ---------------------------------------------------------------------------
# Reading the portal document
# ---------------------------------------------------------------------------


def test_format_quotation_reads_the_flat_portal_document():
    out = format_quotation(PORTAL_QUOTATION)

    # The reference and status must survive: the assistant states them back.
    assert "Q-2026-0042" in out
    assert "UNDER_NEGOTIATION" in out
    assert "Acme Corporation" in out
    assert "79200.00" in out

    # Line detail, including the id the discount tool needs to target a line.
    assert "Enterprise Laptop" in out
    assert "line_id=11" in out
    assert "discount=12%" in out


def test_format_quotation_never_invents_internal_figures():
    out = format_quotation(PORTAL_QUOTATION).lower()

    # None of these are on the customer-facing document, and inventing a
    # placeholder for one would put it in front of a customer.
    for internal in ("margin", "ceiling", "unit_cost", "risk", "tier"):
        assert internal not in out, f"{internal!r} leaked into the assistant's context"


def test_format_quotation_survives_an_empty_quotation():
    out = format_quotation({"reference": "Q-1", "status": "SENT", "lines": [], "totals": {}})
    assert "No items in quotation" in out


# ---------------------------------------------------------------------------
# The error envelope
# ---------------------------------------------------------------------------


def test_detail_reads_the_backend_error_envelope():
    response = httpx.Response(
        409,
        json={"error": {"code": "CONFLICT", "message": "this quotation is no longer open for negotiation"}},
        request=httpx.Request("POST", "http://backend/x"),
    )
    exc = httpx.HTTPStatusError("conflict", request=response.request, response=response)

    assert _detail(exc) == "this quotation is no longer open for negotiation"


def test_detail_falls_back_when_the_body_is_not_the_envelope():
    response = httpx.Response(500, text="upstream exploded", request=httpx.Request("POST", "http://backend/x"))
    exc = httpx.HTTPStatusError("boom", request=response.request, response=response)

    assert "upstream exploded" in _detail(exc)


# ---------------------------------------------------------------------------
# Tools against a stubbed backend
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_backend(monkeypatch):
    """Drive DealFlowBackendClient against an in-process backend."""

    routes = {}

    def handler(request: httpx.Request) -> httpx.Response:
        # Matched on suffix: BACKEND_BASE_URL carries the /api/v1 prefix the
        # real backend serves under, and these tests should not restate it.
        for (method, suffix), respond in routes.items():
            if request.method == method and request.url.path.endswith(suffix):
                return respond(request)
        return httpx.Response(404, json={"error": {"message": "no route"}})

    real = httpx.AsyncClient

    def patched(*args, **kwargs):
        kwargs.setdefault("transport", httpx.MockTransport(handler))
        return real(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    return routes


@pytest.mark.asyncio
async def test_counter_offer_reads_the_outcome_from_the_returned_quotation(mock_backend):
    """The counter-offer route returns the whole refreshed quotation.

    The outcome of the proposal just made is the head of counter_offers, which
    the backend returns newest first. Reading a top-level "outcome" -- which
    the route has never sent -- would report UNKNOWN for every discount.
    """
    quotation = dict(PORTAL_QUOTATION)
    quotation["counter_offers"] = [
        {"id": 9, "line_id": 11, "previous_discount_pct": "12",
         "proposed_discount_pct": "18", "outcome": "ROUTED_FOR_APPROVAL", "created_at": "2026-09-06T00:00:00Z"},
        {"id": 8, "line_id": 11, "previous_discount_pct": "0",
         "proposed_discount_pct": "12", "outcome": "AUTO_ACCEPTED", "created_at": "2026-09-05T00:00:00Z"},
    ]
    mock_backend[("POST", "/portal/q/tok-123/counter-offer")] = lambda r: httpx.Response(200, json=quotation)

    tools = build_tools(DealFlowBackendClient("tok-123"))
    result = await tool_named(tools, "submit_counter_offer").ainvoke(
        {"line_id": 11, "proposed_discount_pct": 18.0, "note": "volume"}
    )

    assert "OUTCOME=ROUTED_FOR_APPROVAL" in result
    # The customer is told it is under review, never why.
    for internal in ("risk", "overage", "threshold", "ceiling"):
        assert internal not in result.lower()


@pytest.mark.asyncio
async def test_counter_offer_reports_a_rejection_in_the_backend_s_own_words(mock_backend):
    mock_backend[("POST", "/portal/q/tok-123/counter-offer")] = lambda r: httpx.Response(
        409, json={"error": {"code": "CONFLICT", "message": "this quotation is no longer open for negotiation"}}
    )

    tools = build_tools(DealFlowBackendClient("tok-123"))
    result = await tool_named(tools, "submit_counter_offer").ainvoke(
        {"line_id": 11, "proposed_discount_pct": 18.0, "note": ""}
    )

    assert "no longer open for negotiation" in result


@pytest.mark.asyncio
async def test_an_expired_link_is_reported_as_such_not_as_an_error(mock_backend):
    mock_backend[("GET", "/portal/q/tok-123")] = lambda r: httpx.Response(
        404, json={"error": {"code": "NOT_FOUND", "message": "this link is invalid or has expired"}}
    )

    tools = build_tools(DealFlowBackendClient("tok-123"))
    result = await tool_named(tools, "get_quotation_details").ainvoke({"query": ""})

    assert "no longer valid" in result.lower()


@pytest.mark.asyncio
async def test_get_quotation_raises_portal_access_error_for_a_dead_token(mock_backend):
    mock_backend[("GET", "/portal/q/tok-123")] = lambda r: httpx.Response(404, json={"error": {"message": "gone"}})

    with pytest.raises(PortalAccessError):
        await DealFlowBackendClient("tok-123").get_quotation()


@pytest.mark.asyncio
async def test_status_update_uses_the_flat_status_field(mock_backend):
    quotation = dict(PORTAL_QUOTATION, status="PENDING_APPROVAL")
    mock_backend[("GET", "/portal/q/tok-123")] = lambda r: httpx.Response(200, json=quotation)

    tools = build_tools(DealFlowBackendClient("tok-123"))
    result = await tool_named(tools, "get_status_update").ainvoke({"query": ""})

    assert result == STATUS_MESSAGES["PENDING_APPROVAL"]


# ---------------------------------------------------------------------------
# Confirmation is gated
# ---------------------------------------------------------------------------


def test_confirm_is_not_offered_by_default(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_ASSISTANT_CONFIRM", False)
    names = [t.name for t in build_tools(DealFlowBackendClient("tok-123"))]

    assert "confirm_quotation" not in names
    # Everything a negotiation needs is still there.
    assert {"get_quotation_details", "submit_counter_offer", "get_status_update"} <= set(names)


def test_confirm_is_offered_when_an_operator_opts_in(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_ASSISTANT_CONFIRM", True)
    names = [t.name for t in build_tools(DealFlowBackendClient("tok-123"))]

    assert "confirm_quotation" in names


# ---------------------------------------------------------------------------
# The prompt
# ---------------------------------------------------------------------------


def test_prompt_omits_governance_when_there_is_none():
    prompt = build_system_prompt("Acme Corporation")

    assert "Acme Corporation" in prompt
    assert "INTERNAL GOVERNANCE" not in prompt
    # With no tier on the portal document, the prompt must not assert one.
    assert "tier customer" not in prompt


def test_prompt_marks_governance_confidential_when_it_is_present():
    prompt = build_system_prompt(
        "Acme Corporation",
        "GOLD",
        {"tiers": [{"tier": "GOLD", "max_discount_pct": "20"}]},
    )

    assert "GOLD: max 20.0%" in prompt
    assert "never share these specific numbers" in prompt
    assert "a GOLD tier customer" in prompt
