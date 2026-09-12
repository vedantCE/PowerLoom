import time
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.presets.loader import load_all_presets, load_preset
from app.schemas.optimize import WhatIfOverrides
from app.schemas.village import DemandComponent, VillageConfig
from app.services.demand.checks import check_system_adequacy
from app.services.demand.model import ALLOWED_CATEGORIES, build_demand_profile
from app.services.forecast.synthetic import generate_synthetic_forecast
from app.services.pipeline import prepare_inputs

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
START_TIME = datetime(2026, 9, 15, 0, 0, tzinfo=KOLKATA_TZ)
PRESET_IDS = ["kutch_village", "dang_village", "sundarbans_island"]


def _forecast(village, horizon_hours=48, start_time=START_TIME, seed=42):
    return generate_synthetic_forecast(
        village.location.latitude, village.location.longitude, start_time, horizon_hours, seed
    )


def _make_village(components: list[DemandComponent], **overrides) -> VillageConfig:
    base = load_preset("kutch_village")
    assert base is not None
    data = base.model_dump()
    data["demand_components"] = [c.model_dump() for c in components]
    data.update(overrides)
    return VillageConfig.model_validate(data)


# --- Category normalisation ---


def test_all_preset_components_use_allowed_categories():
    for config in load_all_presets():
        for component in config.demand_components:
            assert component.category in ALLOWED_CATEGORIES, (
                f"{config.id}: component '{component.name}' has disallowed "
                f"category '{component.category}'"
            )


def test_health_and_water_components_are_critical():
    for config in load_all_presets():
        for component in config.demand_components:
            if component.category in ("health", "water"):
                assert component.critical is True
            else:
                assert component.critical is False


# --- Determinism ---


def test_same_seed_gives_identical_profile():
    village = load_preset("kutch_village")
    forecast = _forecast(village)

    profile_a = build_demand_profile(village, forecast, seed=7)
    profile_b = build_demand_profile(village, forecast, seed=7)

    assert profile_a.model_dump() == profile_b.model_dump()


def test_different_date_gives_different_noise():
    village = load_preset("kutch_village")
    forecast_a = _forecast(village, start_time=datetime(2026, 9, 15, 0, 0, tzinfo=KOLKATA_TZ))
    forecast_b = _forecast(village, start_time=datetime(2026, 11, 3, 0, 0, tzinfo=KOLKATA_TZ))

    profile_a = build_demand_profile(village, forecast_a, seed=None)
    profile_b = build_demand_profile(village, forecast_b, seed=None)

    assert profile_a.total_kwh != profile_b.total_kwh


# --- Core invariants across presets ---


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_total_equals_critical_plus_noncritical(village_id):
    village = load_preset(village_id)
    profile = build_demand_profile(village, _forecast(village))
    for hour in profile.hours:
        assert abs(hour.total_kw - (hour.critical_kw + hour.noncritical_kw)) < 0.001


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_critical_load_positive_every_hour(village_id):
    village = load_preset(village_id)
    profile = build_demand_profile(village, _forecast(village))
    assert all(hour.critical_kw > 0 for hour in profile.hours)


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_evening_peak_exceeds_morning_peak(village_id):
    village = load_preset(village_id)
    profile = build_demand_profile(village, _forecast(village))
    assert profile.evening_peak_kw > profile.morning_peak_kw


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_evening_peak_within_diesel_capacity_band(village_id):
    village = load_preset(village_id)
    profile = build_demand_profile(village, _forecast(village))
    frac = profile.evening_peak_kw / village.diesel.capacity_kw
    assert 0.60 <= frac <= 0.95


# --- Window wrap, ramp, temperature, street lighting, noise ---


def test_window_wrapping_past_midnight_is_handled():
    late_component = DemandComponent(
        name="late_shop",
        category="commercial",
        critical=False,
        quantity=1,
        rated_w=1000,
        usage_factor=1.0,
        schedule=[(23, 24)],
    )
    test_village = _make_village([late_component])

    found_wrap = False
    for seed in range(200):
        forecast = _forecast(test_village, seed=seed)
        profile = build_demand_profile(test_village, forecast, seed=seed)
        hour0 = next(h for h in profile.hours if h.timestamp.hour == 0)
        if hour0.total_kw > 0:
            found_wrap = True
            break

    assert found_wrap, "expected at least one seed to jitter the [23,24) window past midnight"


def test_partial_hour_ramp_is_half_power_at_window_edges():
    component = DemandComponent(
        name="always_on_health",
        category="health",
        critical=True,
        quantity=1,
        rated_w=1000,
        usage_factor=1.0,
        schedule=[(0, 24)],
    )
    village = _make_village([component])
    forecast = _forecast(village)
    profile = build_demand_profile(village, forecast, seed=1)

    base_kw = 1 * 1000 / 1000.0 * 1.0
    first_hour = profile.hours[0]
    middle_hour = profile.hours[12]

    # Critical noise is clipped to [0.85, 1.15]; ramp halves the raw power
    # before noise, so first-hour draw stays well below a full-power middle hour.
    assert first_hour.critical_kw < middle_hour.critical_kw
    assert first_hour.critical_kw == pytest.approx(base_kw * 0.5, rel=0.2)


