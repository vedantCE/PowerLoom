from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.optimizer.baselines import cycle_charging_dispatch, naive_dispatch
from app.optimizer.metrics import compute_savings, compute_summary
from app.optimizer.milp import solve_dispatch
from app.optimizer.reasons import assign_reason_codes
from app.presets.loader import load_preset
from app.services.demand.model import build_demand_profile
from app.services.forecast.synthetic import generate_synthetic_forecast
from app.services.generation.service import build_generation_profile
from app.services.pipeline import OptimizationInputs

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
START_TIME = datetime(2026, 1, 1, 0, 0, tzinfo=KOLKATA_TZ)
PRESET_IDS = ["kutch_village", "dang_village", "sundarbans_island"]


def _prepare_synthetic_inputs(village_id: str, horizon_hours: int = 48) -> OptimizationInputs:
    village = load_preset(village_id)
    assert village is not None
    forecast = generate_synthetic_forecast(
        village.location.latitude, village.location.longitude, START_TIME, horizon_hours, seed=42
    )
    generation_profile = build_generation_profile(village, forecast)
    demand_profile = build_demand_profile(village, forecast, seed=42)

    return OptimizationInputs(
        village=village,
        horizon_hours=horizon_hours,
        start_time=START_TIME,
        timestamps=[h.timestamp for h in forecast.hours],
        demand_kw=[h.total_kw for h in demand_profile.hours],
        critical_kw=[h.critical_kw for h in demand_profile.hours],
        noncritical_kw=[h.noncritical_kw for h in demand_profile.hours],
        solar_available_kw=[h.solar_available_kw for h in generation_profile.hours],
        wind_available_kw=[h.wind_available_kw for h in generation_profile.hours],
        forecast_source=forecast.source,
        weather=forecast.hours,
        diesel_available=True,
        warnings=[],
    )


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_optimized_beats_naive_on_cost(village_id):
    inputs = _prepare_synthetic_inputs(village_id)
    optimized = solve_dispatch(inputs)
    naive = naive_dispatch(inputs)

    optimized_summary = compute_summary(inputs, optimized)
    naive_summary = compute_summary(inputs, naive)
    assert optimized_summary.total_cost_inr <= naive_summary.total_cost_inr


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_optimized_beats_cycle_charging_on_cost(village_id):
    inputs = _prepare_synthetic_inputs(village_id)
    optimized = solve_dispatch(inputs)
    cycle = cycle_charging_dispatch(inputs)

    optimized_summary = compute_summary(inputs, optimized)
    cycle_summary = compute_summary(inputs, cycle)
    assert optimized_summary.total_cost_inr <= cycle_summary.total_cost_inr


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_optimized_uses_no_more_diesel_hours_than_naive(village_id):
    inputs = _prepare_synthetic_inputs(village_id)
    optimized = solve_dispatch(inputs)
    naive = naive_dispatch(inputs)

    optimized_summary = compute_summary(inputs, optimized)
    naive_summary = compute_summary(inputs, naive)
    assert optimized_summary.diesel_hours <= naive_summary.diesel_hours


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_objective_and_summary_agree_within_one_percent(village_id):
    inputs = _prepare_synthetic_inputs(village_id)
    result = solve_dispatch(inputs)
    summary = compute_summary(inputs, result)

    assert result.objective_value is not None
    pct_diff = abs(result.objective_value - summary.total_cost_inr) / abs(result.objective_value) * 100
    assert pct_diff <= 1.0


def test_naive_precharges_less_than_optimizer_before_a_cloudy_day():
    """Construct sunny day 1 / very cloudy day 2. The optimizer should look
    ahead and end day 1 with a higher SOC than naive (which never does)."""
    village = load_preset("kutch_village")
    assert village is not None
    horizon_hours = 48

    sunny_solar = [
        max(0.0, 12.0 * (1 - abs(h - 12) / 8)) if 4 <= h <= 20 else 0.0 for h in range(24)
    ]
    cloudy_solar = [v * 0.05 for v in sunny_solar]
    solar_available_kw = sunny_solar + cloudy_solar
    wind_available_kw = [0.0] * horizon_hours
    demand_kw = [7.0] * horizon_hours
    critical_kw = [2.0] * horizon_hours
    noncritical_kw = [d - c for d, c in zip(demand_kw, critical_kw)]

    forecast = generate_synthetic_forecast(
        village.location.latitude, village.location.longitude, START_TIME, horizon_hours, seed=1
    )

    inputs = OptimizationInputs(
        village=village,
        horizon_hours=horizon_hours,
        start_time=START_TIME,
        timestamps=[h.timestamp for h in forecast.hours],
        demand_kw=demand_kw,
        critical_kw=critical_kw,
        noncritical_kw=noncritical_kw,
        solar_available_kw=solar_available_kw,
        wind_available_kw=wind_available_kw,
        forecast_source=forecast.source,
        weather=forecast.hours,
        diesel_available=True,
        warnings=[],
    )

    optimized = solve_dispatch(inputs)
    naive = naive_dispatch(inputs)

    optimized_end_of_day1_soc = optimized.hours[23].soc
    naive_end_of_day1_soc = naive.hours[23].soc
    assert optimized_end_of_day1_soc > naive_end_of_day1_soc

    optimized_with_reasons = assign_reason_codes(inputs, optimized)
    codes = {code for hour in optimized_with_reasons.hours for code in hour.reason_codes}
    assert "PRECHARGE_FOR_FORECAST_DEFICIT" in codes


def test_every_hour_has_at_least_one_reason_code():
    inputs = _prepare_synthetic_inputs("kutch_village")
    result = solve_dispatch(inputs)
    result = assign_reason_codes(inputs, result)
    assert all(len(hour.reason_codes) >= 1 for hour in result.hours)


def test_compute_savings_never_clamps_negative_values():
    inputs = _prepare_synthetic_inputs("kutch_village")
    optimized = solve_dispatch(inputs)
    optimized_summary = compute_summary(inputs, optimized)

    # A summary that's cheaper than "optimized" should yield negative savings.
    cheaper_summary = optimized_summary.model_copy(
        update={"total_cost_inr": optimized_summary.total_cost_inr - 1000.0}
    )
    savings = compute_savings(optimized_summary, cheaper_summary, "cheaper_than_optimized")
    assert savings.cost_saved_inr < 0
    assert savings.cost_saved_pct < 0


def test_compute_savings_guards_against_zero_division():
    inputs = _prepare_synthetic_inputs("kutch_village")
    optimized = solve_dispatch(inputs)
    optimized_summary = compute_summary(inputs, optimized)

    zero_cost_baseline = optimized_summary.model_copy(update={"total_cost_inr": 0.0})
    savings = compute_savings(optimized_summary, zero_cost_baseline, "zero_cost")
    assert savings.cost_saved_pct == 0.0
