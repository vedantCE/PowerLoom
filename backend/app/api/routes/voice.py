"""POST /api/voice/query and POST /api/voice/stream — voice-driven Q&A about
a stored plan.

Design rules (see CLAUDE.md "Voice and streaming"):
  - Answers come ONLY from the current plan's stored OptimizeResponse — the
    intent classifier and fact resolvers in app.explainer.intents never call
    an LLM and never invent a number.
  - Gemini only rewrites the resolved facts into a short sentence; its output
    is validated (reusing app.explainer.gemini's number-validation guard) and
    replaced with a deterministic template if it fails.
  - Neither endpoint ever returns 500 for a bad/failed Gemini call — only a
    missing run_id is an error (404).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.config import settings
from app.db.session import get_session
from app.explainer.gemini import _validate_response as _validate_llm_answer
from app.explainer.intents import Intent, classify_intent, resolve_facts
from app.explainer.voice_templates import build_voice_template_answer
from app.models.scenario_run import ScenarioRun
from app.schemas.common import Language
from app.schemas.voice import SpeakRequest, VoiceQueryRequest, VoiceQueryResponse
from app.services.tts.sarvam import TTSUnavailableError, synthesize_speech

logger = logging.getLogger(__name__)
router = APIRouter()

_MODEL = "gemini-2.5-flash"
_TIMEOUT_S = 6.0
_STREAM_TIMEOUT_S = 20.0
_HEARTBEAT_INTERVAL_S = 15.0
_TEMPERATURE = 0.2
_MAX_TOKENS = 150

_VOICE_SYSTEM_INSTRUCTION = (
    "You answer a village microgrid operator's spoken question about the current dispatch "
    "plan. Use ONLY the numbers provided in the JSON facts payload — never invent, estimate, "
    "or round to a value not in the data. "
    "Answer directly in 1-2 short sentences. "
    "Never give advice, recommendations, or safety instructions. "
    "Answer in the language explicitly named in the request."
)

_LANG_NAMES = {Language.en: "English", Language.gu: "Gujarati", Language.hi: "Hindi"}


def _build_user_message(query: str, intent: Intent, facts: dict, language: Language) -> str:
    return (
        f"Language: {_LANG_NAMES.get(language, 'English')}\n"
        f"Operator question: {query}\n"
        f"Detected intent: {intent.value}\n\n"
        f"Facts:\n{json.dumps(facts, ensure_ascii=False, indent=2, default=str)}"
    )


def _load_run(run_id: str, session: Session) -> ScenarioRun:
    try:
        run: ScenarioRun | None = session.exec(
            select(ScenarioRun).where(ScenarioRun.id == run_id)
        ).first()
    except Exception as exc:
        logger.error("DB error looking up run %s: %s", run_id, exc)
        raise HTTPException(status_code=503, detail="Database unavailable — please retry in a moment.")

    if run is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    return run


def _hour_index_from_facts(facts: dict) -> int | None:
    idx = facts.get("hour_index")
    return idx if isinstance(idx, int) else None


# ---------------------------------------------------------------------------
# Non-streaming path (POST /api/voice/query) — single-shot Gemini call with
# retry-then-template fallback, matching app.explainer.gemini.explain()'s
# shape.
# ---------------------------------------------------------------------------


def _generate_voice_answer_sync(query: str, intent: Intent, facts: dict, language: Language) -> str:
    """Best-effort single-shot Gemini answer. NEVER raises — always falls back."""
    template_fallback = build_voice_template_answer(intent, facts, language)

    if intent is Intent.UNKNOWN or not settings.GEMINI_API_KEY:
        return template_fallback

    try:
        from google import genai
        from google.genai import types as genai_types
    except ImportError:
        return template_fallback

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as exc:
        logger.warning("Voice Gemini client init failed: %s — using template", exc)
        return template_fallback

    user_message = _build_user_message(query, intent, facts, language)
    local_time = str(facts.get("local_time", ""))

    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=_MODEL,
                contents=user_message,
                config=genai_types.GenerateContentConfig(
                    system_instruction=_VOICE_SYSTEM_INSTRUCTION,
                    temperature=_TEMPERATURE,
                    max_output_tokens=_MAX_TOKENS,
                    http_options=genai_types.HttpOptions(timeout=int(_TIMEOUT_S * 1000)),
                ),
            )
            text = (response.text or "").strip()
            if _validate_llm_answer(text, facts, local_time):
                return text
        except Exception as exc:
            logger.warning("Voice Gemini error on attempt %d: %s", attempt + 1, exc)

    return template_fallback


@lru_cache(maxsize=256)
def _cached_voice_query(
    run_id: str,
    query: str,
    language: Language,
    current_hour_index: int | None,
    response_json_str: str,
) -> VoiceQueryResponse:
    response_dict = json.loads(response_json_str)
    intent = classify_intent(query)
    facts = resolve_facts(intent, response_dict, current_hour_index)
    confidence: Literal["high", "low"] = "low" if intent is Intent.UNKNOWN else "high"
    answer = _generate_voice_answer_sync(query, intent, facts, language)

    return VoiceQueryResponse(
        run_id=run_id,
        language=language,
        intent=intent.value,
        answer=answer,
        facts_used=facts,
        hour_index=_hour_index_from_facts(facts),
        confidence=confidence,
    )


@router.post("/voice/query", response_model=VoiceQueryResponse)
def voice_query(req: VoiceQueryRequest, session: Session = Depends(get_session)) -> VoiceQueryResponse:
    run = _load_run(req.run_id, session)
    response_json_str = json.dumps(run.response_json, sort_keys=True, default=str)

    try:
        return _cached_voice_query(
            run_id=req.run_id,
            query=req.query,
            language=req.language,
            current_hour_index=req.current_hour_index,
            response_json_str=response_json_str,
        )
    except Exception as exc:
        # Safety net — should never be reached given the fallback chain above,
        # but /voice/query must never 500 once a valid run_id is found.
        logger.exception("Unexpected error in voice query for run %s: %s", req.run_id, exc)
        return VoiceQueryResponse(
            run_id=req.run_id,
            language=req.language,
            intent=Intent.UNKNOWN.value,
            answer=build_voice_template_answer(Intent.UNKNOWN, {}, req.language),
            facts_used={},
            hour_index=None,
            confidence="low",
        )


# ---------------------------------------------------------------------------
# Streaming path (POST /api/voice/stream) — Server-Sent Events.
# Event sequence: intent -> token* -> done, or error on failure.
# ---------------------------------------------------------------------------


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream_fallback_to_template(template_answer: str, facts: dict):
    yield _sse("token", {"text": template_answer})
    yield _sse("done", {"answer": template_answer, "facts_used": facts, "validated": True})


async def _voice_stream_events(req: VoiceQueryRequest, response_dict: dict, request: Request):
    start_time = time.monotonic()

    intent = classify_intent(req.query)
    facts = resolve_facts(intent, response_dict, req.current_hour_index)
    confidence: Literal["high", "low"] = "low" if intent is Intent.UNKNOWN else "high"
    hour_idx = _hour_index_from_facts(facts)

    # 1. Emitted immediately, before any Gemini call, so the UI can jump the
    #    charts to the relevant hour while the answer is still generating.
    yield _sse("intent", {"intent": intent.value, "confidence": confidence, "hour_index": hour_idx})

    if await request.is_disconnected():
        return

    template_answer = build_voice_template_answer(intent, facts, req.language)

    if intent is Intent.UNKNOWN:
        # No Gemini call for UNKNOWN — stream the example-questions template.
        async for event in _stream_fallback_to_template(template_answer, facts):
            yield event
        return

    if not settings.GEMINI_API_KEY:
        async for event in _stream_fallback_to_template(template_answer, facts):
            yield event
        return

    try:
        from google import genai
        from google.genai import types as genai_types
    except ImportError:
        async for event in _stream_fallback_to_template(template_answer, facts):
            yield event
        return

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as exc:
        logger.warning("Voice stream: Gemini client init failed: %s", exc)
        async for event in _stream_fallback_to_template(template_answer, facts):
            yield event
        return

    user_message = _build_user_message(req.query, intent, facts, req.language)
    accumulated = ""
    last_heartbeat = time.monotonic()
    stream_failed = False

    try:
        stream_iter = client.models.generate_content_stream(
            model=_MODEL,
            contents=user_message,
            config=genai_types.GenerateContentConfig(
                system_instruction=_VOICE_SYSTEM_INSTRUCTION,
                temperature=_TEMPERATURE,
                max_output_tokens=_MAX_TOKENS,
                http_options=genai_types.HttpOptions(timeout=int(_STREAM_TIMEOUT_S * 1000)),
            ),
        )
        it = iter(stream_iter)

        while True:
            if time.monotonic() - start_time > _STREAM_TIMEOUT_S:
                logger.warning("Voice stream exceeded %ss timeout", _STREAM_TIMEOUT_S)
                stream_failed = True
                break
            if await request.is_disconnected():
                return

            try:
                chunk = await asyncio.to_thread(next, it, None)
            except Exception as exc:
                logger.warning("Voice stream chunk error: %s", exc)
                stream_failed = True
                break

            if chunk is None:
                break

            chunk_text = getattr(chunk, "text", None)
            if chunk_text:
                accumulated += chunk_text
                yield _sse("token", {"text": chunk_text})

            now = time.monotonic()
            if now - last_heartbeat > _HEARTBEAT_INTERVAL_S:
                yield ": heartbeat\n\n"
                last_heartbeat = now

    except Exception as exc:
        logger.warning("Voice stream error: %s", exc)
        stream_failed = True

    if stream_failed or not accumulated.strip():
        async for event in _stream_fallback_to_template(template_answer, facts):
            yield event
        return

    local_time = str(facts.get("local_time", ""))
    validated = _validate_llm_answer(accumulated, facts, local_time)
    final_answer = accumulated if validated else template_answer
    yield _sse("done", {"answer": final_answer, "facts_used": facts, "validated": validated})


@router.post("/voice/stream")
async def voice_stream(
    req: VoiceQueryRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> StreamingResponse:
    run = _load_run(req.run_id, session)
    response_dict = run.response_json

    async def event_source():
        try:
            async for event in _voice_stream_events(req, response_dict, request):
                yield event
        except Exception as exc:
            logger.exception("Unhandled voice stream error for run %s: %s", req.run_id, exc)
            yield _sse("error", {"message": "The voice assistant is temporarily unavailable."})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# POST /api/voice/speak — optional Sarvam AI Bulbul TTS for reading the
# answer aloud. Cosmetic only: never blocks the voice feature. On any
# failure (missing key, network error, bad response) this returns 503 and
# the frontend falls back to window.speechSynthesis.
# ---------------------------------------------------------------------------


@router.post("/voice/speak")
def voice_speak(req: SpeakRequest) -> Response:
    try:
        audio_bytes, content_type = synthesize_speech(req.text, req.language)
    except TTSUnavailableError as exc:
        logger.info("Sarvam TTS unavailable, frontend will fall back: %s", exc)
        raise HTTPException(status_code=503, detail="Speech synthesis is temporarily unavailable.")
    return Response(content=audio_bytes, media_type=content_type)
