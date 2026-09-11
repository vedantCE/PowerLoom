import logging
from datetime import datetime, timezone

from sqlmodel import Session

from app.models.village_preset import VillagePreset
from app.presets.loader import load_all_presets

logger = logging.getLogger(__name__)


def seed_presets(session: Session) -> None:
    for config in load_all_presets():
        config_dict = config.model_dump(mode="json")
        existing = session.get(VillagePreset, config.id)
        if existing is None:
            session.add(
                VillagePreset(id=config.id, name=config.location.name, config_json=config_dict)
            )
        elif existing.config_json != config_dict:
            existing.config_json = config_dict
            existing.name = config.location.name
            existing.updated_at = datetime.now(timezone.utc)
            session.add(existing)
    session.commit()
