"""Cost/emissions/reliability metrics derived from a DispatchResult.

Pure functions, no solver — used for both the MILP result and the two
baselines, so the same PlanSummary shape can be compared apples-to-apples.
The per-hour cost terms here MUST mirror the MILP objective in
app/optimizer/milp.py exactly, so solve_dispatch's objective_value and
compute_summary's total_cost_inr agree (tested to within 1%).
"""

from app.optimizer.models import DispatchResult
from app.schemas.optimize import PlanSummary, Savings
from app.services.pipeline import OptimizationInputs

TOL = 1e-6


def compute_summary(inputs: OptimizationInputs, result: DispatchResult) -> PlanSummary:
    diesel = inputs.village.diesel
    battery = inputs.village.battery
    economics = inputs.village.economics

    total_liters = 0.0
    fuel_cost_inr = 0.0
    co2_kg = 0.0
    battery_wear_cost = 0.0
    shed_cost = 0.0

    diesel_hours = 0
    served_load_kwh = 0.0
    renewable_kwh = 0.0
    uptime_hours = 0
    critical_uptime_hours = 0
    load_shed_kwh = 0.0
    curtailed_kwh = 0.0

    horizon_hours = len(result.hours)

    for hour in result.hours:
        liters = 0.0
        if hour.diesel_on:
            liters = (
                diesel.fuel_intercept_l_per_h_per_kw * diesel.capacity_kw
                + diesel.fuel_slope_l_per_kwh * hour.diesel_kw
            )
            diesel_hours += 1

        total_liters += liters
        fuel_cost_inr += liters * diesel.fuel_price_inr_per_l
        co2_kg += liters * diesel.co2_kg_per_l
        battery_wear_cost += (
            battery.wear_cost_inr_per_kwh * (hour.battery_charge_kw + hour.battery_discharge_kw) / 2
        )
        shed_cost += economics.shed_penalty_inr_per_kwh * hour.load_shed_kw

        served_load_kwh += hour.demand_kw - hour.load_shed_kw
        renewable_kwh += hour.solar_used_kw + hour.wind_used_kw
        load_shed_kwh += hour.load_shed_kw
        curtailed_kwh += hour.curtailed_kw

        if hour.load_shed_kw <= TOL:
            uptime_hours += 1

        noncritical_kw = inputs.noncritical_kw[hour.hour_index]
        if hour.load_shed_kw <= noncritical_kw + TOL:
            critical_uptime_hours += 1

    co2_penalty_cost = economics.co2_penalty_inr_per_kg * co2_kg

    # The optimizer is hard-constrained to end the horizon with at least as
    # much stored energy as it started with (it "must not borrow energy from
    # the next day" — see milp.py). A rule-based baseline has no such
    # discipline and can end lower, effectively spending down a stored asset
    # for free. Without accounting for that, comparing raw costs would be
    # comparing a plan that pays to refill the battery against one that
    # doesn't — not apples-to-apples. Valuing the shortfall at the shed
    # penalty rate (this system's own measure of "leaving a plan worse off
    # than it should be") keeps the comparison fair; it's always exactly 0
    # for the optimizer's own result since that constraint guarantees no
    # shortfall, so this never affects the objective-agreement check.
    initial_soc_kwh = battery.capacity_kwh * battery.soc_initial
    final_soc_kwh = result.hours[-1].soc * battery.capacity_kwh if result.hours else initial_soc_kwh
    terminal_shortfall_kwh = max(0.0, initial_soc_kwh - final_soc_kwh)
    terminal_shortfall_cost = terminal_shortfall_kwh * economics.shed_penalty_inr_per_kwh

    total_cost_inr = fuel_cost_inr + co2_penalty_cost + battery_wear_cost + shed_cost + terminal_shortfall_cost

    renewable_share_pct = (renewable_kwh / served_load_kwh * 100) if served_load_kwh > TOL else 0.0
    uptime_pct = (uptime_hours / horizon_hours * 100) if horizon_hours > 0 else 0.0
    critical_uptime_pct = (critical_uptime_hours / horizon_hours * 100) if horizon_hours > 0 else 0.0

    return PlanSummary(
        total_cost_inr=round(total_cost_inr, 4),
        fuel_cost_inr=round(fuel_cost_inr, 4),
        diesel_liters=round(total_liters, 4),
        diesel_hours=float(diesel_hours),
        co2_kg=round(co2_kg, 4),
        renewable_share_pct=round(renewable_share_pct, 3),
        uptime_pct=round(uptime_pct, 3),
        critical_uptime_pct=round(critical_uptime_pct, 3),
        load_shed_kwh=round(load_shed_kwh, 4),
        curtailed_kwh=round(curtailed_kwh, 4),
    )


def compute_savings(optimized: PlanSummary, baseline: PlanSummary, strategy: str) -> Savings:
    cost_saved_inr = baseline.total_cost_inr - optimized.total_cost_inr
    cost_saved_pct = (
        (cost_saved_inr / baseline.total_cost_inr * 100) if abs(baseline.total_cost_inr) > TOL else 0.0
    )
    diesel_hours_saved = baseline.diesel_hours - optimized.diesel_hours
    diesel_liters_saved = baseline.diesel_liters - optimized.diesel_liters
    co2_saved_kg = baseline.co2_kg - optimized.co2_kg

    return Savings(
        vs_strategy=strategy,
        cost_saved_inr=round(cost_saved_inr, 4),
        cost_saved_pct=round(cost_saved_pct, 3),
        diesel_hours_saved=diesel_hours_saved,
        diesel_liters_saved=round(diesel_liters_saved, 4),
        co2_saved_kg=round(co2_saved_kg, 4),
    )
