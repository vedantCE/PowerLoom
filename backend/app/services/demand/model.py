"""RAMP-inspired bottom-up village demand model.

Builds an hourly demand profile from appliance-level components (quantity x
rated power x usage windows x usage factor) with controlled randomness, in the
spirit of RAMP (https://github.com/RAMP-project/RAMP) but simplified for speed
and determinism: identical inputs always produce an identical profile, and a
48-hour profile builds in milliseconds. RAMP itself is not used as a
dependency.
"""

import hashlib
from collections import defaultdict
from datetime import date, datetime, time, timedelta

import numpy as np

from app.schemas.village import DemandComponent, VillageConfig
from app.services.demand.models import DemandProfile, HourlyDemand
from app.services.forecast.models import HourlyWeather, WeatherForecast

ALLOWED_CATEGORIES = {
    "household_lighting",
    "household_appliance",
    "cooling",
    "health",
    "water",
    "school",
    "commercial",
    "street_lighting",
}

STREET_LIGHTING_CATEGORY = "street_lighting"
COOLING_CATEGORY = "cooling"

# Local hour-of-day windows used to characterise the morning and evening peaks.
MORNING_HOURS = range(5, 12)
EVENING_HOURS = range(17, 23)

NONCRITICAL_NOISE_STD = 0.07
CRITICAL_NOISE_STD = 0.03
NOISE_CLIP = (0.85, 1.15)


def _derive_seed(village_id: str, start_date: date) -> int:
    key = f"{village_id}:{start_date.isoformat()}"
    return int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)


def _day_midnight(ts: datetime) -> datetime:
    return datetime.combine(ts.date(), time(0, 0), tzinfo=ts.tzinfo)


def _window_bounds(
    day_midnight: datetime, start_hour: int, end_hour: int, shift_start: int, shift_end: int
) -> tuple[datetime, datetime]:
    return (
        day_midnight + timedelta(hours=start_hour + shift_start),
        day_midnight + timedelta(hours=end_hour + shift_end),
    )


def _component_base_kw(component: DemandComponent) -> float:
    return component.quantity * component.rated_w / 1000.0 * component.usage_factor


def _ramp_factor(ts: datetime, window_start: datetime, window_end: datetime) -> float:
    """50% power in the first and last hour of a window, full power in between."""
    factor = 1.0
    if ts == window_start:
        factor = 0.5
    if ts == window_end - timedelta(hours=1):
        factor = 0.5
    return factor


