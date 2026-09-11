"""Pipeline helper to prepare all inputs needed for dispatch optimization."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session

from app.presets.loader import load_preset
from app.schemas.optimize import WhatIfOverrides
from app.schemas.village import VillageConfig
from app.services.forecast.models import WeatherForecast
from app.services.forecast.service import apply_weather_overrides, get_forecast
from app.services.generation.models import GenerationProfile
from app.services.generation.service import build_generation_profile
from app.services.scenario import apply_config_overrides

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def prepare_inputs(
    session: Session | None,
    village_id: str,
    horizon_hours: int = 48,
    start_time: datetime | None = None,
    overrides: WhatIfOverrides | None = None,
) -> tuple[VillageConfig, WeatherForecast, GenerationProfile]:
    """Prepare effective village config, weather forecast, and generation profile.

    1. Loads the preset village configuration.
    2. Applies what-if capacity and cost overrides.
    3. Fetches the weather forecast for the village location.
    4. Applies cloud cover weather override if provided.
    5. Builds the solar and wind generation profile.
    """
    config = load_preset(village_id)
    if config is None:
        raise ValueError(f"Unknown village_id '{village_id}'")

    if start_time is None:
        start_time = (datetime.now(KOLKATA_TZ) + timedelta(hours=1)).replace(
            minute=0, second=0, microsecond=0
        )

    effective_overrides = overrides or WhatIfOverrides()
    effective_config = apply_config_overrides(config, effective_overrides)

    forecast = get_forecast(
        session=session,
        latitude=config.location.latitude,
        longitude=config.location.longitude,
        start_time=start_time,
        horizon_hours=horizon_hours,
    )

    if effective_overrides.cloud_cover_pct is not None:
        forecast = apply_weather_overrides(forecast, effective_overrides.cloud_cover_pct)

    generation_profile = build_generation_profile(effective_config, forecast)

    return effective_config, forecast, generation_profile
