"""Gemini client for the Powerloom Energy Assistant Chatbot.

STRICT REQUIREMENT:
- Uses ONLY settings.GEMINI_API_KEY_1.
- Never falls back to GEMINI_API_KEY or any other environment variable.
- Fails with ChatConfigurationError if GEMINI_API_KEY_1 is missing or empty.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.config import settings
from app.services.chat.prompts import build_system_instruction_with_context

__all__ = [
    "CHAT_MAX_OUTPUT_TOKENS",
    "CHAT_MODEL",
    "CHAT_TEMPERATURE",
    "CHAT_TIMEOUT_S",
    "ChatConfigurationError",
    "ChatServiceError",
    "generate_chat_response",
]

if TYPE_CHECKING:
    from app.schemas.chat import ChatMessage

logger = logging.getLogger(__name__)

CHAT_MODEL = "gemini-3.6-flash"
CHAT_TIMEOUT_S = 15.0
CHAT_TEMPERATURE = 0.3
CHAT_MAX_OUTPUT_TOKENS = 1024


class ChatConfigurationError(Exception):
    """Raised when GEMINI_API_KEY_1 is not configured in backend environment."""


class ChatServiceError(Exception):
    """Raised when Gemini API request fails or returns an invalid response."""


def generate_chat_response(
    message: str,
    context_text: str,
    history: list[ChatMessage] | None = None,
    max_output_tokens: int = CHAT_MAX_OUTPUT_TOKENS,
    thinking_budget: int | None = None,
) -> str:
    """Generate a grounded response using Gemini with GEMINI_API_KEY_1.

    Parameters
    ----------
    message : str
        The latest user message.
    context_text : str
        The formatted Powerloom microgrid context string.
    history : list[ChatMessage] | None
        Previous chat messages in the conversation.
    max_output_tokens : int
        Overrides CHAT_MAX_OUTPUT_TOKENS — e.g. the voice feature's general
        Q&A path (routes/voice.py) asks for a much shorter cap than the chat
        widget, since its answers must be short and speakable.
    thinking_budget : int | None
        If given, sets Gemini's thinking token budget explicitly (0 disables
        it). Left as the model default (None) for the chat widget; the voice
        feature passes 0 because a "thinking" model can otherwise spend the
        whole (small) max_output_tokens budget on internal reasoning and
        return a truncated visible answer.

    Returns
    -------
    str
        The grounded assistant response.

    Raises
    ------
    ChatConfigurationError
        If GEMINI_API_KEY_1 is missing or empty.
    ChatServiceError
        If Gemini API call fails or encounters an unrecoverable error.
    """
    # Strict check: ONLY GEMINI_API_KEY_1 is allowed
    api_key = settings.GEMINI_API_KEY_1
    if not api_key or not api_key.strip():
        logger.error("Chatbot failed: GEMINI_API_KEY_1 is missing in backend configuration")
        raise ChatConfigurationError(
            "GEMINI_API_KEY_1 is not configured. Please ensure GEMINI_API_KEY_1 is set in backend/.env."
        )

    try:
        from google import genai
        from google.genai import types as genai_types
    except ImportError as exc:
        logger.error("google-genai SDK not available: %s", exc)
        raise ChatServiceError("Google GenAI SDK is not installed on the server.") from exc

    try:
        client = genai.Client(api_key=api_key)
    except Exception as exc:
        logger.error("Failed to initialize Gemini client with GEMINI_API_KEY_1: %s", exc)
        raise ChatServiceError("Failed to initialize Gemini client.") from exc

    # Prepare system instruction combined with dynamic Powerloom context
    system_instruction = build_system_instruction_with_context(context_text)

    # Build multi-turn contents
    contents: list[genai_types.Content] = []

    if history:
        for msg in history:
            role = "user" if msg.role == "user" else "model"
            contents.append(
                genai_types.Content(
                    role=role,
                    parts=[genai_types.Part.from_text(text=msg.content)],
                )
            )

    # Add the current user query
    contents.append(
        genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=message)],
        )
    )

    try:
        response = client.models.generate_content(
            model=CHAT_MODEL,
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=CHAT_TEMPERATURE,
                max_output_tokens=max_output_tokens,
                thinking_config=(
                    genai_types.ThinkingConfig(thinking_budget=thinking_budget)
                    if thinking_budget is not None
                    else None
                ),
                http_options=genai_types.HttpOptions(timeout=int(CHAT_TIMEOUT_S * 1000)),
            ),
        )

        response_text = (response.text or "").strip()
        if not response_text:
            raise ChatServiceError("Received an empty response from Gemini.")

        return response_text

    except ChatServiceError:
        raise
    except Exception as exc:
        logger.exception("Gemini API call failed during chat generation: %s", exc)
        raise ChatServiceError(f"Gemini generation error: {exc}") from exc