def test_cooling_load_increases_with_temperature():
    village = load_preset("kutch_village")
    base_forecast = _forecast(village)

    warm_hours = [h.model_copy(update={"temp_c": h.temp_c + 10}) for h in base_forecast.hours]
    warm_forecast = base_forecast.model_copy(update={"hours": warm_hours})

    cool_profile = build_demand_profile(village, base_forecast, seed=42)
    warm_profile = build_demand_profile(village, warm_forecast, seed=42)

    # Compare at a daytime hour where the fan schedule (10-23h) is fully active.
    idx = next(i for i, h in enumerate(base_forecast.hours) if h.timestamp.hour == 14)
    cool_cooling_kw = cool_profile.hours[idx].by_category.get("cooling", 0.0)
    warm_cooling_kw = warm_profile.hours[idx].by_category.get("cooling", 0.0)

    assert warm_cooling_kw > cool_cooling_kw


def test_street_lights_off_in_daylight_on_at_night():
    village = load_preset("kutch_village")
    forecast = _forecast(village)
    profile = build_demand_profile(village, forecast, seed=42)

    for hour, weather in zip(profile.hours, forecast.hours):
        street_kw = hour.by_category.get("street_lighting", 0.0)
        if weather.clearsky_ghi_wm2 > 0:
            assert street_kw == 0.0
        else:
            assert street_kw > 0.0


def test_noise_stays_within_clip_bounds_of_base_value():
    noncritical_component = DemandComponent(
        name="always_on_shop",
        category="commercial",
        critical=False,
        quantity=1,
        rated_w=1000,
        usage_factor=1.0,
        schedule=[(0, 24)],
    )
    critical_component = DemandComponent(
        name="always_on_health",
        category="health",
        critical=True,
        quantity=1,
        rated_w=1000,
        usage_factor=1.0,
        schedule=[(0, 24)],
    )
    village = _make_village([noncritical_component, critical_component])
    forecast = _forecast(village)

    base_kw = 1 * 1000 / 1000.0 * 1.0

    for seed in range(20):
        profile = build_demand_profile(village, forecast, seed=seed)
        # Middle-of-window hours are unaffected by ramp or jitter.
        middle_hour = profile.hours[12]
        noncritical_value = middle_hour.by_category["commercial"]
        critical_value = middle_hour.by_category["health"]
        assert 0.85 * base_kw <= noncritical_value <= 1.15 * base_kw
        assert 0.85 * base_kw <= critical_value <= 1.15 * base_kw


# --- Sanity checker ---


@pytest.mark.parametrize("village_id", PRESET_IDS)
def test_adequacy_check_returns_no_warnings_for_tuned_presets(village_id):
    village = load_preset(village_id)
    profile = build_demand_profile(village, _forecast(village))
    warnings = check_system_adequacy(village, profile)
    assert warnings == []


def test_adequacy_check_flags_undersized_diesel():
    village = load_preset("kutch_village")
    village = village.model_copy(deep=True)
    village.diesel.capacity_kw = 1.0
    profile = build_demand_profile(village, _forecast(village))
    warnings = check_system_adequacy(village, profile)
    assert len(warnings) > 0


def test_adequacy_check_never_raises_with_zero_diesel():
    village = load_preset("kutch_village")
    village = village.model_copy(deep=True)
    village.diesel.capacity_kw = 0.0
    profile = build_demand_profile(village, _forecast(village))
    warnings = check_system_adequacy(village, profile)
    assert isinstance(warnings, list)


# --- OptimizationInputs ---


@pytest.mark.parametrize("village_id", PRESET_IDS)
@pytest.mark.parametrize("horizon_hours", [24, 48])
def test_optimization_inputs_validate_for_all_presets(village_id, horizon_hours):
    inputs = prepare_inputs(
        session=None,
        village_id=village_id,
        horizon_hours=horizon_hours,
        start_time=START_TIME,
        overrides=WhatIfOverrides(),
    )
    inputs.validate()

    assert len(inputs.timestamps) == horizon_hours
    assert len(inputs.demand_kw) == horizon_hours
    assert len(inputs.critical_kw) == horizon_hours
    assert len(inputs.noncritical_kw) == horizon_hours
    assert len(inputs.solar_available_kw) == horizon_hours
    assert len(inputs.wind_available_kw) == horizon_hours
    assert len(inputs.weather) == horizon_hours


# --- Performance ---


def test_building_48h_profile_is_fast():
    village = load_preset("kutch_village")
    forecast = _forecast(village)
    build_demand_profile(village, forecast, seed=42)  # warm up (numpy import etc.)

    t0 = time.perf_counter()
    build_demand_profile(village, forecast, seed=42)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert elapsed_ms < 50
