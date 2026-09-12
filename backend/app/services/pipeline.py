"""Pipeline helper to prepare all inputs needed for dispatch optimization."""

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session

from app.presets.loader import load_preset
from app.schemas.common import ForecastSource
from app.schemas.optimize import WhatIfOverrides
from app.schemas.village import VillageConfig
from app.services.demand.checks import check_system_adequacy
from app.services.demand.model import build_demand_profile
from app.services.forecast.models import HourlyWeather
from app.services.forecast.service import apply_weather_overrides, get_forecast
from app.services.generation.service import build_generation_profile
from app.services.scenario import apply_config_overrides

logger = logging.getLogger(__name__)

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

_ARRAY_FIELDS = (
    "demand_kw",
    "critical_kw",
    "noncritical_kw",
    "solar_available_kw",
    "wind_available_kw",
)


@dataclass
class OptimizationInputs:
    """Everything the MILP optimizer consumes for one dispatch run.

    This is the ONLY object the optimizer reads from — it is assembled here
    from the effective village config, weather forecast, generation profile,
    and demand profile so the optimizer itself never has to know about
    presets, overrides, or forecasting.
    """

    village: VillageConfig
    horizon_hours: int
    start_time: datetime
    timestamps: list[datetime]
    demand_kw: list[float]
    critical_kw: list[float]
    noncritical_kw: list[float]
    solar_available_kw: list[float]
    wind_available_kw: list[float]
    forecast_source: ForecastSource
    weather: list[HourlyWeather]
    diesel_available: bool
    warnings: list[str]

    def validate(self) -> None:
        """Asserts all arrays have length == horizon_hours and no NaN/negative values."""
        array_like = {"timestamps": self.timestamps, "weather": self.weather}
        array_like.update({name: getattr(self, name) for name in _ARRAY_FIELDS})

        for name, values in array_like.items():
            if len(values) != self.horizon_hours:
                raise ValueError(
                    f"OptimizationInputs.{name} has length {len(values)}, "
                    f"expected horizon_hours={self.horizon_hours}"
                )

        for name in _ARRAY_FIELDS:
            for value in getattr(self, name):
                if value is None or math.isnan(value) or value < 0:
                    raise ValueError(f"OptimizationInputs.{name} contains invalid value: {value}")


def prepare_inputs(
    session: Session | None,
    village_id: str,
    horizon_hours: int = 48,
    start_time: datetime | None = None,
    overrides: WhatIfOverrides | None = None,
) -> OptimizationInputs:
    """Prepare the full optimizer input bundle for a village.

    1. Loads the preset village configuration.
    2. Applies what-if capacity and cost overrides.
    3. Fetches the weather forecast for the village location.
    4. Applies cloud cover weather override if provided.
    5. Builds the solar/wind generation profile and the bottom-up demand profile.
    6. Runs sanity checks on demand vs. installed capacity (warnings only).
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
    demand_profile = build_demand_profile(effective_config, forecast)

    warnings = check_system_adequacy(effective_config, demand_profile)
    for warning in warnings:
        logger.warning("Adequacy check for '%s': %s", village_id, warning)

    inputs = OptimizationInputs(
        village=effective_config,
        horizon_hours=horizon_hours,
        start_time=start_time,
        timestamps=[hour.timestamp for hour in forecast.hours],
        demand_kw=[hour.total_kw for hour in demand_profile.hours],
        critical_kw=[hour.critical_kw for hour in demand_profile.hours],
        noncritical_kw=[hour.noncritical_kw for hour in demand_profile.hours],
        solar_available_kw=[hour.solar_available_kw for hour in generation_profile.hours],
        wind_available_kw=[hour.wind_available_kw for hour in generation_profile.hours],
        forecast_source=forecast.source,
        weather=forecast.hours,
        diesel_available=effective_overrides.diesel_available,
        warnings=warnings,
    )
    inputs.validate()
    return inputs
