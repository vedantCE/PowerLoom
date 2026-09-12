"""POST /api/explain — Gemini-based dispatch explainer endpoint.

Looks up a ScenarioRun by run_id, builds structured facts for the requested
hour, and returns a plain-language explanation in the requested language.

Error handling:
  - 404 if run_id not found
  - 422 if hour_index is out of range
  - 503 if the DB is unavailable
  - Never 500 (all exceptions are caught and reported with a safe message)
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db.session import get_session
from app.explainer.facts import build_hour_facts
from app.explainer.gemini import explain
from app.models.scenario_run import ScenarioRun
from app.presets.loader import load_preset
from app.schemas.common import Language
from app.schemas.explain import ExplainRequest, ExplainResponse

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# LRU cache — keyed by (run_id, hour_index, language), maxsize 256
# The outer function is not cached; only the inner pure helper is, so that
# the DB session (a mutable dependency) is not captured inside the cache.
# ---------------------------------------------------------------------------


@lru_cache(maxsize=256)
def _cached_explain(
    run_id: str,
    hour_index: int,
    language: Language,
    response_json_str: str,   # serialised so it is hashable
    village_config_str: str,  # serialised so it is hashable
) -> ExplainResponse:
    response_dict = json.loads(response_json_str)
    village_cfg = json.loads(village_config_str)

    facts = build_hour_facts(response_dict, hour_index, village_cfg)
    reason_codes: list[str] = facts.get("reason_codes", [])

    text = explain(facts, reason_codes, language)

    return ExplainResponse(
        run_id=run_id,
        hour_index=hour_index,
        language=language,
        reason_codes=reason_codes,
        explanation=text,
    )


@router.post("/explain", response_model=ExplainResponse)
def explain_hour(
    req: ExplainRequest,
    session: Session = Depends(get_session),
) -> ExplainResponse:
    # ── Fetch the stored run ──────────────────────────────────────────────────
    try:
        run: ScenarioRun | None = session.exec(
            select(ScenarioRun).where(ScenarioRun.id == req.run_id)
        ).first()
    except Exception as exc:
        logger.error("DB error looking up run %s: %s", req.run_id, exc)
        raise HTTPException(
            status_code=503,
            detail="Database unavailable — please retry in a moment.",
        )

    if run is None:
        raise HTTPException(status_code=404, detail=f"Run '{req.run_id}' not found.")

    # ── Validate hour_index ───────────────────────────────────────────────────
    response_dict = run.response_json
    hourly = response_dict.get("hourly", [])
    if req.hour_index < 0 or req.hour_index >= len(hourly):
        raise HTTPException(
            status_code=422,
            detail=(
                f"hour_index {req.hour_index} is out of range "
                f"[0, {len(hourly) - 1}] for run '{req.run_id}'."
            ),
        )

    # ── Load village config for soc_min / diesel capacity ────────────────────
    village_id = run.village_id
    try:
        village_config = load_preset(village_id)
        village_cfg_dict = village_config.model_dump() if village_config else {}
    except Exception as exc:
        logger.warning("Could not load preset '%s': %s — using empty config", village_id, exc)
        village_cfg_dict = {}

    # ── Call cached explainer ─────────────────────────────────────────────────
    # Serialise the dicts to strings so they are hashable for lru_cache.
    response_json_str = json.dumps(response_dict, sort_keys=True, default=str)
    village_config_str = json.dumps(village_cfg_dict, sort_keys=True, default=str)

    try:
        return _cached_explain(
            run_id=req.run_id,
            hour_index=req.hour_index,
            language=req.language,
            response_json_str=response_json_str,
            village_config_str=village_config_str,
        )
    except Exception as exc:
        # Safety net — should never reach here given the fallback chain in
        # gemini.py / templates.py, but we must never return a 500.
        logger.exception("Unexpected error in explainer for run %s hour %d: %s", req.run_id, req.hour_index, exc)
        raise HTTPException(
            status_code=503,
            detail="Explainer temporarily unavailable — please retry.",
        )
