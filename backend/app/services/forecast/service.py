import hashlib
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.models.forecast_cache import ForecastCache
from app.schemas.common import ForecastSource
from app.services.forecast.models import HourlyWeather, WeatherForecast
from app.services.forecast.open_meteo import ForecastUnavailable, fetch_open_meteo
from app.services.forecast.synthetic import (
    clearsky_ghi,
    cloud_adjusted_ghi,
    generate_synthetic_forecast,
    solar_elevation,
)

logger = logging.getLogger(__name__)

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

FRESH_CACHE = timedelta(minutes=60)
STALE_CACHE_LIMIT = timedelta(hours=24)


def _as_aware_utc(dt: datetime) -> datetime:
    """SQLite drops tzinfo on round-trip even with DateTime(timezone=True); values
    stored via this module are always UTC, so a naive value is assumed to be UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _round_start_time(start_time: datetime) -> datetime:
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=KOLKATA_TZ)
    else:
        start_time = start_time.astimezone(KOLKATA_TZ)
    return start_time.replace(minute=0, second=0, microsecond=0)


def _derive_seed(lat_key: float, lon_key: float, start_time: datetime) -> int:
    key = f"{lat_key}:{lon_key}:{start_time.date().isoformat()}"
    return int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)


def _fill_clearsky(hours: list[HourlyWeather], lat: float, lon: float) -> list[HourlyWeather]:
    filled = []
    for hour in hours:
        elevation = solar_elevation(lat, lon, hour.timestamp)
        clearsky = clearsky_ghi(elevation)
        filled.append(hour.model_copy(update={"clearsky_ghi_wm2": round(clearsky, 2)}))
    return filled


def _covers_window(hours: list[HourlyWeather], start_time: datetime, horizon_hours: int) -> bool:
    if not hours:
        return False
    available = {h.timestamp for h in hours}
    required = {start_time + timedelta(hours=i) for i in range(horizon_hours)}
    return required.issubset(available)


def _slice_window(
    hours: list[HourlyWeather],
    start_time: datetime,
    horizon_hours: int,
    lat: float,
    lon: float,
    seed: int,
) -> list[HourlyWeather]:
    by_ts = {h.timestamp: h for h in hours}
    result: list[HourlyWeather] = []

    for i in range(horizon_hours):
        ts = start_time + timedelta(hours=i)
        if ts not in by_ts:
            break
        result.append(by_ts[ts])

    if len(result) < horizon_hours:
        remaining = horizon_hours - len(result)
        fill_start = start_time + timedelta(hours=len(result))
        synthetic = generate_synthetic_forecast(lat, lon, fill_start, remaining, seed)
        result.extend(synthetic.hours)

    return result


def _get_cache_row(session: Session, lat_key: float, lon_key: float) -> ForecastCache | None:
    statement = (
        select(ForecastCache)
        .where(ForecastCache.lat_key == lat_key, ForecastCache.lon_key == lon_key)
        .order_by(ForecastCache.fetched_at.desc())
    )
    return session.exec(statement).first()


def _store_cache(
    session: Session,
    lat_key: float,
    lon_key: float,
    fetched_at: datetime,
    hours: list[HourlyWeather],
) -> None:
    payload = {"hours": [h.model_dump(mode="json") for h in hours]}
    existing = _get_cache_row(session, lat_key, lon_key)
    if existing is not None:
        existing.fetched_at = fetched_at
        existing.horizon_hours = len(hours)
        existing.payload_json = payload
        session.add(existing)
    else:
        session.add(
            ForecastCache(
                lat_key=lat_key,
                lon_key=lon_key,
                fetched_at=fetched_at,
                horizon_hours=len(hours),
                payload_json=payload,
            )
        )
    session.commit()


def _hours_from_payload(payload: dict) -> list[HourlyWeather]:
    return [HourlyWeather.model_validate(h) for h in payload.get("hours", [])]


def _build_forecast(
    latitude: float,
    longitude: float,
    start_time: datetime,
    horizon_hours: int,
    source: ForecastSource,
    fetched_at: datetime,
    hours: list[HourlyWeather],
) -> WeatherForecast:
    return WeatherForecast(
        latitude=latitude,
        longitude=longitude,
        start_time=start_time,
        horizon_hours=horizon_hours,
        source=source,
        fetched_at=fetched_at,
        hours=hours,
        is_overridden=False,
    )


def get_forecast(
    session: Session | None,
    latitude: float,
    longitude: float,
    start_time: datetime,
    horizon_hours: int,
) -> WeatherForecast:
    """Never fails: Open-Meteo -> DB cache -> synthetic fallback."""
    start_time = _round_start_time(start_time)
    lat_key = round(latitude, 2)
    lon_key = round(longitude, 2)
    now = datetime.now(timezone.utc)
    seed = _derive_seed(lat_key, lon_key, start_time)

    cache_row: ForecastCache | None = None
    if session is not None:
        try:
            cache_row = _get_cache_row(session, lat_key, lon_key)
            if cache_row is not None:
                cache_row.fetched_at = _as_aware_utc(cache_row.fetched_at)
        except Exception as exc:
            logger.warning("Forecast cache read failed, continuing without cache: %s", exc)
            cache_row = None

    if cache_row is not None:
        cached_hours = _hours_from_payload(cache_row.payload_json)
        cache_age = now - cache_row.fetched_at
        if cache_age <= FRESH_CACHE and _covers_window(cached_hours, start_time, horizon_hours):
            hours = _slice_window(cached_hours, start_time, horizon_hours, latitude, longitude, seed)
            hours = _fill_clearsky(hours, latitude, longitude)
            return _build_forecast(
                latitude, longitude, start_time, horizon_hours,
                ForecastSource.CACHE, cache_row.fetched_at, hours,
            )

    try:
        api_hours = fetch_open_meteo(latitude, longitude)
        fetched_at = datetime.now(timezone.utc)
        if session is not None:
            try:
                _store_cache(session, lat_key, lon_key, fetched_at, api_hours)
            except Exception as exc:
                logger.warning("Could not persist forecast cache: %s", exc)

        hours = _slice_window(api_hours, start_time, horizon_hours, latitude, longitude, seed)
        hours = _fill_clearsky(hours, latitude, longitude)
        return _build_forecast(
            latitude, longitude, start_time, horizon_hours,
            ForecastSource.OPEN_METEO, fetched_at, hours,
        )
    except ForecastUnavailable as exc:
        logger.warning("Open-Meteo unavailable (%s); falling back to cache/synthetic", exc)

    if cache_row is not None:
        cached_hours = _hours_from_payload(cache_row.payload_json)
        cache_age = now - cache_row.fetched_at
        if cache_age <= STALE_CACHE_LIMIT and _covers_window(cached_hours, start_time, horizon_hours):
            logger.warning("Using stale forecast cache (age=%s)", cache_age)
            hours = _slice_window(cached_hours, start_time, horizon_hours, latitude, longitude, seed)
            hours = _fill_clearsky(hours, latitude, longitude)
            return _build_forecast(
                latitude, longitude, start_time, horizon_hours,
                ForecastSource.CACHE, cache_row.fetched_at, hours,
            )

    logger.warning("Falling back to synthetic forecast for (%s, %s)", latitude, longitude)
    synthetic = generate_synthetic_forecast(latitude, longitude, start_time, horizon_hours, seed)
    hours = _fill_clearsky(synthetic.hours, latitude, longitude)
    return _build_forecast(
        latitude, longitude, start_time, horizon_hours,
        ForecastSource.SYNTHETIC, synthetic.fetched_at, hours,
    )


def apply_weather_overrides(
    forecast: WeatherForecast, cloud_cover_pct: float | None
) -> WeatherForecast:
    """Returns a new WeatherForecast; never mutates the input."""
    if cloud_cover_pct is None:
        return forecast.model_copy(deep=True)

    cloud_frac = max(0.0, min(100.0, cloud_cover_pct)) / 100

    new_hours: list[HourlyWeather] = []
    for hour in forecast.hours:
        new_ghi = cloud_adjusted_ghi(hour.clearsky_ghi_wm2, cloud_frac)
        if hour.gti_wm2 is not None:
            if hour.ghi_wm2 > 0:
                ratio = new_ghi / hour.ghi_wm2
                new_gti = hour.gti_wm2 * ratio
            else:
                new_gti = cloud_adjusted_ghi(hour.clearsky_ghi_wm2, cloud_frac)
        else:
            new_gti = None

        new_hours.append(
            hour.model_copy(
                update={
                    "cloud_cover_pct": cloud_cover_pct,
                    "ghi_wm2": round(new_ghi, 2),
                    "gti_wm2": round(new_gti, 2) if new_gti is not None else None,
                }
            )
        )

    return forecast.model_copy(update={"hours": new_hours, "is_overridden": True})
