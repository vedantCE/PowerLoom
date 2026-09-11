"""Scenario overrides helper.

Applies what-if scenario parameter overrides to a VillageConfig instance.
Always returns a new deep copy and never mutates the original/cached preset.
"""

from app.schemas.optimize import WhatIfOverrides
from app.schemas.village import VillageConfig


def apply_config_overrides(
    village: VillageConfig,
    overrides: WhatIfOverrides,
) -> VillageConfig:
    """Apply what-if capacity and cost overrides to a village configuration.

    Returns a new deep copy of VillageConfig:
    - extra_solar_kw: added to solar.capacity_kw
    - extra_battery_kwh: added to battery.capacity_kwh, scaling max_charge_kw and
      max_discharge_kw proportionally to preserve C-rate
    - diesel_price_inr_per_l: replaces diesel.fuel_price_inr_per_l
    - initial_soc: replaces battery.soc_initial, clamped to [soc_min, soc_max]
    - diesel_available: preserved on overrides for optimizer use (not modified here)
    - cloud_cover_pct: not handled here (handled by forecast service)
    """
    new_village = village.model_copy(deep=True)

    if overrides.extra_solar_kw is not None:
        new_village.solar.capacity_kw = max(
            0.0, new_village.solar.capacity_kw + overrides.extra_solar_kw
        )

    if overrides.extra_battery_kwh is not None:
        orig_capacity = new_village.battery.capacity_kwh
        new_capacity = max(0.0, orig_capacity + overrides.extra_battery_kwh)
        new_village.battery.capacity_kwh = new_capacity
        if orig_capacity > 0:
            scale = new_capacity / orig_capacity
            new_village.battery.max_charge_kw = new_village.battery.max_charge_kw * scale
            new_village.battery.max_discharge_kw = new_village.battery.max_discharge_kw * scale

    if overrides.diesel_price_inr_per_l is not None:
        new_village.diesel.fuel_price_inr_per_l = overrides.diesel_price_inr_per_l

    if overrides.initial_soc is not None:
        clamped_soc = max(
            new_village.battery.soc_min,
            min(new_village.battery.soc_max, overrides.initial_soc),
        )
        new_village.battery.soc_initial = clamped_soc

    return new_village
