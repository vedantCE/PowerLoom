"""Gemini client for the explainer.

Design rules (non-negotiable):
- The LLM only rewrites structured facts into a sentence; it never makes or
  infers dispatch decisions.
- Every number in the output must come from the facts payload; the model is
  instructed not to invent any figure.
- Falls back to templates if: GEMINI_API_KEY is unset, the API errors, the
  response times out, or the response fails validation.
- Logs which path was used: "explainer_path=gemini" or "explainer_path=template".
"""

from __future__ import annotations

import logging
import re
import unicodedata

from app.core.config import settings
from app.explainer.templates import build_template_explanation
from app.schemas.common import Language

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash"
_TIMEOUT_S = 6.0
_TEMPERATURE = 0.2
_MAX_TOKENS = 120
_MAX_RESPONSE_CHARS = 400

_SYSTEM_INSTRUCTION = (
    "You explain microgrid dispatch decisions to a village operator who is not technical. "
    "Write exactly 2 short sentences. "
    "Use ONLY the numbers provided in the JSON payload — never invent, estimate, or round to "
    "a value not in the data. "
    "Never give advice or recommendations. "
    "Answer in the language explicitly named in the request."
)

# Probe result: None = not yet probed, True = model ok, False = model rejected
_model_ok: bool | None = None


def _probe_model(client) -> bool:  # type: ignore[return]
    """Quick probe to verify the model name is accepted by the API.

    Called once at startup.  Result is cached in _model_ok.
    """
    global _model_ok
    if _model_ok is not None:
        return _model_ok
    try:
        client.models.get(model=_MODEL)
        logger.info("Gemini model probe OK: %s", _MODEL)
        _model_ok = True
    except Exception as exc:
        logger.warning(
            "Gemini model probe failed for '%s' — explainer will use template fallback. "
            "Error: %s",
            _MODEL,
            exc,
        )
        _model_ok = False
    return _model_ok


# ---------------------------------------------------------------------------
# Unicode digit normalization
# Gemini may reply in Gujarati (૦–૯) or Devanagari (०–९).  The number-
# validation guard normalises them to ASCII digits before matching.
# ---------------------------------------------------------------------------

_UNICODE_DIGIT_TABLE = str.maketrans(
    # Gujarati digits ૦–૯
    "૦૧૨૩૪૫૬૭૮૯"
    # Devanagari digits ०–९
    "०१२३४५६७८९",
    "0123456789" * 2,
)


def _normalize_digits(text: str) -> str:
    """Replace Gujarati/Devanagari digits with ASCII equivalents."""
    # First apply the explicit table, then use unicodedata for anything else
    text = text.translate(_UNICODE_DIGIT_TABLE)
    # Fallback: use unicodedata.digit for any remaining non-ASCII digit char
    result = []
    for ch in text:
        if ch.isdigit() and not ch.isascii():
            try:
                result.append(str(unicodedata.digit(ch)))
            except ValueError:
                result.append(ch)
        else:
            result.append(ch)
    return "".join(result)


# ---------------------------------------------------------------------------
# Number extraction
# ---------------------------------------------------------------------------

_NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")


def _extract_numbers(text: str) -> set[float]:
    """Extract all numeric values from text (after digit normalisation)."""
    normalised = _normalize_digits(text)
    return {float(m) for m in _NUMBER_PATTERN.findall(normalised)}


def _facts_numbers(facts: dict) -> set[float]:
    """Extract all numeric values from the facts payload."""
    nums: set[float] = set()
    for v in facts.values():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            nums.add(round(float(v), 1))
            # Also allow ±0.1 rounding variation
            nums.add(round(float(v) + 0.1, 1))
            nums.add(round(float(v) - 0.1, 1))
        elif isinstance(v, list):
            # reason_codes list — skip
            pass
    return nums


def _validate_response(text: str, facts: dict, local_time: str) -> bool:
    """Return True if the response passes all validation checks.

    Checks:
    1. Non-empty.
    2. ≤ MAX_RESPONSE_CHARS characters.
    3. Every number in the response is present in the facts payload
       (within ±0.1 rounding).  Numbers embedded inside the time label
       are excluded from checking.
    """
    if not text or not text.strip():
        logger.debug("Gemini validation failed: empty response")
        return False

    if len(text) > _MAX_RESPONSE_CHARS:
        logger.debug(
            "Gemini validation failed: response too long (%d chars)", len(text)
        )
        return False

    # Remove the time label from the text before number-checking so that
    # year/day numbers in the timestamp (e.g. 2026, 12) are not flagged.
    text_without_time = text.replace(local_time, "") if local_time else text
    response_numbers = _extract_numbers(text_without_time)
    allowed_numbers = _facts_numbers(facts)

    # Always allow 0 and 100 (percentage sentinels that appear naturally)
    allowed_numbers |= {0.0, 100.0, 0.1, 99.9}

    offenders = response_numbers - allowed_numbers
    if offenders:
        logger.debug(
            "Gemini validation failed: numbers not in facts: %s", sorted(offenders)
        )
        return False

    return True


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def explain(facts: dict, reason_codes: list[str], language: Language) -> str:
    """Return a plain-language explanation of the dispatch hour.

    Falls back to templates if Gemini is unavailable or the response is invalid.
    """
    # Fast path: no API key
    if not settings.GEMINI_API_KEY:
        logger.debug("explainer_path=template (no API key)")
        return build_template_explanation(facts, reason_codes, language)

    try:
        from google import genai  # type: ignore[import-untyped]
        from google.genai import types as genai_types  # type: ignore[import-untyped]
    except ImportError:
        logger.warning("google-genai not installed — explainer_path=template")
        return build_template_explanation(facts, reason_codes, language)

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as exc:
        logger.warning("Gemini client init failed: %s — explainer_path=template", exc)
        return build_template_explanation(facts, reason_codes, language)

    # Startup probe (cached after first call)
    if not _probe_model(client):
        return build_template_explanation(facts, reason_codes, language)

    import json

    lang_names = {Language.en: "English", Language.gu: "Gujarati", Language.hi: "Hindi"}
    user_message = (
        f"Language: {lang_names.get(language, 'English')}\n\n"
        f"Facts:\n{json.dumps(facts, ensure_ascii=False, indent=2)}"
    )

    # Try up to 2 attempts (1 retry)
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=_MODEL,
                contents=user_message,
                config=genai_types.GenerateContentConfig(
                    system_instruction=_SYSTEM_INSTRUCTION,
                    temperature=_TEMPERATURE,
                    max_output_tokens=_MAX_TOKENS,
                    http_options=genai_types.HttpOptions(timeout=int(_TIMEOUT_S * 1000)),
                ),
            )
            text = (response.text or "").strip()

            local_time = str(facts.get("local_time", ""))
            if _validate_response(text, facts, local_time):
                logger.info("explainer_path=gemini (attempt=%d)", attempt + 1)
                return text
            else:
                logger.warning(
                    "Gemini response failed validation on attempt %d — %s",
                    attempt + 1,
                    "retrying" if attempt == 0 else "falling back to template",
                )

        except Exception as exc:
            logger.warning(
                "Gemini API error on attempt %d: %s — %s",
                attempt + 1,
                exc,
                "retrying" if attempt == 0 else "falling back to template",
            )

    logger.info("explainer_path=template (gemini exhausted)")
    return build_template_explanation(facts, reason_codes, language)
