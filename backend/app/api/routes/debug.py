from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.db.session import get_session
from app.presets.loader import load_preset
from app.schemas.optimize import WhatIfOverrides
from app.services.demand.model import build_demand_profile
from app.services.forecast.service import apply_weather_overrides, get_forecast
from app.services.generation.service import build_generation_profile
from app.services.pipeline import prepare_inputs
from app.services.scenario import apply_config_overrides

router = APIRouter(tags=["debug"])

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def _next_full_hour_kolkata() -> datetime:
    now = datetime.now(KOLKATA_TZ)
    return (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)


@router.get("/debug/forecast/{village_id}")
def debug_forecast(
    village_id: str,
    horizon: int = Query(default=48, ge=1, le=72),
    cloud_cover_pct: float | None = Query(default=None, ge=0, le=100),
    session: Session = Depends(get_session),
) -> dict:
    config = load_preset(village_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Unknown village_id '{village_id}'")

    start_time = _next_full_hour_kolkata()
    forecast = get_forecast(
        session, config.location.latitude, config.location.longitude, start_time, horizon
    )
    forecast = apply_weather_overrides(forecast, cloud_cover_pct)
    return forecast.model_dump(mode="json")


@router.get("/debug/generation/{village_id}")
def debug_generation(
    village_id: str,
    horizon: int = Query(default=48, ge=1, le=72),
    cloud_cover_pct: float | None = Query(default=None, ge=0, le=100),
    extra_solar_kw: float | None = Query(default=None),
    extra_battery_kwh: float | None = Query(default=None),
    diesel_price_inr_per_l: float | None = Query(default=None),
    initial_soc: float | None = Query(default=None, ge=0, le=1),
    diesel_available: bool = Query(default=True),
    session: Session = Depends(get_session),
) -> dict:
    config = load_preset(village_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Unknown village_id '{village_id}'")

    overrides = WhatIfOverrides(
        cloud_cover_pct=cloud_cover_pct,
        diesel_price_inr_per_l=diesel_price_inr_per_l,
        extra_solar_kw=extra_solar_kw,
        extra_battery_kwh=extra_battery_kwh,
        initial_soc=initial_soc,
        diesel_available=diesel_available,
    )
    effective_config = apply_config_overrides(config, overrides)

    start_time = _next_full_hour_kolkata()
    forecast = get_forecast(
        session,
        effective_config.location.latitude,
        effective_config.location.longitude,
        start_time,
        horizon,
    )
    if overrides.cloud_cover_pct is not None:
        forecast = apply_weather_overrides(forecast, overrides.cloud_cover_pct)

    generation_profile = build_generation_profile(effective_config, forecast)
    return generation_profile.model_dump(mode="json")


@router.get("/debug/demand/{village_id}")
def debug_demand(
    village_id: str,
    horizon: int = Query(default=48, ge=1, le=72),
    session: Session = Depends(get_session),
) -> dict:
    config = load_preset(village_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Unknown village_id '{village_id}'")

    start_time = _next_full_hour_kolkata()
    forecast = get_forecast(
        session, config.location.latitude, config.location.longitude, start_time, horizon
    )
    demand_profile = build_demand_profile(config, forecast)
    return demand_profile.model_dump(mode="json")


@router.get("/debug/inputs/{village_id}")
def debug_inputs(
    village_id: str,
    horizon: int = Query(default=48, ge=1, le=72),
    cloud_cover_pct: float | None = Query(default=None, ge=0, le=100),
    extra_solar_kw: float | None = Query(default=None),
    extra_battery_kwh: float | None = Query(default=None),
    diesel_price_inr_per_l: float | None = Query(default=None),
    initial_soc: float | None = Query(default=None, ge=0, le=1),
    diesel_available: bool = Query(default=True),
    session: Session = Depends(get_session),
) -> dict:
    overrides = WhatIfOverrides(
        cloud_cover_pct=cloud_cover_pct,
        diesel_price_inr_per_l=diesel_price_inr_per_l,
        extra_solar_kw=extra_solar_kw,
        extra_battery_kwh=extra_battery_kwh,
        initial_soc=initial_soc,
        diesel_available=diesel_available,
    )
    try:
        inputs = prepare_inputs(
            session=session,
            village_id=village_id,
            horizon_hours=horizon,
            overrides=overrides,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return {
        "village": inputs.village.model_dump(mode="json"),
        "horizon_hours": inputs.horizon_hours,
        "start_time": inputs.start_time.isoformat(),
        "timestamps": [ts.isoformat() for ts in inputs.timestamps],
        "demand_kw": inputs.demand_kw,
        "critical_kw": inputs.critical_kw,
        "noncritical_kw": inputs.noncritical_kw,
        "solar_available_kw": inputs.solar_available_kw,
        "wind_available_kw": inputs.wind_available_kw,
        "forecast_source": inputs.forecast_source.value,
        "weather": [hour.model_dump(mode="json") for hour in inputs.weather],
        "diesel_available": inputs.diesel_available,
        "warnings": inputs.warnings,
    }
