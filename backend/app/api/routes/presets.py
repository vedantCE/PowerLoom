import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db.session import get_session
from app.models.village_preset import VillagePreset
from app.presets.loader import load_all_presets, load_preset, to_summary
from app.schemas.village import PresetSummary, VillageConfig

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/presets", response_model=list[PresetSummary])
def list_presets(session: Session = Depends(get_session)) -> list[PresetSummary]:
    try:
        rows = session.exec(select(VillagePreset)).all()
        if rows:
            return [to_summary(VillageConfig.model_validate(row.config_json)) for row in rows]
    except Exception as exc:
        logger.warning("Falling back to filesystem presets for list: %s", exc)

    return [to_summary(config) for config in load_all_presets()]


@router.get("/presets/{preset_id}", response_model=VillageConfig)
def get_preset(preset_id: str, session: Session = Depends(get_session)) -> VillageConfig:
    try:
        row = session.get(VillagePreset, preset_id)
        if row is not None:
            return VillageConfig.model_validate(row.config_json)
    except Exception as exc:
        logger.warning("Falling back to filesystem preset lookup for '%s': %s", preset_id, exc)

    config = load_preset(preset_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Unknown village_id '{preset_id}'")
    return config
