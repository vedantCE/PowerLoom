"""Wind power generation model.

Pure functions: no DB or FastAPI imports.
"""

WIND_AVAILABILITY_FACTOR: float = 0.90
POWER_LAW_EXPONENT: float = 0.14
DEFAULT_CUT_IN_MS: float = 3.0
DEFAULT_RATED_MS: float = 11.0
DEFAULT_CUT_OUT_MS: float = 25.0
DEFAULT_HUB_HEIGHT_M: float = 30.0


def calculate_hub_wind_speed(
    wind_speed_80m_ms: float | None,
    wind_speed_10m_ms: float,
    hub_height_m: float = DEFAULT_HUB_HEIGHT_M,
) -> float:
    """Calculate wind speed at turbine hub height using the power law:

    v_hub = v80 * (hub_height_m / 80) ** 0.14
    If v80 is missing/None, falls back to:
    v_hub = v10 * (hub_height_m / 10) ** 0.14
    """
    if wind_speed_80m_ms is not None:
        v_hub = wind_speed_80m_ms * (hub_height_m / 80.0) ** POWER_LAW_EXPONENT
    else:
        v_hub = wind_speed_10m_ms * (hub_height_m / 10.0) ** POWER_LAW_EXPONENT
    return max(0.0, float(v_hub))


def calculate_wind_power(
    capacity_kw: float,
    hub_wind_speed_ms: float,
    cut_in_ms: float = DEFAULT_CUT_IN_MS,
    rated_ms: float = DEFAULT_RATED_MS,
    cut_out_ms: float = DEFAULT_CUT_OUT_MS,
    availability_factor: float = WIND_AVAILABILITY_FACTOR,
) -> float:
    """Calculate wind power output in kW according to the standard cubic power curve:

    - v < cut_in or v >= cut_out -> 0
    - cut_in <= v < rated -> capacity * (v**3 - cut_in**3) / (rated**3 - cut_in**3)
    - rated <= v < cut_out -> capacity

    Applies WIND_AVAILABILITY_FACTOR (default 0.90) to account for wake, availability,
    and electrical collection losses. Returns 0 if capacity_kw == 0.
    """
    if capacity_kw <= 0.0 or hub_wind_speed_ms <= 0.0:
        return 0.0

    v = hub_wind_speed_ms
    if v < cut_in_ms or v >= cut_out_ms:
        return 0.0

    if v >= rated_ms:
        raw_power = capacity_kw
    else:
        denom = (rated_ms ** 3) - (cut_in_ms ** 3)
        if denom <= 0.0:
            return 0.0
        numer = (v ** 3) - (cut_in_ms ** 3)
        raw_power = capacity_kw * (numer / denom)

    power = raw_power * availability_factor
    return max(0.0, float(power))