def _temperature_factor(temp_c: float) -> float:
    return max(0.4, min(1.6, 1 + 0.04 * (temp_c - 28)))


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def build_demand_profile(
    village: VillageConfig,
    forecast: WeatherForecast,
    seed: int | None = None,
) -> DemandProfile:
    hours: list[HourlyWeather] = forecast.hours
    horizon_hours = len(hours)

    if horizon_hours == 0:
        return DemandProfile(
            village_id=village.id,
            horizon_hours=0,
            hours=[],
            total_kwh=0.0,
            critical_kwh=0.0,
            peak_kw=0.0,
            peak_timestamp=forecast.start_time,
            morning_peak_kw=0.0,
            evening_peak_kw=0.0,
            load_factor=0.0,
        )

    if seed is None:
        seed = _derive_seed(village.id, hours[0].timestamp.date())
    rng = np.random.default_rng(seed)

    # One (shift_start, shift_end) jitter pair per non-critical component per
    # calendar day, drawn lazily as new days are encountered (RAMP-like).
    jitter_cache: dict[tuple[int, date], tuple[int, int]] = {}

    def _jitter(component_idx: int, component: DemandComponent, day: date) -> tuple[int, int]:
        if component.critical:
            return (0, 0)
        key = (component_idx, day)
        cached = jitter_cache.get(key)
        if cached is None:
            shift_start = int(rng.integers(-1, 2))
            shift_end = int(rng.integers(-1, 2))
            cached = (shift_start, shift_end)
            jitter_cache[key] = cached
        return cached

    hourly_records: list[HourlyDemand] = []

    for hour in hours:
        ts = hour.timestamp
        day = ts.date()
        day_midnight = _day_midnight(ts)
        is_dark = hour.clearsky_ghi_wm2 == 0

        critical_raw: dict[str, float] = defaultdict(float)
        noncritical_raw: dict[str, float] = defaultdict(float)

        for idx, component in enumerate(village.demand_components):
            if component.category == STREET_LIGHTING_CATEGORY:
                power_kw = _component_base_kw(component) if is_dark else 0.0
            else:
                power_kw = 0.0
                base_kw = _component_base_kw(component)
                for start_hour, end_hour in component.schedule:
                    # A jittered window can spill up to 1 hour past midnight in
                    # either direction, so a window anchored "yesterday" or
                    # "tomorrow" may still cover `ts` at the very edge of today.
                    for anchor_day in (day, day - timedelta(days=1), day + timedelta(days=1)):
                        anchor_shift_start, anchor_shift_end = _jitter(idx, component, anchor_day)
                        anchor_midnight = day_midnight + (anchor_day - day)
                        window_start, window_end = _window_bounds(
                            anchor_midnight, start_hour, end_hour, anchor_shift_start, anchor_shift_end
                        )
                        if window_end <= window_start:
                            continue
                        if window_start <= ts < window_end:
                            power_kw += base_kw * _ramp_factor(ts, window_start, window_end)
                            break

                if component.category == COOLING_CATEGORY:
                    power_kw *= _temperature_factor(hour.temp_c)

            bucket = critical_raw if component.critical else noncritical_raw
            bucket[component.category] += power_kw

        noise_critical = _clip(rng.normal(1.0, CRITICAL_NOISE_STD), *NOISE_CLIP)
        noise_noncritical = _clip(rng.normal(1.0, NONCRITICAL_NOISE_STD), *NOISE_CLIP)

        by_category: dict[str, float] = {}
        critical_kw = 0.0
        noncritical_kw = 0.0

        for category, raw_kw in critical_raw.items():
            value = round(raw_kw * noise_critical, 3)
            by_category[category] = by_category.get(category, 0.0) + value
            critical_kw += value

        for category, raw_kw in noncritical_raw.items():
            value = round(raw_kw * noise_noncritical, 3)
            by_category[category] = by_category.get(category, 0.0) + value
            noncritical_kw += value

        critical_kw = round(critical_kw, 3)
        noncritical_kw = round(noncritical_kw, 3)
        total_kw = round(critical_kw + noncritical_kw, 3)

        hourly_records.append(
            HourlyDemand(
                timestamp=ts,
                total_kw=total_kw,
                critical_kw=critical_kw,
                noncritical_kw=noncritical_kw,
                by_category=by_category,
            )
        )

    total_kwh = round(sum(h.total_kw for h in hourly_records), 3)
    critical_kwh = round(sum(h.critical_kw for h in hourly_records), 3)

    peak_record = max(hourly_records, key=lambda h: h.total_kw)
    peak_kw = peak_record.total_kw
    peak_timestamp = peak_record.timestamp

    morning_records = [h for h in hourly_records if h.timestamp.hour in MORNING_HOURS]
    evening_records = [h for h in hourly_records if h.timestamp.hour in EVENING_HOURS]
    morning_peak_kw = max((h.total_kw for h in morning_records), default=0.0)
    evening_peak_kw = max((h.total_kw for h in evening_records), default=0.0)

    average_kw = total_kwh / horizon_hours
    load_factor = round(average_kw / peak_kw, 4) if peak_kw > 0 else 0.0

    return DemandProfile(
        village_id=village.id,
        horizon_hours=horizon_hours,
        hours=hourly_records,
        total_kwh=total_kwh,
        critical_kwh=critical_kwh,
        peak_kw=peak_kw,
        peak_timestamp=peak_timestamp,
        morning_peak_kw=morning_peak_kw,
        evening_peak_kw=evening_peak_kw,
        load_factor=load_factor,
    )
