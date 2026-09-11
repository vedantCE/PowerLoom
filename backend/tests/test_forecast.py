import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlmodel import Session, select

from app.db.session import db_state
from app.models.forecast_cache import ForecastCache
from app.schemas.common import ForecastSource
from app.services.forecast import open_meteo, service
from app.services.forecast.open_meteo import ForecastUnavailable, fetch_open_meteo
from app.services.forecast.synthetic import (
    clearsky_ghi,
    generate_synthetic_forecast,
    solar_elevation,
)

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "open_meteo_sample.json"

LAT, LON = 23.25, 69.67


def _sample_payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def _mock_transport(payload: dict, status_code: int = 200) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=payload)

    return httpx.MockTransport(handler)


def _failing_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated network failure", request=request)

    return httpx.MockTransport(handler)


def _start_time() -> datetime:
    now = datetime.now(KOLKATA_TZ) + timedelta(hours=1)
    return now.replace(minute=0, second=0, microsecond=0)


@pytest.fixture
def db_session():
    with Session(db_state.engine) as session:
        yield session


def _clear_forecast_cache(session: Session) -> None:
    for row in session.exec(select(ForecastCache)).all():
        session.delete(row)
    session.commit()


# --- Open-Meteo client ---


def test_parses_realistic_payload_into_tz_aware_hours():
    payload = _sample_payload()
    hours = fetch_open_meteo(LAT, LON, transport=_mock_transport(payload))

    assert len(hours) == 72
    first = hours[0]
    assert first.timestamp.tzinfo is not None
    assert first.timestamp.utcoffset() == timedelta(hours=5, minutes=30)
    assert first.timestamp == datetime(2026, 9, 11, 0, 0, tzinfo=KOLKATA_TZ)

    raw_ghi = payload["hourly"]["shortwave_radiation"]
    for i, hour in enumerate(hours):
        assert hour.ghi_wm2 == pytest.approx(raw_ghi[i])


def test_open_meteo_raises_forecast_unavailable_on_network_failure():
    with pytest.raises(ForecastUnavailable):
        fetch_open_meteo(LAT, LON, transport=_failing_transport())


def test_generic_interpolation_fills_missing_values():
    values = [1.0, None, 3.0, None, None, 6.0]
    filled = open_meteo._fill_generic(values)
    assert filled == pytest.approx([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])


def test_irradiance_missing_defaults_to_zero():
    values = [None, 100.0, None]
    assert open_meteo._fill_irradiance(values) == [0.0, 100.0, 0.0]


# --- Forecast service: fallback chain ---


def test_get_forecast_returns_exactly_24_and_48_hours(db_session, monkeypatch):
    payload = _sample_payload()
    monkeypatch.setattr(
        service, "fetch_open_meteo", lambda lat, lon: open_meteo._parse_response(payload)
    )
    _clear_forecast_cache(db_session)

    start_time = _start_time()
    forecast24 = service.get_forecast(db_session, LAT, LON, start_time, 24)
    assert len(forecast24.hours) == 24

    _clear_forecast_cache(db_session)
    forecast48 = service.get_forecast(db_session, LAT, LON, start_time, 48)
    assert len(forecast48.hours) == 48


def test_fresh_cache_hit_returns_cache_and_skips_api(db_session, monkeypatch):
    _clear_forecast_cache(db_session)
    start_time = _start_time()
    horizon = 24

    def fail_if_called(*args, **kwargs):
        raise AssertionError("Open-Meteo should not be called on a fresh cache hit")

    monkeypatch.setattr(service, "fetch_open_meteo", fail_if_called)

    synthetic = generate_synthetic_forecast(LAT, LON, start_time, horizon, seed=42)
    lat_key, lon_key = round(LAT, 2), round(LON, 2)
    service._store_cache(db_session, lat_key, lon_key, datetime.now(timezone.utc), synthetic.hours)

    forecast = service.get_forecast(db_session, LAT, LON, start_time, horizon)
    assert forecast.source == ForecastSource.CACHE
    assert len(forecast.hours) == horizon


