from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.db.session import get_session
from app.presets.loader import load_preset
from app.services.forecast.service import apply_weather_overrides, get_forecast
from app.services.pipeline import prepare_inputs

router = APIRouter(tags=["debug"])

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


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

    start_time = (datetime.now(KOLKATA_TZ) + timedelta(hours=1)).replace(
        minute=0, second=0, microsecond=0
    )
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
    overrides = WhatIfOverrides(
        cloud_cover_pct=cloud_cover_pct,
        diesel_price_inr_per_l=diesel_price_inr_per_l,
        extra_solar_kw=extra_solar_kw,
        extra_battery_kwh=extra_battery_kwh,
        initial_soc=initial_soc,
        diesel_available=diesel_available,
    )
    try:
        _, _, generation_profile = prepare_inputs(
            session=session,
            village_id=village_id,
            horizon_hours=horizon,
            overrides=overrides,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return generation_profile.model_dump(mode="json")

