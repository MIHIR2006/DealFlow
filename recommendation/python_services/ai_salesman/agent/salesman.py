import logging
from typing import Any, Dict, List

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from shared.config import settings
from ai_salesman.backend_client import DealFlowBackendClient, PortalAccessError
from ai_salesman.agent.llm import LLMConfigurationError, build_chat_model, message_text
from ai_salesman.agent.prompt import build_system_prompt
from ai_salesman.agent.session import session_store
from ai_salesman.agent.tools import build_tools

logger = logging.getLogger(__name__)

# Dynamically support both LangChain classic tools agent and modern factory agent
try:
    from langchain.agents import AgentExecutor, create_openai_tools_agent
    HAVE_CLASSIC = True
except ImportError:
    HAVE_CLASSIC = False

try:
    from langchain.agents.factory import create_agent
    HAVE_FACTORY = True
except ImportError:
    HAVE_FACTORY = False


class AssistantUnavailable(Exception):
    """The assistant has no usable LLM configuration and cannot answer."""


# What the customer is told when a turn fails for a reason that is ours, not
# theirs. It never explains the failure: they cannot act on it, and the portal's
# own counter-offer form is still there.
FALLBACK_REPLY = (
    "Sorry, I could not process that just now. Please try again, or use the "
    "counter-offer form on this page to reach your sales representative."
)


def _reply_from(result: Any) -> str:
    """Pull the customer-facing text out of whatever the agent returned.

    The last message is usually the answer, but it can be a bare tool call with
    no text of its own, so this walks backwards to the last message that
    actually says something.
    """
    if isinstance(result, dict) and result.get("messages"):
        for message in reversed(result["messages"]):
            if isinstance(message, HumanMessage):
                break
            text = message_text(getattr(message, "content", None))
            if text:
                return text
        return ""
    return message_text(getattr(result, "content", result))


async def _load_governance(client: DealFlowBackendClient) -> Dict[str, Any]:
    """Read the internal discount ceilings, if a service account is configured.

    Best effort by design. The assistant never decides a discount itself, so
    missing governance context costs it nothing, and a governance read that
    fails must not take the conversation down with it.
    """
    if not settings.governance_configured:
        return {}
    try:
        return await client.get_governance_rules()
    except Exception as exc:
        logger.warning(f"Governance rules unavailable, continuing without them: {exc}")
        return {}


async def run_salesman(portal_token: str, customer_message: str) -> str:
    """Main entrypoint to run conversational AI salesman for customer portal session.

    Raises:
        PortalAccessError: the token is unknown, revoked, or expired.
        AssistantUnavailable: no LLM credential is configured.
    """
    if not settings.llm_configured:
        raise AssistantUnavailable("LLM_API_KEY is not configured")

    client = DealFlowBackendClient(portal_token)

    # The quotation read is the access check as well as the context load: an
    # invalid token fails here, before any model call, and propagates as a 404
    # rather than becoming a chat reply.
    quotation = await client.get_quotation()

    try:
        customer_name = quotation.get("customer_name") or "Valued Customer"
        governance = await _load_governance(client)

        # Tier is deliberately absent from the customer portal document: it is
        # an input to our own discount policy, not the customer's own detail.
        #
        # The quotation itself goes in, though. It is already loaded above, and
        # putting it in context is what stops the assistant answering "I'm not
        # aware of that" about the document on the customer's own screen.
        system_prompt = build_system_prompt(customer_name, None, governance, quotation)
        tools = build_tools(client)

        llm = build_chat_model()

        history: List[BaseMessage] = session_store.get_history(portal_token)

        # Execute agent based on installed LangChain engine
        if HAVE_CLASSIC:
            prompt = ChatPromptTemplate.from_messages(
                [
                    SystemMessage(content=system_prompt),
                    MessagesPlaceholder(variable_name="chat_history"),
                    ("human", "{input}"),
                    MessagesPlaceholder(variable_name="agent_scratchpad"),
                ]
            )
            agent = create_openai_tools_agent(llm, tools, prompt)
            agent_executor = AgentExecutor(
                agent=agent,
                tools=tools,
                verbose=False,
                max_iterations=5,
            )
            result = await agent_executor.ainvoke(
                {"input": customer_message, "chat_history": history}
            )
            ai_response = message_text(result.get("output", ""))

        elif HAVE_FACTORY:
            agent_executor = create_agent(
                model=llm,
                tools=tools,
                system_prompt=system_prompt,
            )
            input_messages = list(history) + [HumanMessage(content=customer_message)]
            result = await agent_executor.ainvoke({"messages": input_messages})
            ai_response = _reply_from(result)

        else:
            # Direct LLM invocation fallback with tools
            llm_with_tools = llm.bind_tools(tools)
            input_messages = [SystemMessage(content=system_prompt)] + list(history) + [HumanMessage(content=customer_message)]
            res = await llm_with_tools.ainvoke(input_messages)
            ai_response = message_text(res.content)

        if not ai_response:
            # A model can end a turn on a bare tool call with nothing to say.
            # An empty bubble reads as a broken page, so say something true.
            logger.warning("Agent produced no text for this turn; using the fallback reply.")
            ai_response = FALLBACK_REPLY

    except PortalAccessError:
        raise
    except LLMConfigurationError as exc:
        # Misconfiguration, not a transient fault: surface it as unavailable so
        # the portal hides the assistant instead of looping on a broken turn.
        logger.error(f"Assistant is misconfigured: {exc}")
        raise AssistantUnavailable(str(exc)) from exc
    except Exception as exc:
        logger.error(f"Error executing AI salesman: {exc}", exc_info=True)
        ai_response = FALLBACK_REPLY

    # Persist messages to session store
    session_store.append_messages(
        portal_token,
        [
            HumanMessage(content=customer_message),
            AIMessage(content=ai_response),
        ],
    )

    return ai_response
