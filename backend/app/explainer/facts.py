"""Pure fact extractor — NO LLM, NO side effects.

build_hour_facts takes an OptimizeResponse (as a plain dict from stored JSON)
and the hour_index, and returns a flat dict of every number the Gemini prompt
will be allowed to reference.  The model is instructed to use ONLY these
values so our explainability claim is auditable.
"""

from __future__ import annotations

from zoneinfo import ZoneInfo

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
EVENING_START = 17
EVENING_END = 22  # inclusive

# Keys that must be present in every fact dict
REQUIRED_KEYS = {
    "local_time",
    "period",
    "demand_kw",
    "critical_kw",
    "solar_used_kw",
    "wind_used_kw",
    "battery_charge_kw",
    "battery_discharge_kw",
    "soc_pct",
    "soc_min_pct",
    "diesel_on",
    "diesel_kw",
    "diesel_pct_of_capacity",
    "curtailed_kw",
    "load_shed_kw",
    "reason_codes",
    "prev_soc_pct",
    "next12h_renewable_ratio",
    "in_evening_peak",
}


def build_hour_facts(
    response_dict: dict,
    hour_index: int,
    village_config_dict: dict,
) -> dict:
    """Build the structured fact payload for one dispatch hour.

    Parameters
    ----------
    response_dict:
        The stored OptimizeResponse as a plain Python dict (from response_json).
    hour_index:
        Which hour to explain (0-based).
    village_config_dict:
        The effective VillageConfig as a plain dict (loaded from preset),
        used to fetch battery.soc_min and diesel.capacity_kw.

    Returns
    -------
    dict with every key in REQUIRED_KEYS; all floats rounded to 1 decimal.
    """
    hourly: list[dict] = response_dict["hourly"]
    h = hourly[hour_index]

    # ── Time label ────────────────────────────────────────────────────────────
    from datetime import datetime

    ts_raw = h["timestamp"]
    if isinstance(ts_raw, str):
        ts = datetime.fromisoformat(ts_raw)
    else:
        ts = ts_raw
    # Convert to Kolkata local time
    ts_local = ts.astimezone(KOLKATA_TZ)
    hour_of_day = ts_local.hour
    local_time = ts_local.strftime("%d %b %Y %H:%M IST")
    period = "day" if 6 <= hour_of_day < 20 else "night"

    # ── Battery config ────────────────────────────────────────────────────────
    battery_cfg = village_config_dict.get("battery", {})
    soc_min_frac = battery_cfg.get("soc_min", 0.2)
    soc_min_pct = round(soc_min_frac * 100, 1)

    # ── Diesel config ─────────────────────────────────────────────────────────
    diesel_cfg = village_config_dict.get("diesel", {})
    diesel_capacity_kw = diesel_cfg.get("capacity_kw", 1.0)  # avoid div/0

    # ── Core hour values ──────────────────────────────────────────────────────
    def r1(v: float | int | bool | None) -> float:
        if v is None or isinstance(v, bool):
            return float(v or 0)
        return round(float(v), 1)

    demand_kw = r1(h.get("demand_kw", 0))
    critical_kw = r1(h.get("critical_demand_kw", 0))
    solar_used_kw = r1(h.get("solar_used_kw", 0))
    wind_used_kw = r1(h.get("wind_used_kw", 0))
    battery_charge_kw = r1(h.get("battery_charge_kw", 0))
    battery_discharge_kw = r1(h.get("battery_discharge_kw", 0))
    soc_pct = round(h.get("soc", 0) * 100, 1)
    diesel_on = bool(h.get("diesel_on", False))
    diesel_kw = r1(h.get("diesel_kw", 0))
    diesel_pct_of_capacity = round(
        (diesel_kw / diesel_capacity_kw * 100) if diesel_capacity_kw > 0 else 0.0, 1
    )
    curtailed_kw = r1(h.get("curtailed_kw", 0))
    load_shed_kw = r1(h.get("load_shed_kw", 0))
    reason_codes: list[str] = h.get("reason_codes", [])

    # ── Context facts ─────────────────────────────────────────────────────────
    # (a) Previous hour SOC
    if hour_index > 0:
        prev_h = hourly[hour_index - 1]
        prev_soc_pct = round(prev_h.get("soc", 0) * 100, 1)
    else:
        # No previous hour — use initial SOC from battery config
        prev_soc_pct = round(battery_cfg.get("soc_initial", 0.5) * 100, 1)

    # (b) Next 12 h renewable vs demand ratio
    horizon = len(hourly)
    window_end = min(hour_index + 13, horizon)  # hours hour_index+1 … hour_index+12
    window_start = hour_index + 1
    if window_start < window_end:
        next12_renewable = sum(
            h2.get("solar_used_kw", 0) + h2.get("wind_used_kw", 0)
            + h2.get("solar_available_kw", 0) + h2.get("wind_available_kw", 0)
            for h2 in hourly[window_start:window_end]
        )
        # Use available (not used) for forward-looking ratio — available is
        # what the optimizer can see in the forecast window.
        next12_ren_avail = sum(
            h2.get("solar_available_kw", 0) + h2.get("wind_available_kw", 0)
            for h2 in hourly[window_start:window_end]
        )
        next12_demand = sum(
            h2.get("demand_kw", 0) for h2 in hourly[window_start:window_end]
        )
        if next12_demand > 0:
            next12h_renewable_ratio = round(next12_ren_avail / next12_demand, 2)
        else:
            next12h_renewable_ratio = 1.0
    else:
        next12h_renewable_ratio = 1.0

    # (c) Evening peak window (17:00–22:59 IST)
    in_evening_peak = EVENING_START <= hour_of_day <= EVENING_END

    return {
        "local_time": local_time,
        "period": period,
        "demand_kw": demand_kw,
        "critical_kw": critical_kw,
        "solar_used_kw": solar_used_kw,
        "wind_used_kw": wind_used_kw,
        "battery_charge_kw": battery_charge_kw,
        "battery_discharge_kw": battery_discharge_kw,
        "soc_pct": soc_pct,
        "soc_min_pct": soc_min_pct,
        "diesel_on": diesel_on,
        "diesel_kw": diesel_kw,
        "diesel_pct_of_capacity": diesel_pct_of_capacity,
        "curtailed_kw": curtailed_kw,
        "load_shed_kw": load_shed_kw,
        "reason_codes": reason_codes,
        "prev_soc_pct": prev_soc_pct,
        "next12h_renewable_ratio": next12h_renewable_ratio,
        "in_evening_peak": in_evening_peak,
    }
