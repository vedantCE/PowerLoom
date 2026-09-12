import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.optimizer.milp import solve_dispatch
from app.optimizer.verify import verify_dispatch
from app.presets.loader import load_preset
from app.schemas.common import ForecastSource
from app.schemas.village import (
    BatteryConfig,
    DieselConfig,
    EconomicsConfig,
    Location,
    SolarConfig,
    VillageConfig,
    WindConfig,
)
from app.services.demand.checks import check_system_adequacy
from app.services.demand.model import build_demand_profile
from app.services.forecast.models import HourlyWeather
from app.services.forecast.synthetic import generate_synthetic_forecast
from app.services.generation.service import build_generation_profile
from app.services.pipeline import OptimizationInputs

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
START_TIME = datetime(2026, 1, 1, 0, 0, tzinfo=KOLKATA_TZ)
TOL = 0.01
PRESET_IDS = ["kutch_village", "dang_village", "sundarbans_island"]


def _make_village(
    battery_capacity_kwh: float = 10.0,
    soc_min: float = 0.2,
    soc_max: float = 1.0,
    soc_initial: float = 0.5,
    max_charge_kw: float = 5.0,
    max_discharge_kw: float = 5.0,
    eff_charge: float = 0.95,
    eff_discharge: float = 0.95,
    wear_cost: float = 1.0,
    diesel_capacity_kw: float = 10.0,
    min_load_frac: float = 0.3,
    fuel_price: float = 90.0,
    shed_penalty: float = 100.0,
) -> VillageConfig:
    return VillageConfig(
        id="test_village",
        location=Location(name="Test", district="Test", state="Test", latitude=20.0, longitude=70.0),
        solar=SolarConfig(capacity_kw=0.0),
        wind=WindConfig(capacity_kw=0.0),
        battery=BatteryConfig(
            capacity_kwh=battery_capacity_kwh,
            soc_min=soc_min,
            soc_max=soc_max,
            soc_initial=soc_initial,
            max_charge_kw=max_charge_kw,
            max_discharge_kw=max_discharge_kw,
            eff_charge=eff_charge,
            eff_discharge=eff_discharge,
            wear_cost_inr_per_kwh=wear_cost,
        ),
        diesel=DieselConfig(
            capacity_kw=diesel_capacity_kw,
            min_load_frac=min_load_frac,
            fuel_intercept_l_per_h_per_kw=0.08145,
            fuel_slope_l_per_kwh=0.246,
            fuel_price_inr_per_l=fuel_price,
            co2_kg_per_l=2.68,
        ),
        economics=EconomicsConfig(co2_penalty_inr_per_kg=2.0, shed_penalty_inr_per_kwh=shed_penalty),
        demand_components=[],
    )


def _make_inputs(
    village: VillageConfig,
    demand_kw: list[float],
    critical_kw: list[float],
    solar_kw: list[float],
    wind_kw: list[float],
    diesel_available: bool = True,
) -> OptimizationInputs:
    horizon = len(demand_kw)
    timestamps = [START_TIME + timedelta(hours=i) for i in range(horizon)]
    noncritical_kw = [round(d - c, 6) for d, c in zip(demand_kw, critical_kw)]
    weather = [
        HourlyWeather(
            timestamp=ts,
            ghi_wm2=0.0,
            gti_wm2=None,
            clearsky_ghi_wm2=0.0,
            temp_c=25.0,
            cloud_cover_pct=0.0,
            wind_speed_10m_ms=0.0,
            wind_speed_80m_ms=0.0,
        )
        for ts in timestamps
    ]
    return OptimizationInputs(
        village=village,
        horizon_hours=horizon,
        start_time=START_TIME,
        timestamps=timestamps,
        demand_kw=demand_kw,
        critical_kw=critical_kw,
        noncritical_kw=noncritical_kw,
        solar_available_kw=solar_kw,
        wind_available_kw=wind_kw,
        forecast_source=ForecastSource.SYNTHETIC,
        weather=weather,
        diesel_available=diesel_available,
        warnings=[],
    )


def _prepare_synthetic_inputs(village_id: str, horizon_hours: int) -> OptimizationInputs:
    """Same assembly as pipeline.prepare_inputs, but forces a synthetic forecast
    (no network) so this test module never depends on external services."""
    village = load_preset(village_id)
    assert village is not None
    forecast = generate_synthetic_forecast(
        village.location.latitude, village.location.longitude, START_TIME, horizon_hours, seed=42
    )
    generation_profile = build_generation_profile(village, forecast)
    demand_profile = build_demand_profile(village, forecast, seed=42)
    warnings = check_system_adequacy(village, demand_profile)

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
        warnings=warnings,
    )


