import json
from pathlib import Path

from app.schemas.village import PresetSummary, VillageConfig

PRESETS_DIR = Path(__file__).parent


def _preset_files() -> list[Path]:
    return sorted(PRESETS_DIR.glob("*.json"))


def load_all_presets() -> list[VillageConfig]:
    return [
        VillageConfig.model_validate(json.loads(path.read_text()))
        for path in _preset_files()
    ]


def load_preset(preset_id: str) -> VillageConfig | None:
    path = PRESETS_DIR / f"{preset_id}.json"
    if not path.exists():
        return None
    return VillageConfig.model_validate(json.loads(path.read_text()))


def to_summary(config: VillageConfig) -> PresetSummary:
    return PresetSummary(
        id=config.id,
        name=config.location.name,
        district=config.location.district,
        state=config.location.state,
        solar_kw=config.solar.capacity_kw,
        wind_kw=config.wind.capacity_kw,
        battery_kwh=config.battery.capacity_kwh,
        diesel_kw=config.diesel.capacity_kw,
    )
