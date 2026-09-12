"""Internal demand service models.

These are NOT API schemas — do not put them in app/schemas and do not expose
them directly on the frontend-facing API contract.
"""

from datetime import datetime

from pydantic import BaseModel


class HourlyDemand(BaseModel):
    timestamp: datetime
    total_kw: float
    critical_kw: float
    noncritical_kw: float
    by_category: dict[str, float]


class DemandProfile(BaseModel):
    village_id: str
    horizon_hours: int
    hours: list[HourlyDemand]
    total_kwh: float
    critical_kwh: float
    peak_kw: float
    peak_timestamp: datetime
    morning_peak_kw: float
    evening_peak_kw: float
    load_factor: float