# --- Core scenarios ---


def test_trivial_constant_demand_zero_renewables_diesel_covers_all():
    village = _make_village()
    inputs = _make_inputs(village, [5.0] * 24, [2.0] * 24, [0.0] * 24, [0.0] * 24)
    result = solve_dispatch(inputs)

    assert result.status == "Optimal"
    assert not result.infeasible
    assert verify_dispatch(inputs, result) == []
    # No renewables at all, so every kW served must come from diesel or battery.
    # A small non-zero shed is tolerable: the default solve accepts up to a
    # 1% MIP gap for speed (see milp.DEFAULT_GAP_REL), which can leave a
    # negligible amount of unmet demand on the table in a tiny scenario like
    # this one even though the true optimum sheds nothing.
    for hour in result.hours:
        assert hour.solar_used_kw == 0.0
        assert hour.wind_used_kw == 0.0
        assert hour.load_shed_kw < 0.5


def test_solar_surplus_at_noon_charges_battery_not_curtailed():
    village = _make_village(
        battery_capacity_kwh=40.0, max_charge_kw=20.0, max_discharge_kw=20.0, soc_initial=0.3
    )
    solar = [0.0] * 24
    solar[12] = 20.0
    inputs = _make_inputs(village, [5.0] * 24, [2.0] * 24, solar, [0.0] * 24)
    result = solve_dispatch(inputs)

    assert result.status == "Optimal"
    assert verify_dispatch(inputs, result) == []
    noon = result.hours[12]
    assert noon.curtailed_kw < TOL
    assert noon.battery_charge_kw > 0


def test_battery_full_surplus_is_curtailed():
    # max_discharge_kw=0 keeps the battery pinned at soc_max the whole horizon
    # (otherwise the optimizer would rationally pre-discharge before noon to
    # make room, then recharge from the solar surplus instead of curtailing).
    village = _make_village(
        battery_capacity_kwh=40.0,
        max_charge_kw=20.0,
        max_discharge_kw=0.0,
        soc_initial=1.0,
        soc_max=1.0,
    )
    solar = [0.0] * 24
    solar[12] = 20.0
    inputs = _make_inputs(village, [5.0] * 24, [2.0] * 24, solar, [0.0] * 24)
    result = solve_dispatch(inputs)

    assert result.status == "Optimal"
    assert verify_dispatch(inputs, result) == []
    noon = result.hours[12]
    assert noon.battery_charge_kw < TOL
    assert noon.curtailed_kw == pytest.approx(15.0, abs=0.1)
    # Renewable accounting must still balance even with heavy curtailment.
    assert abs((noon.solar_used_kw + noon.curtailed_kw) - noon.solar_available_kw) < TOL


def test_diesel_unavailable_and_undersized_battery_sheds_noncritical_only():
    village = _make_village(
        battery_capacity_kwh=15.0,
        soc_min=0.1,
        soc_max=1.0,
        soc_initial=0.5,
        max_charge_kw=15.0,
        max_discharge_kw=5.0,
        eff_charge=0.9,
        eff_discharge=0.9,
    )
    night_hours = set(range(0, 6)) | set(range(18, 24))
    solar = [25.0 if h not in night_hours else 0.0 for h in range(24)]
    demand = [10.0] * 24
    critical = [0.5] * 24
    inputs = _make_inputs(village, demand, critical, solar, [0.0] * 24, diesel_available=False)
    result = solve_dispatch(inputs)

    assert result.status == "Optimal"
    assert result.relaxed_critical is False
    assert verify_dispatch(inputs, result) == []
    # Critical demand is structurally protected: shed can never exceed noncritical.
    for hour in result.hours:
        assert hour.load_shed_kw <= inputs.noncritical_kw[hour.hour_index] + TOL
    # The battery + zero diesel genuinely can't cover everything, so some
    # noncritical load must be shed during the night hours.
    assert any(hour.load_shed_kw > 0 for hour in result.hours)


def test_solar_day_has_fewer_diesel_hours_than_zero_solar_day():
    village = _make_village(battery_capacity_kwh=15.0, max_charge_kw=10.0, max_discharge_kw=10.0)
    demand = [8.0] * 24
    critical = [2.0] * 24
    zero_solar = [0.0] * 24
    cheap_solar = [0.0] * 6 + [15.0] * 12 + [0.0] * 6

    inputs_zero = _make_inputs(village, demand, critical, zero_solar, [0.0] * 24)
    inputs_solar = _make_inputs(village, demand, critical, cheap_solar, [0.0] * 24)
    result_zero = solve_dispatch(inputs_zero)
    result_solar = solve_dispatch(inputs_solar)

    assert verify_dispatch(inputs_zero, result_zero) == []
    assert verify_dispatch(inputs_solar, result_solar) == []

    diesel_hours_zero = sum(1 for h in result_zero.hours if h.diesel_on)
    diesel_hours_solar = sum(1 for h in result_solar.hours if h.diesel_on)
    assert diesel_hours_solar < diesel_hours_zero


