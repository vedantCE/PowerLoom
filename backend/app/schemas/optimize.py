from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

from app.schemas.common import ForecastSource, ReasonCode

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def _next_full_hour_kolkata() -> datetime:
    now = datetime.now(KOLKATA_TZ)
    return (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)


class WhatIfOverrides(BaseModel):
    cloud_cover_pct: float | None = Field(default=None, ge=0, le=100)
    diesel_price_inr_per_l: float | None = None
    extra_solar_kw: float | None = None
    extra_battery_kwh: float | None = None
    initial_soc: float | None = None
    diesel_available: bool = True


class OptimizeRequest(BaseModel):
    village_id: str
    horizon_hours: Literal[24, 48] = 48
    start_time: datetime | None = Field(default_factory=_next_full_hour_kolkata)
    overrides: WhatIfOverrides = Field(default_factory=WhatIfOverrides)


class HourlyDispatch(BaseModel):
    hour_index: int
    timestamp: datetime
    demand_kw: float
    critical_demand_kw: float
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
    reason_codes: list[ReasonCode]


class PlanSummary(BaseModel):
    total_cost_inr: float
    fuel_cost_inr: float
    diesel_liters: float
    diesel_hours: float
    co2_kg: float
    renewable_share_pct: float
    uptime_pct: float
    critical_uptime_pct: float
    load_shed_kwh: float
    curtailed_kwh: float


class BaselineResult(BaseModel):
    strategy: Literal["naive", "cycle_charging"]
    summary: PlanSummary
    hourly: list[HourlyDispatch]


class Savings(BaseModel):
    vs_strategy: str
    cost_saved_inr: float
    cost_saved_pct: float
    diesel_hours_saved: float
    diesel_liters_saved: float
    co2_saved_kg: float


class SolverInfo(BaseModel):
    status: str
    solve_time_ms: float
    objective_value: float | None = None


class OptimizeResponse(BaseModel):
    run_id: str
    village_id: str
    created_at: datetime
    horizon_hours: int
    forecast_source: ForecastSource
    hourly: list[HourlyDispatch]
    summary: PlanSummary
    baselines: list[BaselineResult]
    savings: list[Savings]
    solver: SolverInfo
    is_mock: bool = False
