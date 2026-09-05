"""Chat model construction, one provider at a time.

The assistant is provider-agnostic: it needs a chat model that can call tools,
and nothing more. Keeping the choice here means salesman.py never learns which
vendor is behind it, and adding a provider is one branch plus a dependency.

Imports are deliberately lazy. A deployment that runs Gemini should not have to
install the OpenAI package to start.
"""

from typing import Any

from shared.config import settings


class LLMConfigurationError(Exception):
    """The configured provider or model cannot be built."""


def build_chat_model() -> Any:
    """Build the chat model for the configured provider.

    Raises:
        LLMConfigurationError: the provider is unknown, or its integration
            package is not installed.
    """
    provider = settings.llm_provider
    model = settings.llm_model

    if provider == "google":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as exc:
            raise LLMConfigurationError(
                "LLM_PROVIDER=google needs the langchain-google-genai package"
            ) from exc

        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=settings.LLM_API_KEY,
            temperature=0.2,
        )

    if provider == "openai":
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as exc:
            raise LLMConfigurationError(
                "LLM_PROVIDER=openai needs the langchain-openai package"
            ) from exc

        return ChatOpenAI(
            model=model,
            api_key=settings.LLM_API_KEY,
            temperature=0.2,
        )

    raise LLMConfigurationError(
        f"unknown LLM_PROVIDER {provider!r}; supported providers are openai and google"
    )


def message_text(content: Any) -> str:
    """Flatten a chat message's content down to the text a customer may read.

    Providers disagree about the shape of `content`. OpenAI returns a plain
    string; Gemini returns a list of blocks, some of which are text and some of
    which are reasoning signatures and tool-call records. Stringifying that list
    would put a Python repr -- signature blobs included -- in front of a
    customer, so only text blocks survive.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if text:
                    parts.append(str(text))
        return "\n".join(parts).strip()

    return str(content).strip()
