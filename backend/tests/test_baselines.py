from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.optimizer.baselines import cycle_charging_dispatch, naive_dispatch
from app.optimizer.verify import verify_dispatch
from app.presets.loader import load_preset
from app.services.demand.model import build_demand_profile
from app.services.forecast.synthetic import generate_synthetic_forecast
from app.services.generation.service import build_generation_profile
from app.services.pipeline import OptimizationInputs

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
START_TIME = datetime(2026, 1, 1, 0, 0, tzinfo=KOLKATA_TZ)
PRESET_IDS = ["kutch_village", "dang_village", "sundarbans_island"]


def _prepare_synthetic_inputs(village_id: str, horizon_hours: int) -> OptimizationInputs:
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
@pytest.mark.parametrize("horizon_hours", [24, 48])
def test_naive_dispatch_passes_verify_dispatch(village_id, horizon_hours):
    inputs = _prepare_synthetic_inputs(village_id, horizon_hours)
    result = naive_dispatch(inputs)
    assert result.strategy == "naive"
    assert verify_dispatch(inputs, result, skip_terminal_soc=True) == []


@pytest.mark.parametrize("village_id", PRESET_IDS)
@pytest.mark.parametrize("horizon_hours", [24, 48])
def test_cycle_charging_dispatch_passes_verify_dispatch(village_id, horizon_hours):
    inputs = _prepare_synthetic_inputs(village_id, horizon_hours)
    result = cycle_charging_dispatch(inputs)
    assert result.strategy == "cycle_charging"
    assert verify_dispatch(inputs, result, skip_terminal_soc=True) == []


def test_naive_never_shifts_supply_before_it_is_needed():
    """Naive has no look-ahead: it must never charge the battery unless there
    is an actual renewable surplus that hour (no anticipatory pre-charging)."""
    inputs = _prepare_synthetic_inputs("kutch_village", 48)
    result = naive_dispatch(inputs)
    for hour in result.hours:
        if hour.battery_charge_kw > 1e-6:
            renewable_avail = hour.solar_available_kw + hour.wind_available_kw
            assert renewable_avail >= hour.demand_kw - 1e-6 or hour.diesel_on


def test_cycle_charging_runs_diesel_at_higher_average_load_than_naive():
    """cycle_charging should avoid naive's inefficient low-load diesel runs by
    charging the battery whenever diesel is on."""
    inputs = _prepare_synthetic_inputs("kutch_village", 48)
    naive = naive_dispatch(inputs)
    cycle = cycle_charging_dispatch(inputs)

    naive_on_hours = [h for h in naive.hours if h.diesel_on]
    cycle_on_hours = [h for h in cycle.hours if h.diesel_on]
    assert naive_on_hours and cycle_on_hours

    naive_avg_load = sum(h.diesel_kw for h in naive_on_hours) / len(naive_on_hours)
    cycle_avg_load = sum(h.diesel_kw for h in cycle_on_hours) / len(cycle_on_hours)
    assert cycle_avg_load >= naive_avg_load
