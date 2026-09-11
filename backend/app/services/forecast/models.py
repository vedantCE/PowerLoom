"""Internal forecast service models.

These are NOT API schemas — do not put them in app/schemas and do not expose
them directly on the frontend-facing API contract.
"""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ForecastSource


class HourlyWeather(BaseModel):
    timestamp: datetime
    ghi_wm2: float
    gti_wm2: float | None = None
    clearsky_ghi_wm2: float = 0.0
    temp_c: float
    cloud_cover_pct: float
    wind_speed_10m_ms: float
    wind_speed_80m_ms: float


class WeatherForecast(BaseModel):
    latitude: float
    longitude: float
    start_time: datetime
    horizon_hours: int
    source: ForecastSource
    fetched_at: datetime
    hours: list[HourlyWeather]
    is_overridden: bool = False
