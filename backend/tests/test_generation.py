from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.presets.loader import load_preset
from app.schemas.optimize import WhatIfOverrides
from app.services.forecast.models import HourlyWeather, WeatherForecast
from app.services.forecast.synthetic import generate_synthetic_forecast
from app.services.generation.models import GenerationProfile
from app.services.generation.service import build_generation_profile
from app.services.generation.solar import (
    calculate_cell_temp,
    calculate_poa_irradiance,
    calculate_solar_power,
)
from app.services.generation.wind import (
    WIND_AVAILABILITY_FACTOR,
    calculate_hub_wind_speed,
    calculate_wind_power,
)
from app.services.pipeline import prepare_inputs
from app.services.scenario import apply_config_overrides

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


# --- Solar model unit tests ---


def test_solar_zero_at_night_never_negative_never_above_capacity():
    capacity_kw = 20.0

    # Night / zero irradiance
    assert calculate_solar_power(capacity_kw, poa_wm2=0.0, cell_temp_c=25.0) == 0.0
    assert calculate_solar_power(capacity_kw, poa_wm2=-10.0, cell_temp_c=25.0) == 0.0

    # Never negative
    assert calculate_solar_power(capacity_kw, poa_wm2=500.0, cell_temp_c=100.0) >= 0.0

    # Never above capacity even under extreme irradiance (e.g., 1500 W/m2 at sub-zero temp)
    power_extreme = calculate_solar_power(
        capacity_kw, poa_wm2=1500.0, cell_temp_c=-10.0, system_loss=0.0
    )
    assert power_extreme <= capacity_kw


def test_higher_cell_temperature_reduces_output():
    capacity_kw = 20.0
    poa_wm2 = 800.0

    p_cool = calculate_solar_power(capacity_kw, poa_wm2, cell_temp_c=25.0)
    p_warm = calculate_solar_power(capacity_kw, poa_wm2, cell_temp_c=45.0)
    p_hot = calculate_solar_power(capacity_kw, poa_wm2, cell_temp_c=65.0)

    assert p_cool > p_warm > p_hot


def test_stc_conditions_give_capacity_times_one_minus_loss():
    capacity_kw = 20.0
    system_loss = 0.14
    # At STC (1000 W/m2, 25 °C cell temp):
    power = calculate_solar_power(
        capacity_kw=capacity_kw,
        poa_wm2=1000.0,
        cell_temp_c=25.0,
        system_loss=system_loss,
        temp_coeff_per_c=-0.004,
    )
    expected = capacity_kw * (1.0 - system_loss)
    assert power == pytest.approx(expected)


def test_noct_cell_temperature_calculation():
    # T_amb = 30°C, G_poa = 800 W/m2, NOCT = 45°C
    # T_cell = 30 + (45 - 20) / 800 * 800 = 30 + 25 = 55°C
    t_cell = calculate_cell_temp(temp_amb_c=30.0, poa_wm2=800.0, noct_c=45.0)
    assert t_cell == pytest.approx(55.0)

    # Nighttime (G_poa = 0) -> cell temp equals ambient
    assert calculate_cell_temp(temp_amb_c=22.0, poa_wm2=0.0) == 22.0


def test_poa_irradiance_prefers_gti_over_ghi():
    assert calculate_poa_irradiance(ghi_wm2=500.0, gti_wm2=650.0) == 650.0
    assert calculate_poa_irradiance(ghi_wm2=500.0, gti_wm2=None) == 500.0


# --- Wind model unit tests ---


