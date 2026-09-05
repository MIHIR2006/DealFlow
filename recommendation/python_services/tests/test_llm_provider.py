"""Provider selection and the shape of what reaches the customer.

Providers disagree about `content`. OpenAI returns a string; Gemini returns a
list of blocks that mixes answer text with reasoning signatures and tool-call
records. The customer may see the text and nothing else.
"""

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from ai_salesman.agent.llm import LLMConfigurationError, build_chat_model, message_text
from ai_salesman.agent.salesman import _reply_from
from shared.config import DEFAULT_MODELS, settings


# ---------------------------------------------------------------------------
# Flattening provider content
# ---------------------------------------------------------------------------


def test_openai_style_string_content_passes_through():
    assert message_text("The grand total is 159182.") == "The grand total is 159182."


def test_gemini_style_blocks_are_flattened_to_their_text():
    # Verbatim shape returned by gemini-2.5-flash through langchain: the answer
    # text carries an opaque `extras.signature` alongside it.
    content = [
        {
            "type": "text",
            "text": "Your quotation Q-0020 totals 159182.",
            "extras": {"signature": "CswCARFNMg/dEXGJopaque=="},
        }
    ]
    assert message_text(content) == "Your quotation Q-0020 totals 159182."


def test_non_text_blocks_never_reach_the_customer():
    content = [
        {"type": "reasoning", "reasoning": "the customer is asking about totals"},
        {"type": "tool_use", "name": "get_quotation_details", "input": {}},
        {"type": "text", "text": "Your quotation totals 159182."},
    ]
    out = message_text(content)

    assert out == "Your quotation totals 159182."
    for leaked in ("reasoning", "tool_use", "get_quotation_details"):
        assert leaked not in out


def test_flattening_never_emits_a_python_repr():
    # The bug this guards: str() on a block list puts {'type': 'text', ...} --
    # signature blobs included -- straight into the chat bubble.
    content = [{"type": "text", "text": "Hello.", "extras": {"signature": "abc"}}]
    out = message_text(content)

    for repr_marker in ("{", "}", "'type'", "signature"):
        assert repr_marker not in out


def test_empty_and_missing_content_flatten_to_empty():
    assert message_text(None) == ""
    assert message_text([]) == ""
    assert message_text([{"type": "tool_use", "name": "x"}]) == ""


# ---------------------------------------------------------------------------
# Picking the reply out of an agent result
# ---------------------------------------------------------------------------


def test_reply_uses_the_last_message_that_says_something():
    # The final message is a bare tool call with no text of its own.
    result = {
        "messages": [
            HumanMessage(content="what is my total?"),
            AIMessage(content=[{"type": "text", "text": "Your total is 159182."}]),
            AIMessage(content=[{"type": "tool_use", "name": "get_status_update"}]),
        ]
    }
    assert _reply_from(result) == "Your total is 159182."


def test_reply_does_not_reach_back_past_the_customer_s_own_turn():
    # Anything before the customer's message belongs to an earlier turn and is
    # not an answer to what they just asked.
    result = {
        "messages": [
            AIMessage(content="An answer from the previous turn."),
            HumanMessage(content="and now?"),
            AIMessage(content=[{"type": "tool_use", "name": "get_status_update"}]),
        ]
    }
    assert _reply_from(result) == ""


# ---------------------------------------------------------------------------
# Provider selection
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("configured", ["google", "Gemini", "GOOGLE_GENAI", "google-genai"])
def test_gemini_aliases_all_resolve_to_one_provider(monkeypatch, configured):
    monkeypatch.setattr(settings, "LLM_PROVIDER", configured)
    assert settings.llm_provider == "google"


def test_each_provider_has_a_tool_calling_default_model(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL", "")

    monkeypatch.setattr(settings, "LLM_PROVIDER", "google")
    assert settings.llm_model == DEFAULT_MODELS["google"]

    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    assert settings.llm_model == DEFAULT_MODELS["openai"]


def test_an_explicit_model_wins_over_the_default(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "google")
    monkeypatch.setattr(settings, "LLM_MODEL", "gemini-2.5-pro")
    assert settings.llm_model == "gemini-2.5-pro"


def test_an_unknown_provider_fails_loudly(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "definitely-not-a-provider")
    monkeypatch.setattr(settings, "LLM_API_KEY", "key")

    with pytest.raises(LLMConfigurationError) as exc:
        build_chat_model()
    assert "openai and google" in str(exc.value)


def test_an_unknown_provider_is_reported_as_unconfigured(monkeypatch):
    # No default model exists for it, so the portal hides the assistant rather
    # than offering a control that fails on the first message.
    monkeypatch.setattr(settings, "LLM_PROVIDER", "definitely-not-a-provider")
    monkeypatch.setattr(settings, "LLM_MODEL", "")
    monkeypatch.setattr(settings, "LLM_API_KEY", "key")

    assert settings.llm_configured is False


def test_a_placeholder_key_is_not_a_key(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "google")
    monkeypatch.setattr(settings, "LLM_API_KEY", "your_openai_api_key_here")
    assert settings.llm_configured is False

    monkeypatch.setattr(settings, "LLM_API_KEY", "   ")
    assert settings.llm_configured is False
