"""Sarvam AI Bulbul text-to-speech client.

Used ONLY to read voice-query answers aloud in a proper Indian-language
voice (see CLAUDE.md "Voice and streaming"). This is a pure enhancement on
top of the browser's window.speechSynthesis, never a hard dependency:

- If SARVAM_API_KEY is unset, or the API call fails for any reason, this
  raises TTSUnavailableError and the frontend falls back to the browser's
  own speech synthesis.
- The answer text is always shown regardless of whether either voice
  succeeds — TTS is cosmetic, not part of the facts-only answer contract.
"""

from __future__ import annotations

import base64
import logging
from functools import lru_cache

import httpx

from app.core.config import settings
from app.schemas.common import Language

logger = logging.getLogger(__name__)

_SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
_MODEL = "bulbul:v3"
_SPEAKER = "simran"
_AUDIO_CODEC = "mp3"
_TIMEOUT_S = 15.0

_LANGUAGE_CODES: dict[Language, str] = {
    Language.en: "en-IN",
    Language.gu: "gu-IN",
    Language.hi: "hi-IN",
}

_CONTENT_TYPES: dict[str, str] = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
}


class TTSUnavailableError(Exception):
    """Raised when Sarvam TTS cannot produce audio — callers must fall back."""


@lru_cache(maxsize=128)
def _fetch_audio_bytes(text: str, language: Language) -> bytes:
    """Call the Sarvam TTS REST API. Cached (identical answers get replayed
    without re-billing credits). A raised exception is never cached —
    functools.lru_cache only memoizes successful returns.
    """
    if not settings.SARVAM_API_KEY:
        raise TTSUnavailableError("SARVAM_API_KEY is not configured")

    payload = {
        "text": text,
        "language_code": _LANGUAGE_CODES.get(language, "en-IN"),
        "model": _MODEL,
        "speaker": _SPEAKER,
        "output_audio_codec": _AUDIO_CODEC,
    }
    headers = {"api-subscription-key": settings.SARVAM_API_KEY}

    try:
        response = httpx.post(_SARVAM_TTS_URL, json=payload, headers=headers, timeout=_TIMEOUT_S)
        response.raise_for_status()
        data = response.json()
        audios = data.get("audios") or []
        if not audios:
            raise TTSUnavailableError("Sarvam TTS returned no audio")
        return base64.b64decode(audios[0])
    except TTSUnavailableError:
        raise
    except Exception as exc:
        logger.warning("Sarvam TTS request failed: %s", exc)
        raise TTSUnavailableError(str(exc)) from exc


def synthesize_speech(text: str, language: Language) -> tuple[bytes, str]:
    """Return (audio_bytes, content_type) for the given text/language.

    Raises TTSUnavailableError on any failure — callers (the /voice/speak
    route) turn that into a 503 so the frontend can fall back cleanly.
    """
    audio_bytes = _fetch_audio_bytes(text, language)
    return audio_bytes, _CONTENT_TYPES.get(_AUDIO_CODEC, "audio/mpeg")
