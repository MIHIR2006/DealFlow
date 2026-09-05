from typing import Any, Dict, List, Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from ai_salesman.backend_client import DealFlowBackendClient


class SubmitCounterOfferInput(BaseModel):
    line_id: Optional[int] = Field(default=None, description="The ID of the specific quotation line to apply the discount to, or None for entire order")
    proposed_discount_pct: float = Field(..., description="The requested discount percentage (e.g. 15.0 for 15%)")
    note: str = Field(default="", description="Brief reason provided by the customer for this discount request")


class SendCustomerMessageInput(BaseModel):
    message_body: str = Field(..., description="The message content to send")
    line_id: Optional[int] = Field(default=None, description="Line ID if the message is about a specific product line")


def build_tools(client: DealFlowBackendClient) -> List[Any]:
    """Build LangChain tools bound to the given portal client session."""

    @tool
    async def get_quotation_details(query: str = "") -> str:
        """Fetch the current state of the quotation — all line items, prices, discounts, and totals.
        Call this when the customer asks what is in their quote, what the current price is,
        or anything about the quotation contents."""
        try:
            data = await client.get_quotation()
            quote_data = data.get("quotation", data)
            header = quote_data.get("header", {})
            lines = quote_data.get("lines", [])

            ref = header.get("reference", "N/A")
            status = header.get("status", "N/A")
            customer_name = header.get("customer_name", "Valued Customer")
            customer_tier = header.get("customer_tier", "Standard")
            grand_total = header.get("grand_total", "0.00")
            margin_pct = header.get("margin_pct", "0.0")

            formatted_lines = []
            for l in lines:
                p_name = l.get("product_name", l.get("name", "Product"))
                qty = l.get("qty", 1)
                unit_price = l.get("unit_price", 0)
                line_disc = l.get("line_discount_pct", 0)
                net = l.get("net_amount", 0)
                ceiling = l.get("ceiling_pct", "N/A")
                lid = l.get("id", l.get("line_id", "N/A"))
                formatted_lines.append(
                    f"  - {p_name}: qty={qty}, unit_price={unit_price}, discount={line_disc}%, "
                    f"net={net}, ceiling_allowed={ceiling}%, line_id={lid}"
                )

            lines_str = "\n".join(formatted_lines) if formatted_lines else "  - No items in quotation"

            return (
                f"Quotation: {ref} | Status: {status}\n"
                f"Customer: {customer_name} ({customer_tier} tier)\n"
                f"Grand Total: {grand_total} | Margin: {margin_pct}%\n"
                f"Lines:\n{lines_str}"
            )
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
            result = await client.submit_counter_offer(
                line_id=line_id,
                proposed_discount_pct=proposed_discount_pct,
                note=note,
            )
            outcome = result.get("outcome", "UNKNOWN")
            req_level = result.get("required_level", "MANAGER")

            if outcome == "AUTO_ACCEPTED":
                target = f"line {line_id}" if line_id else "the order"
                return f"OUTCOME=AUTO_ACCEPTED. The {proposed_discount_pct}% discount has been applied to {target}."
            elif outcome == "ROUTED_FOR_APPROVAL":
                return f"OUTCOME=ROUTED_FOR_APPROVAL. The request for {proposed_discount_pct}% has been submitted for internal review. Required level: {req_level}."
            else:
                return f"OUTCOME=UNKNOWN. Raw: {result}"
        except Exception as exc:
            return f"Error submitting discount request: {str(exc)}"

    @tool
    async def get_status_update(query: str = "") -> str:
        """Check the current status of the quotation and any pending requests.
        Call this when the customer asks for an update, asks if their discount was approved,
        or asks what is happening with their order."""
        try:
            data = await client.get_quotation()
            quote_data = data.get("quotation", data)
            header = quote_data.get("header", {})
            status = header.get("status", "DRAFT")

            status_map = {
                "DRAFT": "Your quotation is being prepared.",
                "PENDING_APPROVAL": "Your request is currently under internal review. We will notify you once a decision is made.",
                "APPROVED": "Your quotation has been approved and is ready for your confirmation.",
                "SENT": "Your quotation has been sent and is awaiting your review.",
                "UNDER_NEGOTIATION": "Your quotation is under active negotiation.",
                "CONFIRMED": "Your quotation has been confirmed and your order is being processed.",
                "REJECTED": "Your quotation request was not approved. Please contact your sales representative for further assistance.",
            }
            return status_map.get(status, f"Your quotation status is currently: {status}.")
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
        except ValueError as val_err:
            return f"Unable to confirm at this time: {str(val_err)}. The quotation may be pending approval."
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
        except Exception as exc:
            return f"Error recording message: {str(exc)}"

    return [
        get_quotation_details,
        submit_counter_offer,
        get_status_update,
        confirm_quotation,
        send_customer_message,
    ]
