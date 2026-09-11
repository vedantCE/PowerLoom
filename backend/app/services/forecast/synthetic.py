import math
import random
from datetime import datetime, timedelta

from app.schemas.common import ForecastSource
from app.services.forecast.models import HourlyWeather, WeatherForecast

WIND_SHEAR_ALPHA = 0.14


def solar_elevation(lat: float, lon: float, timestamp: datetime) -> float:
    """NOAA-style solar elevation angle approximation, in degrees.

    `timestamp` must be tz-aware; its UTC offset is used directly so this works
    for any timezone, not just Asia/Kolkata.
    """
    utc_offset = timestamp.utcoffset()
    utc_offset_hours = utc_offset.total_seconds() / 3600 if utc_offset is not None else 0.0

    day_of_year = timestamp.timetuple().tm_yday
    hour_decimal = timestamp.hour + timestamp.minute / 60 + timestamp.second / 3600

    gamma = 2 * math.pi / 365 * (day_of_year - 1 + (hour_decimal - 12) / 24)

    declination = (
        0.006918
        - 0.399912 * math.cos(gamma)
        + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma)
        + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma)
        + 0.00148 * math.sin(3 * gamma)
    )

    eq_time_min = 229.18 * (
        0.000075
        + 0.001868 * math.cos(gamma)
        - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma)
        - 0.040849 * math.sin(2 * gamma)
    )

    time_offset_min = eq_time_min + 4 * lon - 60 * utc_offset_hours
    true_solar_time_min = hour_decimal * 60 + time_offset_min
    hour_angle_deg = true_solar_time_min / 4 - 180
    hour_angle = math.radians(hour_angle_deg)

    lat_rad = math.radians(lat)
    elevation_rad = math.asin(
        math.sin(lat_rad) * math.sin(declination)
        + math.cos(lat_rad) * math.cos(declination) * math.cos(hour_angle)
    )
    return math.degrees(elevation_rad)


def clearsky_ghi(elevation_deg: float) -> float:
    """Haurwitz clear-sky global horizontal irradiance model (W/m^2)."""
    if elevation_deg <= 0:
        return 0.0
    zenith_rad = math.radians(90 - elevation_deg)
    cos_z = math.cos(zenith_rad)
    if cos_z <= 0:
        return 0.0
    return 1098 * cos_z * math.exp(-0.057 / cos_z)


def cloud_adjusted_ghi(clearsky: float, cloud_frac: float) -> float:
    """Kasten-Czeplak cloud attenuation model."""
    cloud_frac = max(0.0, min(1.0, cloud_frac))
    return clearsky * (1 - 0.75 * cloud_frac**3.4)


def _diurnal_temp(hour_decimal: float, mean: float, amplitude: float) -> float:
    """Trough near 05:00, peak near 14:30, smooth cosine transitions between."""
    trough_hour = 5.0
    peak_hour = 14.5

    if trough_hour <= hour_decimal <= peak_hour:
        frac = (hour_decimal - trough_hour) / (peak_hour - trough_hour)
        return mean - amplitude * math.cos(math.pi * frac)

    elapsed = hour_decimal - peak_hour if hour_decimal > peak_hour else (24 - peak_hour) + hour_decimal
    span = 24 - (peak_hour - trough_hour)
    frac = elapsed / span
    return mean + amplitude * math.cos(math.pi * frac)


def generate_synthetic_forecast(
    latitude: float,
    longitude: float,
    start_time: datetime,
    horizon_hours: int,
    seed: int,
) -> WeatherForecast:
    """Deterministic synthetic forecast for the given seed (e.g. derived from lat/lon/date)."""
    rng = random.Random(seed)

    mean_temp = rng.uniform(24.0, 30.0)
    temp_amplitude = rng.uniform(5.0, 9.0)
    base_cloud_pct = rng.uniform(20.0, 45.0)
    cloud_amplitude = rng.uniform(10.0, 20.0)
    cloud_phase = rng.uniform(0, 2 * math.pi)
    base_wind = rng.uniform(2.0, 4.5)
    wind_amplitude = rng.uniform(1.5, 3.5)

    hours: list[HourlyWeather] = []
    for t in range(horizon_hours):
        timestamp = start_time + timedelta(hours=t)
        hour_decimal = timestamp.hour + timestamp.minute / 60

        elevation = solar_elevation(latitude, longitude, timestamp)
        clearsky = clearsky_ghi(elevation)

        cloud_pct = base_cloud_pct + cloud_amplitude * math.sin(2 * math.pi * t / 24 + cloud_phase)
        cloud_pct = max(0.0, min(100.0, cloud_pct))

        ghi = cloud_adjusted_ghi(clearsky, cloud_pct / 100)
        temp = _diurnal_temp(hour_decimal, mean_temp, temp_amplitude)

        # Wind is diurnal, peaking in the afternoon/evening (~17:00).
        wind10 = max(0.0, base_wind + wind_amplitude * math.sin(2 * math.pi * (hour_decimal - 11) / 24))
        wind80 = wind10 * (80 / 10) ** WIND_SHEAR_ALPHA

        hours.append(
            HourlyWeather(
                timestamp=timestamp,
                ghi_wm2=round(ghi, 2),
                gti_wm2=None,
                clearsky_ghi_wm2=round(clearsky, 2),
                temp_c=round(temp, 2),
                cloud_cover_pct=round(cloud_pct, 2),
                wind_speed_10m_ms=round(wind10, 2),
                wind_speed_80m_ms=round(wind80, 2),
            )
        )

    return WeatherForecast(
        latitude=latitude,
        longitude=longitude,
        start_time=start_time,
        horizon_hours=horizon_hours,
        source=ForecastSource.SYNTHETIC,
        fetched_at=datetime.now(start_time.tzinfo),
        hours=hours,
        is_overridden=False,
    )