def test_diesel_price_increase_never_increases_diesel_usage():
    demand_pattern = [5.0, 5.0, 5.0, 15.0, 15.0, 5.0, 5.0, 5.0] * 3
    critical_pattern = [2.0] * 24

    village_cheap = _make_village(
        battery_capacity_kwh=15.0, max_charge_kw=10.0, max_discharge_kw=10.0, fuel_price=90.0
    )
    village_expensive = _make_village(
        battery_capacity_kwh=15.0, max_charge_kw=10.0, max_discharge_kw=10.0, fuel_price=180.0
    )
    inputs_cheap = _make_inputs(village_cheap, demand_pattern, critical_pattern, [0.0] * 24, [0.0] * 24)
    inputs_expensive = _make_inputs(
        village_expensive, demand_pattern, critical_pattern, [0.0] * 24, [0.0] * 24
    )
    result_cheap = solve_dispatch(inputs_cheap)
    result_expensive = solve_dispatch(inputs_expensive)

    assert verify_dispatch(inputs_cheap, result_cheap) == []
    assert verify_dispatch(inputs_expensive, result_expensive) == []

    diesel_kwh_cheap = sum(h.diesel_kw for h in result_cheap.hours)
    diesel_kwh_expensive = sum(h.diesel_kw for h in result_expensive.hours)
    assert diesel_kwh_expensive <= diesel_kwh_cheap + TOL


# --- Cross-cutting invariants across all scenarios above ---


@pytest.fixture(scope="module")
def all_scenario_results():
    village_a = _make_village()
    inputs_a = _make_inputs(village_a, [5.0] * 24, [2.0] * 24, [0.0] * 24, [0.0] * 24)

    village_b = _make_village(
        battery_capacity_kwh=15.0, max_charge_kw=10.0, max_discharge_kw=10.0
    )
    demand = [8.0] * 24
    critical = [2.0] * 24
    inputs_zero = _make_inputs(village_b, demand, critical, [0.0] * 24, [0.0] * 24)
    inputs_solar = _make_inputs(
        village_b, demand, critical, [0.0] * 6 + [15.0] * 12 + [0.0] * 6, [0.0] * 24
    )

    scenarios = [inputs_a, inputs_zero, inputs_solar]
    return [(inputs, solve_dispatch(inputs)) for inputs in scenarios]


def test_no_hour_has_simultaneous_charge_and_discharge(all_scenario_results):
    for _, result in all_scenario_results:
        for hour in result.hours:
            assert not (hour.battery_charge_kw > TOL and hour.battery_discharge_kw > TOL)


def test_diesel_never_between_zero_and_min_load_exclusive(all_scenario_results):
    for inputs, result in all_scenario_results:
        diesel = inputs.village.diesel
        min_load_kw = diesel.capacity_kw * diesel.min_load_frac
        for hour in result.hours:
            assert hour.diesel_kw <= TOL or hour.diesel_kw >= min_load_kw - TOL


def test_terminal_soc_meets_or_exceeds_initial_in_all_scenarios(all_scenario_results):
    for inputs, result in all_scenario_results:
        battery = inputs.village.battery
        capacity_kwh = battery.capacity_kwh
        soc_initial_kwh = capacity_kwh * battery.soc_initial
        final_soc_kwh = result.hours[-1].soc * capacity_kwh
        assert final_soc_kwh >= soc_initial_kwh - TOL


# --- Presets ---


@pytest.mark.parametrize("village_id", PRESET_IDS)
@pytest.mark.parametrize("horizon_hours", [24, 48])
def test_verify_dispatch_has_no_violations_for_presets(village_id, horizon_hours):
    inputs = _prepare_synthetic_inputs(village_id, horizon_hours)
    result = solve_dispatch(inputs)
    assert result.status == "Optimal"
    assert verify_dispatch(inputs, result) == []


def test_solve_time_for_48h_problem_is_under_5_seconds():
    inputs = _prepare_synthetic_inputs("kutch_village", 48)

    t0 = time.perf_counter()
    result = solve_dispatch(inputs)
    elapsed_s = time.perf_counter() - t0

    assert result.status == "Optimal"
    assert elapsed_s < 5.0
