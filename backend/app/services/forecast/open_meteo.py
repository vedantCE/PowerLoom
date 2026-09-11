import logging
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.services.forecast.models import HourlyWeather

logger = logging.getLogger(__name__)

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT_SECONDS = 8.0
MAX_RETRIES = 2
RETRY_BACKOFF_SECONDS = 0.2

HOURLY_FIELDS = [
    "shortwave_radiation",
    "global_tilted_irradiance",
    "temperature_2m",
    "cloud_cover",
    "wind_speed_10m",
    "wind_speed_80m",
]


class ForecastUnavailable(Exception):
    """Raised when Open-Meteo cannot be reached or returns unusable data."""


def _fill_generic(values: list[float | None]) -> list[float]:
    """Linearly interpolate missing values from their nearest known neighbours."""
    n = len(values)
    out: list[float | None] = list(values)
    known = [i for i, v in enumerate(out) if v is not None]
    if not known:
        return [0.0] * n

    for i in range(n):
        if out[i] is not None:
            continue
        left = max((j for j in known if j < i), default=None)
        right = min((j for j in known if j > i), default=None)
        if left is None:
            out[i] = out[right]
        elif right is None:
            out[i] = out[left]
        else:
            frac = (i - left) / (right - left)
            out[i] = out[left] + frac * (out[right] - out[left])

    return [float(v) for v in out]


def _fill_irradiance(values: list[float | None]) -> list[float]:
    """Missing irradiance readings default to 0 (treated as night)."""
    return [0.0 if v is None else float(v) for v in values]


def _parse_response(payload: dict[str, Any]) -> list[HourlyWeather]:
    hourly = payload.get("hourly")
    if not hourly:
        raise ForecastUnavailable("Open-Meteo response missing 'hourly' block")

    try:
        times = hourly["time"]
        ghi = hourly["shortwave_radiation"]
        temp = hourly["temperature_2m"]
        cloud = hourly["cloud_cover"]
        wind10 = hourly["wind_speed_10m"]
        wind80 = hourly["wind_speed_80m"]
    except KeyError as exc:
        raise ForecastUnavailable(f"Open-Meteo response missing field: {exc}") from exc

    gti = hourly.get("global_tilted_irradiance")

    ghi_filled = _fill_irradiance(ghi)
    gti_filled = _fill_irradiance(gti) if gti is not None else None
    temp_filled = _fill_generic(temp)
    cloud_filled = _fill_generic(cloud)
    wind10_filled = _fill_generic(wind10)
    wind80_filled = _fill_generic(wind80)

    hours: list[HourlyWeather] = []
    for i, t in enumerate(times):
        timestamp = datetime.fromisoformat(t).replace(tzinfo=KOLKATA_TZ)
        hours.append(
            HourlyWeather(
                timestamp=timestamp,
                ghi_wm2=ghi_filled[i],
                gti_wm2=gti_filled[i] if gti_filled is not None else None,
                temp_c=temp_filled[i],
                cloud_cover_pct=cloud_filled[i],
                wind_speed_10m_ms=wind10_filled[i],
                wind_speed_80m_ms=wind80_filled[i],
            )
        )
    return hours


def fetch_open_meteo(
    latitude: float,
    longitude: float,
    transport: httpx.BaseTransport | None = None,
) -> list[HourlyWeather]:
    """Fetch hourly weather from Open-Meteo, with retries. Raises ForecastUnavailable on failure."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": "Asia/Kolkata",
        "wind_speed_unit": "ms",
        "forecast_days": 3,
        "hourly": ",".join(HOURLY_FIELDS),
        "tilt": round(abs(latitude)),
        "azimuth": 0,
    }

    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=TIMEOUT_SECONDS, transport=transport) as client:
                response = client.get(OPEN_METEO_URL, params=params)
                response.raise_for_status()
                payload = response.json()
            return _parse_response(payload)
        except (httpx.HTTPError, ValueError, ForecastUnavailable) as exc:
            last_exc = exc
            logger.warning("Open-Meteo fetch attempt %d/%d failed: %s", attempt + 1, MAX_RETRIES + 1, exc)
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))

    raise ForecastUnavailable(
        f"Open-Meteo unavailable after {MAX_RETRIES + 1} attempts"
    ) from last_exc
