"""Post-hoc verification of a DispatchResult against its OptimizationInputs.

Pure Python, no FastAPI/DB imports. Used by tests and by the debug endpoint
to catch modelling bugs — every DispatchResult produced by solve_dispatch
should pass this with zero violations.
"""

from app.optimizer.models import DispatchResult
from app.services.pipeline import OptimizationInputs

TOL = 0.01


def verify_dispatch(
    inputs: OptimizationInputs, result: DispatchResult, skip_terminal_soc: bool = False
) -> list[str]:
    """skip_terminal_soc: baselines legitimately don't guarantee ending at or
    above the initial SOC (they never look ahead), so callers checking a
    baseline result should pass True to skip just that one check."""
    violations: list[str] = []

    battery = inputs.village.battery
    diesel = inputs.village.diesel
    capacity_kwh = battery.capacity_kwh
    soc_min_kwh = capacity_kwh * battery.soc_min
    soc_max_kwh = capacity_kwh * battery.soc_max
    soc_initial_kwh = capacity_kwh * battery.soc_initial

    soc_prev_kwh = soc_initial_kwh

    for hour in result.hours:
        t = hour.hour_index
        soc_kwh = hour.soc * capacity_kwh

        # Power balance
        supply = hour.solar_used_kw + hour.wind_used_kw + hour.battery_discharge_kw + hour.diesel_kw
        demand_side = hour.demand_kw - hour.load_shed_kw + hour.battery_charge_kw
        if abs(supply - demand_side) > TOL:
            violations.append(
                f"hour {t}: power balance violated (supply={supply:.4f}, demand_side={demand_side:.4f})"
            )

        # Renewable accounting
        renewable_used = hour.solar_used_kw + hour.wind_used_kw + hour.curtailed_kw
        renewable_available = hour.solar_available_kw + hour.wind_available_kw
        if abs(renewable_used - renewable_available) > TOL:
            violations.append(
                f"hour {t}: renewable accounting violated "
                f"(used+curtailed={renewable_used:.4f}, available={renewable_available:.4f})"
            )

        # SOC bounds
        if soc_kwh < soc_min_kwh - TOL or soc_kwh > soc_max_kwh + TOL:
            violations.append(
                f"hour {t}: SOC {soc_kwh:.4f} kWh outside [{soc_min_kwh:.4f}, {soc_max_kwh:.4f}]"
            )

        # Battery dynamics
        expected_soc_kwh = (
            soc_prev_kwh + battery.eff_charge * hour.battery_charge_kw
            - hour.battery_discharge_kw / battery.eff_discharge
        )
        if abs(soc_kwh - expected_soc_kwh) > TOL:
            violations.append(
                f"hour {t}: battery dynamics inconsistent "
                f"(expected soc={expected_soc_kwh:.4f} kWh, got {soc_kwh:.4f} kWh)"
            )

        # Diesel either off or within its operating range
        if hour.diesel_on:
            min_load_kw = diesel.capacity_kw * diesel.min_load_frac
            if hour.diesel_kw < min_load_kw - TOL or hour.diesel_kw > diesel.capacity_kw + TOL:
                violations.append(
                    f"hour {t}: diesel_on but diesel_kw={hour.diesel_kw:.4f} outside "
                    f"[{min_load_kw:.4f}, {diesel.capacity_kw:.4f}]"
                )
        elif hour.diesel_kw > TOL:
            violations.append(f"hour {t}: diesel_on is False but diesel_kw={hour.diesel_kw:.4f}")

        # Shed bound: critical load can never be shed, unless explicitly relaxed
        if not result.relaxed_critical:
            noncritical_kw = inputs.noncritical_kw[t]
            if hour.load_shed_kw > noncritical_kw + TOL:
                violations.append(
                    f"hour {t}: load_shed_kw={hour.load_shed_kw:.4f} exceeds "
                    f"noncritical_kw={noncritical_kw:.4f}"
                )

        soc_prev_kwh = soc_kwh

    if result.hours and not skip_terminal_soc:
        final_soc_kwh = result.hours[-1].soc * capacity_kwh
        if final_soc_kwh < soc_initial_kwh - TOL:
            violations.append(
                f"terminal SOC {final_soc_kwh:.4f} kWh is below initial SOC "
                f"{soc_initial_kwh:.4f} kWh"
            )

    return violations