def test_wind_power_curve_boundaries_and_monotonicity():
    capacity_kw = 10.0
    cut_in = 3.0
    rated = 11.0
    cut_out = 25.0

    # Below cut-in -> 0
    assert calculate_wind_power(capacity_kw, hub_wind_speed_ms=0.0) == 0.0
    assert calculate_wind_power(capacity_kw, hub_wind_speed_ms=2.9) == 0.0
    assert calculate_wind_power(capacity_kw, hub_wind_speed_ms=3.0) == 0.0

    # At rated -> capacity * WIND_AVAILABILITY_FACTOR
    p_rated = calculate_wind_power(capacity_kw, hub_wind_speed_ms=11.0)
    assert p_rated == pytest.approx(capacity_kw * WIND_AVAILABILITY_FACTOR)

    # Between rated and cut-out -> capacity * WIND_AVAILABILITY_FACTOR
    p_high = calculate_wind_power(capacity_kw, hub_wind_speed_ms=18.0)
    assert p_high == pytest.approx(capacity_kw * WIND_AVAILABILITY_FACTOR)

    # At and above cut-out -> 0
    assert calculate_wind_power(capacity_kw, hub_wind_speed_ms=25.0) == 0.0
    assert calculate_wind_power(capacity_kw, hub_wind_speed_ms=30.0) == 0.0

    # Monotonic increasing between cut-in and rated
    speeds = [3.5, 5.0, 7.0, 9.0, 10.9]
    powers = [calculate_wind_power(capacity_kw, s) for s in speeds]
    for i in range(len(powers) - 1):
        assert powers[i] < powers[i + 1]


def test_hub_wind_speed_power_law():
    # 80m speed given -> scale from 80m to 30m
    v_hub = calculate_hub_wind_speed(wind_speed_80m_ms=10.0, wind_speed_10m_ms=5.0, hub_height_m=30.0)
    expected = 10.0 * (30.0 / 80.0) ** 0.14
    assert v_hub == pytest.approx(expected)

    # 80m missing (None) -> scale from 10m to 30m
    v_hub_fallback = calculate_hub_wind_speed(wind_speed_80m_ms=None, wind_speed_10m_ms=5.0, hub_height_m=30.0)
    expected_fallback = 5.0 * (30.0 / 10.0) ** 0.14
    assert v_hub_fallback == pytest.approx(expected_fallback)


def test_zero_capacity_produces_zero_generation():
    assert calculate_solar_power(capacity_kw=0.0, poa_wm2=1000.0, cell_temp_c=25.0) == 0.0
    assert calculate_wind_power(capacity_kw=0.0, hub_wind_speed_ms=12.0) == 0.0


# --- Village presets & overrides tests ---


def test_dang_village_produces_zero_wind_every_hour():
    dang = load_preset("dang_village")
    assert dang is not None
    assert dang.wind.capacity_kw == 0.0

    start_time = datetime(2026, 9, 15, 0, 0, tzinfo=KOLKATA_TZ)
    synthetic_forecast = generate_synthetic_forecast(
        dang.location.latitude, dang.location.longitude, start_time, 48, seed=42
    )

    profile = build_generation_profile(dang, synthetic_forecast)
    assert len(profile.hours) == 48
    assert all(h.wind_available_kw == 0.0 for h in profile.hours)
    assert profile.total_wind_kwh == 0.0
    assert profile.wind_capacity_factor == 0.0


def test_extra_solar_kw_scales_output_proportionally():
    kutch = load_preset("kutch_village")
    assert kutch is not None
    assert kutch.solar.capacity_kw == 20.0

    start_time = datetime(2026, 9, 15, 0, 0, tzinfo=KOLKATA_TZ)
    forecast = generate_synthetic_forecast(
        kutch.location.latitude, kutch.location.longitude, start_time, 24, seed=123
    )

    base_profile = build_generation_profile(kutch, forecast)

    overridden_village = apply_config_overrides(
        kutch, WhatIfOverrides(extra_solar_kw=5.0)
    )
    assert overridden_village.solar.capacity_kw == 25.0

    override_profile = build_generation_profile(overridden_village, forecast)

    # For every daylight hour, generation scales by exactly 25 / 20 = 1.25
    for h_base, h_ovr in zip(base_profile.hours, override_profile.hours):
        if h_base.solar_available_kw > 0:
            assert h_ovr.solar_available_kw / h_base.solar_available_kw == pytest.approx(
                25.0 / 20.0, rel=1e-2
            )

    assert override_profile.total_solar_kwh == pytest.approx(
        base_profile.total_solar_kwh * (25.0 / 20.0), rel=1e-2
    )


