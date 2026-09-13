"""Request/response schemas for the voice query feature.

These are NEW schemas (see CLAUDE.md's frozen-contract rule) — they do not
modify any existing schema in this package.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Language


class VoiceQueryRequest(BaseModel):
    run_id: str
    query: str = Field(..., min_length=1, max_length=300)
    language: Language = Language.en
    current_hour_index: int | None = None

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("query cannot be empty or whitespace only")
        return stripped


class VoiceQueryResponse(BaseModel):
    run_id: str
    language: Language
    intent: str
    answer: str
    facts_used: dict
    hour_index: int | None = None
    confidence: Literal["high", "low"]


class SpeakRequest(BaseModel):
    """POST /api/voice/speak — reads text aloud via Sarvam AI Bulbul TTS.

    The response is NOT JSON: it's a raw audio body (see
    app.services.tts.sarvam) with a matching Content-Type, so there is no
    SpeakResponse schema to mirror on the frontend.
    """

    text: str = Field(..., min_length=1, max_length=2500)
    language: Language = Language.en

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("text cannot be empty or whitespace only")
        return stripped
