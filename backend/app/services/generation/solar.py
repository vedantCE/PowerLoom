"""Solar power generation model.

Pure functions: no DB or FastAPI imports.
"""

NOCT_C: float = 45.0
STC_TEMP_C: float = 25.0
STC_IRRADIANCE_WM2: float = 1000.0
DEFAULT_TEMP_COEFF_PER_C: float = -0.004
DEFAULT_SYSTEM_LOSS: float = 0.14


def calculate_poa_irradiance(ghi_wm2: float, gti_wm2: float | None = None) -> float:
    """Calculate plane-of-array (POA) irradiance.

    Uses GTI (Global Tilted Irradiance) if available, otherwise falls back to GHI
    (Global Horizontal Irradiance).
    """
    if gti_wm2 is not None:
        return max(0.0, float(gti_wm2))
    return max(0.0, float(ghi_wm2))


def calculate_cell_temp(
    temp_amb_c: float,
    poa_wm2: float,
    noct_c: float = NOCT_C,
) -> float:
    """Calculate solar cell temperature using the NOCT model:

    T_cell = T_amb + (NOCT - 20) / 800 * G_poa
    """
    if poa_wm2 <= 0.0:
        return float(temp_amb_c)
    return float(temp_amb_c + (noct_c - 20.0) / 800.0 * poa_wm2)


def calculate_solar_power(
    capacity_kw: float,
    poa_wm2: float,
    cell_temp_c: float,
    system_loss: float = DEFAULT_SYSTEM_LOSS,
    temp_coeff_per_c: float = DEFAULT_TEMP_COEFF_PER_C,
) -> float:
    """Calculate solar power output in kW:

    P = capacity_kw * (G_poa / 1000) * (1 + temp_coeff_per_c * (T_cell - 25)) * (1 - system_loss)

    Clips to [0, capacity_kw]. Returns 0 when G_poa <= 0 or capacity_kw <= 0.
    """
    if capacity_kw <= 0.0 or poa_wm2 <= 0.0:
        return 0.0

    irradiance_ratio = poa_wm2 / STC_IRRADIANCE_WM2
    temp_factor = 1.0 + temp_coeff_per_c * (cell_temp_c - STC_TEMP_C)
    loss_factor = 1.0 - system_loss

    raw_power = capacity_kw * irradiance_ratio * temp_factor * loss_factor
    return max(0.0, min(float(capacity_kw), float(raw_power)))
