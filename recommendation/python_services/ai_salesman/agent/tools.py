from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from shared.config import settings
from ai_salesman.backend_client import (
    BackendRequestError,
    DealFlowBackendClient,
    PortalAccessError,
)

# The customer portal document is flat: reference, status, lines, totals,
# messages, counter_offers. It carries no cost, margin, discount ceiling,
# risk score, or approval chain -- those are internal facts the backend
# deliberately withholds from this surface (see dto/portal.go). Nothing here
# may invent them.

STATUS_MESSAGES = {
    "DRAFT": "Your quotation is being prepared.",
    "PENDING_APPROVAL": "Your request is currently under internal review. We will notify you once a decision is made.",
    "APPROVED": "Your quotation has been approved and is ready for your confirmation.",
    "SENT": "Your quotation has been sent and is awaiting your review.",
    "UNDER_NEGOTIATION": "Your quotation is under active negotiation.",
    "CONFIRMED": "Your quotation has been confirmed and your order is being processed.",
    "REJECTED": "Your quotation request was not approved. Please contact your sales representative for further assistance.",
}


class SubmitCounterOfferInput(BaseModel):
    line_id: Optional[int] = Field(default=None, description="The ID of the specific quotation line to apply the discount to, or None for entire order")
    proposed_discount_pct: float = Field(..., description="The requested discount percentage (e.g. 15.0 for 15%)")
    note: str = Field(default="", description="Brief reason provided by the customer for this discount request")


class SendCustomerMessageInput(BaseModel):
    message_body: str = Field(..., description="The message content to send")
    line_id: Optional[int] = Field(default=None, description="Line ID if the message is about a specific product line")


def inr(value: Any) -> str:
    """Format an amount the way the portal shows it: en-IN grouping, no padding.

    Mirrors `inr()` in the frontend's lib/hooks.ts. The assistant reads amounts
    back to a customer who is looking at the page, so "184221.6" beside a page
    saying "Rs 1,84,221.6" reads as a different number. Presentation only -- the
    value is still whatever the backend sent.
    """
    try:
        n = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return "\u20b90"

    sign = "-" if n < 0 else ""
    n = abs(n)
    whole = int(n)
    frac = (n - whole).quantize(Decimal("0.01")).normalize()

    # Indian grouping: last three digits, then pairs.
    digits = str(whole)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        grouped = ",".join(groups) + "," + tail
    else:
        grouped = digits

    out = f"\u20b9{sign}{grouped}"
    if frac:
        out += str(frac).lstrip("0")
    return out


def format_quotation(quote: Dict[str, Any]) -> str:
    """Render the portal document as compact text for the model."""
    lines = quote.get("lines", []) or []
    totals = quote.get("totals", {}) or {}

    formatted_lines = []
    for line in lines:
        formatted_lines.append(
            f"  - {line.get('product_name', 'Product')}: "
            f"qty={line.get('qty', 1)}, "
            f"unit_price={inr(line.get('unit_price', 0))}, "
            f"discount={line.get('discount_pct', 0)}%, "
            f"net={inr(line.get('net_amount', 0))}, "
            f"type={line.get('line_type', 'ONETIME')}, "
            f"line_id={line.get('id')}"
        )
    lines_str = "\n".join(formatted_lines) if formatted_lines else "  - No items in quotation"

    return (
        f"Quotation: {quote.get('reference', 'N/A')} | Status: {quote.get('status', 'N/A')}\n"
        f"Customer: {quote.get('customer_name', 'Valued Customer')}\n"
        f"Order-wide discount: {quote.get('order_discount_pct', '0')}%\n"
        f"Grand Total: {inr(totals.get('grand_total', 0))} "
        f"(one-time {inr(totals.get('one_time_total', 0))}, "
        f"recurring per period {inr(totals.get('recurring_total_per_period', 0))})\n"
        f"Awaiting internal review: {bool(quote.get('awaiting_review'))} | "
        f"Ready to confirm: {bool(quote.get('can_confirm'))}\n"
        f"Lines:\n{lines_str}"
    )


