"""Internal optimizer result models.

These are NOT API schemas — do not put them in app/schemas and do not expose
them directly on the frontend-facing API contract.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class DispatchHour(BaseModel):
    hour_index: int
    timestamp: datetime
    demand_kw: float
    critical_kw: float
    solar_available_kw: float
    wind_available_kw: float
    solar_used_kw: float
    wind_used_kw: float
    curtailed_kw: float
    battery_charge_kw: float
    battery_discharge_kw: float
    soc: float
    diesel_kw: float
    diesel_on: bool
    load_shed_kw: float
    reason_codes: list[str] = Field(default_factory=list)


class DispatchResult(BaseModel):
    hours: list[DispatchHour]
    status: str
    objective_value: float | None = None
    solve_time_ms: float
    infeasible: bool = False
    relaxed_critical: bool = False
    strategy: str = "optimized"
