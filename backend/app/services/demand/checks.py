"""Sanity checks on demand vs. installed capacity. Warnings only, never exceptions."""

from app.schemas.village import VillageConfig
from app.services.demand.models import DemandProfile

EVENING_PEAK_MIN_FRAC = 0.60
EVENING_PEAK_MAX_FRAC = 0.95


def check_system_adequacy(village: VillageConfig, demand_profile: DemandProfile) -> list[str]:
    warnings: list[str] = []

    diesel_kw = village.diesel.capacity_kw
    battery_discharge_kw = village.battery.max_discharge_kw

    if diesel_kw > 0:
        evening_frac = demand_profile.evening_peak_kw / diesel_kw
        if not (EVENING_PEAK_MIN_FRAC <= evening_frac <= EVENING_PEAK_MAX_FRAC):
            warnings.append(
                f"Evening peak ({demand_profile.evening_peak_kw:.1f} kW) is "
                f"{evening_frac * 100:.0f}% of diesel capacity ({diesel_kw:.1f} kW); "
                f"expected {EVENING_PEAK_MIN_FRAC * 100:.0f}-{EVENING_PEAK_MAX_FRAC * 100:.0f}%."
            )
    else:
        warnings.append(
            "Diesel capacity is 0 kW; evening peak adequacy cannot be assessed against diesel."
        )

    combined_capacity_kw = diesel_kw + battery_discharge_kw
    if demand_profile.peak_kw > combined_capacity_kw:
        warnings.append(
            f"Peak demand ({demand_profile.peak_kw:.1f} kW) exceeds diesel + battery max "
            f"discharge ({combined_capacity_kw:.1f} kW); system cannot meet peak demand "
            "without renewable generation."
        )

    critical_peak_kw = max((hour.critical_kw for hour in demand_profile.hours), default=0.0)
    if critical_peak_kw > diesel_kw:
        warnings.append(
            f"Critical demand peak ({critical_peak_kw:.1f} kW) exceeds diesel capacity "
            f"({diesel_kw:.1f} kW); critical load is not protected in a generator-only scenario."
        )

    return warnings