def test_apply_config_overrides_does_not_mutate_original_and_clamps_soc():
    kutch = load_preset("kutch_village")
    assert kutch is not None

    orig_solar = kutch.solar.capacity_kw
    orig_battery = kutch.battery.capacity_kwh
    orig_price = kutch.diesel.fuel_price_inr_per_l
    orig_soc = kutch.battery.soc_initial

    # Test with out-of-bounds initial_soc (too high and too low)
    overrides_high = WhatIfOverrides(
        extra_solar_kw=10.0,
        extra_battery_kwh=20.0,
        diesel_price_inr_per_l=115.0,
        initial_soc=1.5,
    )
    new_high = apply_config_overrides(kutch, overrides_high)

    assert new_high.solar.capacity_kw == orig_solar + 10.0
    assert new_high.battery.capacity_kwh == orig_battery + 20.0
    assert new_high.diesel.fuel_price_inr_per_l == 115.0
    assert new_high.battery.soc_initial == kutch.battery.soc_max  # Clamped to 1.0

    # Original preset remains untouched
    assert kutch.solar.capacity_kw == orig_solar
    assert kutch.battery.capacity_kwh == orig_battery
    assert kutch.diesel.fuel_price_inr_per_l == orig_price
    assert kutch.battery.soc_initial == orig_soc

    # Test clamping on lower bound
    overrides_low = WhatIfOverrides(initial_soc=0.05)
    new_low = apply_config_overrides(kutch, overrides_low)
    assert new_low.battery.soc_initial == kutch.battery.soc_min  # Clamped to 0.2


def test_extra_battery_kwh_maintains_c_rate():
    kutch = load_preset("kutch_village")
    assert kutch is not None
    # Original: 50 kWh, 25 kW max charge/discharge (0.5 C)
    assert kutch.battery.capacity_kwh == 50.0
    assert kutch.battery.max_charge_kw == 25.0
    assert kutch.battery.max_discharge_kw == 25.0

    overrides = WhatIfOverrides(extra_battery_kwh=50.0)  # Total 100 kWh
    scaled = apply_config_overrides(kutch, overrides)

    assert scaled.battery.capacity_kwh == 100.0
    assert scaled.battery.max_charge_kw == 50.0
    assert scaled.battery.max_discharge_kw == 50.0
    assert scaled.battery.max_charge_kw / scaled.battery.capacity_kwh == 0.5


def test_clear_sky_synthetic_forecast_kutch_gives_realistic_yield():
    kutch = load_preset("kutch_village")
    assert kutch is not None

    start_time = datetime(2026, 9, 15, 0, 0, tzinfo=KOLKATA_TZ)
    # Synthetic forecast with seed gives clear-sky-derived irradiance
    forecast = generate_synthetic_forecast(
        kutch.location.latitude, kutch.location.longitude, start_time, 24, seed=42
    )

    profile = build_generation_profile(kutch, forecast)
    solar_yield_per_kwp = profile.total_solar_kwh / kutch.solar.capacity_kw

    # A typical sunny tropical day produces 4.0 - 6.0 kWh/kWp/day
    assert 4.0 <= solar_yield_per_kwp <= 6.0


# --- Pipeline & Debug endpoint integration tests ---


def test_prepare_inputs_returns_profile_and_overrides():
    inputs = prepare_inputs(
        session=None,
        village_id="kutch_village",
        horizon_hours=24,
        overrides=WhatIfOverrides(extra_solar_kw=5.0, cloud_cover_pct=50.0),
    )

    assert inputs.village.id == "kutch_village"
    assert inputs.village.solar.capacity_kw == 25.0
    assert inputs.horizon_hours == 24
    assert len(inputs.timestamps) == 24
    assert len(inputs.solar_available_kw) == 24
    assert sum(inputs.solar_available_kw) > 0.0
    inputs.validate()


def test_debug_generation_endpoint():
    client = TestClient(app)

    # Normal request
    resp = client.get("/api/debug/generation/kutch_village?horizon=48")
    assert resp.status_code == 200
    data = resp.json()
    assert data["village_id"] == "kutch_village"
    assert data["horizon_hours"] == 48
    assert len(data["hours"]) == 48
    assert "total_solar_kwh" in data
    assert "total_wind_kwh" in data

    # Unknown village -> 404
    resp_404 = client.get("/api/debug/generation/non_existent_village")
    assert resp_404.status_code == 404