def build_tools(client: DealFlowBackendClient) -> List[Any]:
    """Build LangChain tools bound to the given portal client session."""

    @tool
    async def get_quotation_details(query: str = "") -> str:
        """Fetch the current state of the quotation — all line items, prices, discounts, and totals.
        Call this when the customer asks what is in their quote, what the current price is,
        or anything about the quotation contents."""
        try:
            return format_quotation(await client.get_quotation())
        except PortalAccessError:
            return "This quotation link is no longer valid. Ask your sales representative for a fresh link."
        except Exception as exc:
            return f"Error retrieving quotation details: {str(exc)}"

    @tool(args_schema=SubmitCounterOfferInput)
    async def submit_counter_offer(
        line_id: Optional[int] = None,
        proposed_discount_pct: float = 0.0,
        note: str = "",
    ) -> str:
        """Submit a discount request for a specific quotation line. Always call this when the
        customer requests any discount change — never decide yourself if it is acceptable.
        The engine will return AUTO_ACCEPTED (discount applied) or ROUTED_FOR_APPROVAL
        (needs manager review). Report the outcome to the customer."""
        try:
            quote = await client.submit_counter_offer(
                line_id=line_id,
                proposed_discount_pct=proposed_discount_pct,
                note=note,
            )
            # The route returns the refreshed quotation; the proposal just made
            # is the head of counter_offers, which comes back newest first.
            offers = quote.get("counter_offers", []) or []
            outcome = (offers[0].get("outcome") if offers else None) or "UNKNOWN"

            target = f"line {line_id}" if line_id else "the order"
            if outcome == "AUTO_ACCEPTED":
                return f"OUTCOME=AUTO_ACCEPTED. The {proposed_discount_pct}% discount has been applied to {target}."
            if outcome == "ROUTED_FOR_APPROVAL":
                return (
                    f"OUTCOME=ROUTED_FOR_APPROVAL. The request for {proposed_discount_pct}% on {target} "
                    "has been submitted for internal review."
                )
            return f"OUTCOME={outcome}. The request for {proposed_discount_pct}% on {target} was recorded."
        except PortalAccessError:
            return "This quotation link is no longer valid, so no discount request could be submitted."
        except BackendRequestError as exc:
            return f"The discount request was not accepted: {str(exc)}"
        except Exception as exc:
            return f"Error submitting discount request: {str(exc)}"

    @tool
    async def get_status_update(query: str = "") -> str:
        """Check the current status of the quotation and any pending requests.
        Call this when the customer asks for an update, asks if their discount was approved,
        or asks what is happening with their order."""
        try:
            quote = await client.get_quotation()
            status = quote.get("status", "DRAFT")
            return STATUS_MESSAGES.get(status, f"Your quotation status is currently: {status}.")
        except PortalAccessError:
            return "This quotation link is no longer valid. Ask your sales representative for a fresh link."
        except Exception as exc:
            return f"Error checking status: {str(exc)}"

    @tool
    async def confirm_quotation(query: str = "") -> str:
        """Confirm the quotation on behalf of the customer. Only call this when the customer
        has explicitly stated they want to confirm or accept the quotation. Do not call this
        based on vague agreement — the customer must clearly say confirm, accept, or proceed."""
        try:
            await client.confirm_quotation()
            return "The quotation has been confirmed. Your order is now being processed and fulfillment will begin shortly."
        except PortalAccessError:
            return "This quotation link is no longer valid, so it could not be confirmed."
        except BackendRequestError as exc:
            return f"Unable to confirm at this time: {str(exc)}"
        except Exception as exc:
            return f"Error confirming quotation: {str(exc)}"

    @tool(args_schema=SendCustomerMessageInput)
    async def send_customer_message(message_body: str, line_id: Optional[int] = None) -> str:
        """Send a message or question about the quotation. Use this when the customer asks a
        question that requires logging (e.g., shipping question, delivery batch question)
        that is not a discount request and not a status check."""
        try:
            await client.send_message(body=message_body, line_id=line_id)
            return "Your message has been recorded. The sales team will be notified."
        except PortalAccessError:
            return "This quotation link is no longer valid, so the message could not be recorded."
        except BackendRequestError as exc:
            return f"The message was not recorded: {str(exc)}"
        except Exception as exc:
            return f"Error recording message: {str(exc)}"

    tools: List[Any] = [
        get_quotation_details,
        submit_counter_offer,
        get_status_update,
        send_customer_message,
    ]

    # Confirming is a contractual act. The portal takes it behind an explicit
    # signatory attestation, so the assistant only carries the tool when an
    # operator has deliberately opted in.
    if settings.ALLOW_ASSISTANT_CONFIRM:
        tools.insert(3, confirm_quotation)

    return tools
