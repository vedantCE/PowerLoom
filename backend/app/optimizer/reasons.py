"""Reason codes: turn optimized dispatch decisions into a short, ordered list
of machine-readable tags per hour, for the Gemini explainer to turn into
plain language later. The LLM only explains decisions here — it never makes
them.
"""

from app.optimizer.models import DispatchHour, DispatchResult
from app.schemas.common import ReasonCode
from app.services.pipeline import OptimizationInputs

TOL = 1e-6
SOC_EDGE_BAND = 0.02
EVENING_HOURS = range(17, 23)
LOOKAHEAD_HOURS = 12
LOOKAHEAD_RENEWABLE_FRACTION = 0.6
DIESEL_EFFICIENT_LOAD_FRACTION = 0.7
MAX_CODES_PER_HOUR = 3

# Most important first — PRECHARGE_FOR_FORECAST_DEFICIT is the single most
# interesting code for the demo (it's the look-ahead behaviour), so it always
# wins the top slot when it applies.
PRIORITY_ORDER: list[ReasonCode] = [
    ReasonCode.PRECHARGE_FOR_FORECAST_DEFICIT,
    ReasonCode.DIESEL_EFFICIENT_LOADING,
    ReasonCode.RENEWABLES_COVER_DEMAND,
    ReasonCode.DIESEL_CHARGING_BATTERY,
    ReasonCode.EVENING_PEAK_DISCHARGE,
    ReasonCode.SOLAR_SURPLUS_CHARGING,
    ReasonCode.NONCRITICAL_LOAD_SHED,
    ReasonCode.SOC_AT_MINIMUM,
    ReasonCode.CURTAILMENT_BATTERY_FULL,
]


def _has_forecast_deficit_ahead(inputs: OptimizationInputs, t: int) -> bool:
    window_end = min(t + LOOKAHEAD_HOURS, inputs.horizon_hours)
    window_start = t + 1
    if window_start >= window_end:
        return False

    renewable_kwh = sum(
        inputs.solar_available_kw[i] + inputs.wind_available_kw[i] for i in range(window_start, window_end)
    )
    demand_kwh = sum(inputs.demand_kw[i] for i in range(window_start, window_end))
    if demand_kwh <= TOL:
        return False

    return renewable_kwh < LOOKAHEAD_RENEWABLE_FRACTION * demand_kwh


def _matches(code: ReasonCode, hour: DispatchHour, inputs: OptimizationInputs, soc_min: float, soc_max: float) -> bool:
    if code is ReasonCode.RENEWABLES_COVER_DEMAND:
        return hour.diesel_kw <= TOL and hour.battery_discharge_kw <= TOL
    if code is ReasonCode.SOLAR_SURPLUS_CHARGING:
        return hour.battery_charge_kw > TOL and hour.solar_used_kw > TOL
    if code is ReasonCode.PRECHARGE_FOR_FORECAST_DEFICIT:
        return (
            hour.battery_charge_kw > TOL
            and hour.diesel_on
            and _has_forecast_deficit_ahead(inputs, hour.hour_index)
        )
    if code is ReasonCode.EVENING_PEAK_DISCHARGE:
        return hour.battery_discharge_kw > TOL and hour.timestamp.hour in EVENING_HOURS
    if code is ReasonCode.SOC_AT_MINIMUM:
        return hour.soc <= soc_min + SOC_EDGE_BAND
    if code is ReasonCode.DIESEL_EFFICIENT_LOADING:
        diesel_capacity_kw = inputs.village.diesel.capacity_kw
        return hour.diesel_on and hour.diesel_kw >= DIESEL_EFFICIENT_LOAD_FRACTION * diesel_capacity_kw
    if code is ReasonCode.DIESEL_CHARGING_BATTERY:
        return hour.diesel_on and hour.battery_charge_kw > TOL
    if code is ReasonCode.CURTAILMENT_BATTERY_FULL:
        return hour.curtailed_kw > TOL and hour.soc >= soc_max - SOC_EDGE_BAND
    if code is ReasonCode.NONCRITICAL_LOAD_SHED:
        return hour.load_shed_kw > TOL
    return False


def _fallback_code(hour: DispatchHour) -> ReasonCode:
    """No rule matched — pick whichever source dominates this hour's supply."""
    renewables_kw = hour.solar_used_kw + hour.wind_used_kw
    dominant = max(
        (renewables_kw, ReasonCode.RENEWABLES_COVER_DEMAND),
        (hour.battery_discharge_kw, ReasonCode.EVENING_PEAK_DISCHARGE),
        (hour.diesel_kw, ReasonCode.DIESEL_EFFICIENT_LOADING),
        key=lambda pair: pair[0],
    )
    return dominant[1]


def assign_reason_codes(inputs: OptimizationInputs, result: DispatchResult) -> DispatchResult:
    """Returns a new DispatchResult with reason_codes filled in for every hour."""
    battery = inputs.village.battery
    soc_min = battery.soc_min
    soc_max = battery.soc_max

    new_hours: list[DispatchHour] = []
    for hour in result.hours:
        codes = [
            code for code in PRIORITY_ORDER if _matches(code, hour, inputs, soc_min, soc_max)
        ][:MAX_CODES_PER_HOUR]
        if not codes:
            codes = [_fallback_code(hour)]
        new_hours.append(hour.model_copy(update={"reason_codes": [code.value for code in codes]}))

    return result.model_copy(update={"hours": new_hours})