def test_api_failure_with_recent_cache_falls_back_to_cache(db_session, monkeypatch):
    _clear_forecast_cache(db_session)
    start_time = _start_time()
    horizon = 24

    synthetic = generate_synthetic_forecast(LAT, LON, start_time, horizon, seed=7)
    lat_key, lon_key = round(LAT, 2), round(LON, 2)
    stale_fetch_time = datetime.now(timezone.utc) - timedelta(hours=2)
    service._store_cache(db_session, lat_key, lon_key, stale_fetch_time, synthetic.hours)

    def raise_unavailable(*args, **kwargs):
        raise ForecastUnavailable("simulated failure")

    monkeypatch.setattr(service, "fetch_open_meteo", raise_unavailable)

    forecast = service.get_forecast(db_session, LAT, LON, start_time, horizon)
    assert forecast.source == ForecastSource.CACHE
    assert len(forecast.hours) == horizon


def test_api_failure_without_cache_falls_back_to_synthetic(db_session, monkeypatch):
    _clear_forecast_cache(db_session)
    start_time = _start_time()

    def raise_unavailable(*args, **kwargs):
        raise ForecastUnavailable("simulated failure")

    monkeypatch.setattr(service, "fetch_open_meteo", raise_unavailable)

    forecast = service.get_forecast(db_session, LAT, LON, start_time, 24)
    assert forecast.source == ForecastSource.SYNTHETIC
    assert len(forecast.hours) == 24


# --- Synthetic / clear-sky model ---


def test_synthetic_irradiance_zero_at_night_positive_at_noon():
    start_time = datetime(2026, 9, 15, 0, 0, tzinfo=KOLKATA_TZ)
    forecast = generate_synthetic_forecast(LAT, LON, start_time, 24, seed=123)
    by_hour = {h.timestamp.hour: h for h in forecast.hours}

    assert by_hour[2].ghi_wm2 == 0.0
    assert by_hour[13].ghi_wm2 > 0.0


def test_synthetic_forecast_deterministic_for_same_seed():
    start_time = datetime(2026, 9, 15, 0, 0, tzinfo=KOLKATA_TZ)
    f1 = generate_synthetic_forecast(LAT, LON, start_time, 24, seed=99)
    f2 = generate_synthetic_forecast(LAT, LON, start_time, 24, seed=99)
    assert [h.model_dump() for h in f1.hours] == [h.model_dump() for h in f2.hours]


def test_clearsky_ghi_at_solar_noon_in_plausible_range():
    peak = 0.0
    for hour in range(10, 15):
        ts = datetime(2026, 9, 15, hour, 0, tzinfo=KOLKATA_TZ)
        elevation = solar_elevation(LAT, LON, ts)
        peak = max(peak, clearsky_ghi(elevation))
    assert 700.0 <= peak <= 1050.0


# --- Weather overrides ---


def test_cloud_override_100_reduces_ghi_to_quarter_of_clearsky():
    start_time = datetime(2026, 9, 15, 13, 0, tzinfo=KOLKATA_TZ)
    forecast = generate_synthetic_forecast(LAT, LON, start_time, 1, seed=1)
    overridden = service.apply_weather_overrides(forecast, 100.0)
    hour = overridden.hours[0]
    assert hour.ghi_wm2 == pytest.approx(hour.clearsky_ghi_wm2 * 0.25, abs=0.01)
    assert overridden.is_overridden is True


def test_cloud_override_0_gives_clearsky():
    start_time = datetime(2026, 9, 15, 13, 0, tzinfo=KOLKATA_TZ)
    forecast = generate_synthetic_forecast(LAT, LON, start_time, 1, seed=1)
    overridden = service.apply_weather_overrides(forecast, 0.0)
    hour = overridden.hours[0]
    assert hour.ghi_wm2 == pytest.approx(hour.clearsky_ghi_wm2, abs=0.01)


def test_apply_overrides_does_not_mutate_original_forecast():
    start_time = datetime(2026, 9, 15, 13, 0, tzinfo=KOLKATA_TZ)
    forecast = generate_synthetic_forecast(LAT, LON, start_time, 4, seed=5)
    original_ghi = [h.ghi_wm2 for h in forecast.hours]
    original_cloud = [h.cloud_cover_pct for h in forecast.hours]
    original_overridden_flag = forecast.is_overridden

    service.apply_weather_overrides(forecast, 90.0)

    assert [h.ghi_wm2 for h in forecast.hours] == original_ghi
    assert [h.cloud_cover_pct for h in forecast.hours] == original_cloud
    assert forecast.is_overridden == original_overridden_flag is False
