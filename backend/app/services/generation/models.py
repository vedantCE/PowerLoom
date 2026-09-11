"""Internal generation service models.

These are NOT API schemas — do not put them in app/schemas and do not expose
them directly on the frontend-facing API contract.
"""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ForecastSource


class HourlyGeneration(BaseModel):
    timestamp: datetime
    solar_available_kw: float
    wind_available_kw: float
    poa_irradiance_wm2: float
    cell_temp_c: float
    hub_wind_speed_ms: float


class GenerationProfile(BaseModel):
    village_id: str
    horizon_hours: int
    forecast_source: ForecastSource
    hours: list[HourlyGeneration]
    total_solar_kwh: float
    total_wind_kwh: float
    solar_capacity_factor: float
    wind_capacity_factor: float
