"""Rule-based dispatch baselines: how operators run these systems today.

Pure functions, no solver — each hour is simulated greedily with the same
physics as the MILP (efficiencies, SOC limits, diesel min load), but with no
forecast look-ahead. Used as the "what would happen without the optimizer"
comparison.
"""

import time

from app.optimizer.models import DispatchHour, DispatchResult
from app.services.pipeline import OptimizationInputs

TOL = 1e-6


def _simulate(inputs: OptimizationInputs, strategy: str, boost_charge: bool) -> DispatchResult:
    battery = inputs.village.battery
    diesel = inputs.village.diesel

    capacity_kwh = battery.capacity_kwh
    soc_min_kwh = capacity_kwh * battery.soc_min
    soc_max_kwh = capacity_kwh * battery.soc_max
    min_load_kw = diesel.capacity_kw * diesel.min_load_frac

    soc_kwh = capacity_kwh * battery.soc_initial
    hours: list[DispatchHour] = []

    start = time.perf_counter()
    for t in range(inputs.horizon_hours):
        demand = inputs.demand_kw[t]
        critical = inputs.critical_kw[t]
        noncritical = inputs.noncritical_kw[t]
        solar_avail = inputs.solar_available_kw[t]
        wind_avail = inputs.wind_available_kw[t]

        # 1. Serve demand with renewables first.
        renewable_avail = solar_avail + wind_avail
        if renewable_avail >= demand:
            demand_covered_by_renewables = demand
            surplus = renewable_avail - demand
            deficit = 0.0
        else:
            demand_covered_by_renewables = renewable_avail
            surplus = 0.0
            deficit = demand - renewable_avail

        charge_kw = 0.0
        discharge_kw = 0.0
        curtailed_kw = 0.0

        if surplus > TOL:
            room_kwh = max(0.0, soc_max_kwh - soc_kwh)
            charge_capacity_kw = (
                min(battery.max_charge_kw, room_kwh / battery.eff_charge)
                if battery.eff_charge > 0
                else 0.0
            )
            charge_kw = min(surplus, charge_capacity_kw)
            curtailed_kw = surplus - charge_kw
        elif deficit > TOL:
            # 2. Discharge the battery down to soc_min to cover the deficit.
            available_kwh = max(0.0, soc_kwh - soc_min_kwh)
            discharge_capacity_kw = min(battery.max_discharge_kw, available_kwh * battery.eff_discharge)
            discharge_kw = min(deficit, discharge_capacity_kw)
            deficit -= discharge_kw

        # Renewable energy actually drawn on = what covered demand plus
        # whatever went to charging (only possible in the surplus branch);
        # split across solar/wind (solar first, arbitrarily — both are free)
        # so solar_used + wind_used + curtailed_kw == solar_avail + wind_avail.
        total_renewable_used = demand_covered_by_renewables + charge_kw
        solar_used = min(solar_avail, total_renewable_used)
        wind_used = total_renewable_used - solar_used

        # 3. Run diesel to cover any remaining deficit, clamped up to capacity
        # and up (not down) to min load.
        diesel_kw = 0.0
        diesel_on = False
        if deficit > TOL and inputs.diesel_available and diesel.capacity_kw > 0:
            diesel_on = True
            if boost_charge:
                room_kwh = max(0.0, soc_max_kwh - soc_kwh)
                charge_capacity_kw = (
                    min(battery.max_charge_kw, room_kwh / battery.eff_charge)
                    if battery.eff_charge > 0
                    else 0.0
                )
                target_kw = deficit + charge_capacity_kw
            else:
                target_kw = deficit

            diesel_kw = min(max(target_kw, min_load_kw), diesel.capacity_kw)
            covered = min(diesel_kw, deficit)
            excess_kw = diesel_kw - covered
            deficit -= covered

            if excess_kw > TOL:
                # Excess above the deficit charges the battery if there's
                # room. Any part of the deficit the battery was about to
                # cover on its own can be handed to diesel instead (diesel is
                # running at this load regardless), freeing more battery room
                # before anything is genuinely wasted.
                reduce_discharge = min(discharge_kw, excess_kw)
                discharge_kw -= reduce_discharge
                excess_kw -= reduce_discharge

                if excess_kw > TOL:
                    room_kwh = max(0.0, soc_max_kwh - soc_kwh)
                    charge_capacity_kw = (
                        min(battery.max_charge_kw - charge_kw, room_kwh / battery.eff_charge)
                        if battery.eff_charge > 0
                        else 0.0
                    )
                    charge_from_excess = min(excess_kw, max(0.0, charge_capacity_kw))
                    charge_kw += charge_from_excess
                    excess_kw -= charge_from_excess

                if excess_kw > TOL:
                    # Genuinely nowhere for it to go (e.g. min-load output
                    # exceeds both the deficit and the battery's headroom).
                    curtailed_kw += excess_kw

        # 4. Shed non-critical load first, then critical only if unavoidable.
        load_shed_kw = 0.0
        if deficit > TOL:
            shed_noncritical = min(deficit, noncritical)
            deficit -= shed_noncritical
            shed_critical = min(deficit, critical) if deficit > TOL else 0.0
            deficit -= shed_critical
            load_shed_kw = shed_noncritical + shed_critical

        discharge_term = discharge_kw / battery.eff_discharge if battery.eff_discharge > 0 else 0.0
        soc_kwh = soc_kwh + battery.eff_charge * charge_kw - discharge_term
        soc_kwh = min(max(soc_kwh, soc_min_kwh), soc_max_kwh)
        soc_fraction = soc_kwh / capacity_kwh if capacity_kwh > 0 else 0.0

        hours.append(
            DispatchHour(
                hour_index=t,
                timestamp=inputs.timestamps[t],
                demand_kw=demand,
                critical_kw=critical,
                solar_available_kw=solar_avail,
                wind_available_kw=wind_avail,
                solar_used_kw=solar_used,
                wind_used_kw=wind_used,
                curtailed_kw=curtailed_kw,
                battery_charge_kw=charge_kw,
                battery_discharge_kw=discharge_kw,
                soc=soc_fraction,
                diesel_kw=diesel_kw,
                diesel_on=diesel_on,
                load_shed_kw=load_shed_kw,
                reason_codes=[],
            )
        )

    solve_time_ms = (time.perf_counter() - start) * 1000
    return DispatchResult(
        hours=hours,
        status="Simulated",
        objective_value=None,
        solve_time_ms=solve_time_ms,
        infeasible=False,
        relaxed_critical=False,
        strategy=strategy,
    )


def naive_dispatch(inputs: OptimizationInputs) -> DispatchResult:
    """Load-following operator behaviour: renewables, then battery, then
    diesel at just-enough output, then shed. No look-ahead, no pre-charging."""
    return _simulate(inputs, strategy="naive", boost_charge=False)


def cycle_charging_dispatch(inputs: OptimizationInputs) -> DispatchResult:
    """Like naive, but whenever diesel is on it runs at a load that also
    charges the battery at max rate, avoiding inefficient low-load running."""
    return _simulate(inputs, strategy="cycle_charging", boost_charge=True)
