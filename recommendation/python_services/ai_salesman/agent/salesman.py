import asyncio
import logging
from typing import Any, Dict, List

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from shared.config import settings
from ai_salesman.backend_client import DealFlowBackendClient
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


async def run_salesman(portal_token: str, customer_message: str) -> str:
    """Main entrypoint to run conversational AI salesman for customer portal session."""
    client = DealFlowBackendClient(portal_token)

    try:
        # 1. Fetch live quotation and governance rules in parallel
        quotation_data, governance_data = await asyncio.gather(
            client.get_quotation(),
            client.get_governance_rules(),
        )

        quote = quotation_data.get("quotation", quotation_data)
        header = quote.get("header", {})
        customer_name = header.get("customer_name", "Valued Customer")
        customer_tier = header.get("customer_tier", "Standard")

        # 2. Build system prompt & tools
        system_prompt = build_system_prompt(customer_name, customer_tier, governance_data)
        tools = build_tools(client)

        # 3. Instantiate LLM
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.LLM_API_KEY,
            temperature=0.2,
        )

        # 4. Load session conversation history
        history: List[BaseMessage] = session_store.get_history(portal_token)

        # 5. Execute agent based on installed LangChain engine
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
            ai_response = str(result.get("output", ""))

        elif HAVE_FACTORY:
            agent_executor = create_agent(
                model=llm,
                tools=tools,
                system_prompt=system_prompt,
            )
            input_messages = list(history) + [HumanMessage(content=customer_message)]
            result = await agent_executor.ainvoke({"messages": input_messages})
            if isinstance(result, dict) and "messages" in result and result["messages"]:
                ai_response = str(result["messages"][-1].content)
            else:
                ai_response = str(result)

        else:
            # Direct LLM invocation fallback with tools
            llm_with_tools = llm.bind_tools(tools)
            input_messages = [SystemMessage(content=system_prompt)] + list(history) + [HumanMessage(content=customer_message)]
            res = await llm_with_tools.ainvoke(input_messages)
            ai_response = str(res.content)

    except Exception as exc:
        logger.error(f"Error executing AI salesman: {exc}", exc_info=True)
        ai_response = (
            "I'm sorry, I encountered an issue processing your request. "
            "Please try again or contact your sales representative."
        )

    # 6. Persist messages to session store
    session_store.append_messages(
        portal_token,
        [
            HumanMessage(content=customer_message),
            AIMessage(content=ai_response),
        ],
    )

    return ai_response
