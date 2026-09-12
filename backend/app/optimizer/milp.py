"""Core MILP dispatch optimizer.

Pure Python: no FastAPI, no DB, no HTTP imports. Takes an OptimizationInputs
bundle and returns a plain DispatchResult. Time step is 1 hour, so kW and kWh
are numerically equal per step. All energy accounting is at the battery
terminals — efficiency losses apply on charge and discharge.
"""

import hashlib
import json
import logging
import os
import time
from collections import OrderedDict

import pulp

from app.optimizer.models import DispatchHour, DispatchResult
from app.services.pipeline import OptimizationInputs

logger = logging.getLogger(__name__)

CLAMP_TOL = 1e-6
RELAXED_SHED_PENALTY_MULTIPLIER = 10.0

# The unit-commitment-style diesel on/off + battery charge/discharge binaries
# give CBC a weak LP relaxation, so proving strict optimality on a 48-hour
# preset can take several seconds on a single thread. Multiple threads plus a
# small relative MIP gap keeps solves fast while staying close to the true
# optimum. `fast=True` trades more gap for a near-instant response, meant for
# slider-driven what-if runs; `fast=False` is the default full-quality run.
SOLVER_THREADS = min(os.cpu_count() or 4, 8)
FAST_GAP_REL = 0.05
FAST_TIME_LIMIT_S = 5.0
DEFAULT_GAP_REL = 0.01
DEFAULT_TIME_LIMIT_S = 20.0

_CACHE_MAXSIZE = 64
_result_cache: "OrderedDict[str, DispatchResult]" = OrderedDict()


def _cache_key(inputs: OptimizationInputs, fast: bool) -> str:
    payload = {
        "village": inputs.village.model_dump(mode="json"),
        "horizon_hours": inputs.horizon_hours,
        "start_hour": inputs.start_time.isoformat(),
        "demand_kw": [round(v, 3) for v in inputs.demand_kw],
        "critical_kw": [round(v, 3) for v in inputs.critical_kw],
        "noncritical_kw": [round(v, 3) for v in inputs.noncritical_kw],
        "solar_available_kw": [round(v, 3) for v in inputs.solar_available_kw],
        "wind_available_kw": [round(v, 3) for v in inputs.wind_available_kw],
        "diesel_available": inputs.diesel_available,
        "fast": fast,
    }
    encoded = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def format_solver_status(status: str, gap_rel: float) -> str:
    """Human-readable status for SolverInfo, e.g. "Optimal (gap 1.0%)".

    CBC's gapRel is an upper bound the solver guarantees when it reports
    Optimal, so this reports that configured tolerance rather than an exact
    achieved gap (which PuLP doesn't expose without parsing solver logs).
    """
    if status != "Optimal":
        return status
    return f"Optimal (gap {gap_rel * 100:.1f}%)"


def _needs_critical_relaxation(inputs: OptimizationInputs) -> bool:
    """True if critical demand in any hour exceeds every source combined.

    A necessary (not sufficient — it ignores battery SOC dynamics across
    hours) per-hour check: if it trips, the strict "critical can never be
    shed" constraint would make the model infeasible, so the caller must
    relax it.
    """
    diesel_cap_kw = inputs.village.diesel.capacity_kw if inputs.diesel_available else 0.0
    battery_discharge_kw = inputs.village.battery.max_discharge_kw

    for t in range(inputs.horizon_hours):
        max_available_kw = (
            inputs.solar_available_kw[t]
            + inputs.wind_available_kw[t]
            + battery_discharge_kw
            + diesel_cap_kw
        )
        if inputs.critical_kw[t] > max_available_kw + CLAMP_TOL:
            return True
    return False


def _clamp(value: float | None, tol: float = CLAMP_TOL) -> float:
    if value is None:
        return 0.0
    if -tol <= value < 0:
        return 0.0
    return value


def solve_dispatch(
    inputs: OptimizationInputs, fast: bool = False, time_limit_s: float | None = None
) -> DispatchResult:
    cache_key = _cache_key(inputs, fast)
    cached = _result_cache.get(cache_key)
    if cached is not None:
        _result_cache.move_to_end(cache_key)
        return cached

    gap_rel = FAST_GAP_REL if fast else DEFAULT_GAP_REL
    if time_limit_s is None:
        time_limit_s = FAST_TIME_LIMIT_S if fast else DEFAULT_TIME_LIMIT_S

    village = inputs.village
    battery = village.battery
    diesel = village.diesel
    economics = village.economics
    horizon = inputs.horizon_hours

    capacity_kwh = battery.capacity_kwh
    soc_min_kwh = capacity_kwh * battery.soc_min
    soc_max_kwh = capacity_kwh * battery.soc_max
    soc_initial_kwh = capacity_kwh * battery.soc_initial

    relaxed_critical = _needs_critical_relaxation(inputs)
    if relaxed_critical:
        logger.warning(
            "Critical demand exceeds solar+wind+diesel+battery discharge in at least one hour "
            "for village '%s'; relaxing shed bound to full demand with a %sx penalty.",
            village.id,
            RELAXED_SHED_PENALTY_MULTIPLIER,
        )

    prob = pulp.LpProblem("PowerloomDispatch", pulp.LpMinimize)

    solar_used = {}
    wind_used = {}
    curtail = {}
    charge = {}
    discharge = {}
    soc_kwh = {}
    diesel_kw = {}
    diesel_on = {}
    shed = {}
    charge_on = {}

    for t in range(horizon):
        solar_used[t] = pulp.LpVariable(f"solar_used_{t}", 0, inputs.solar_available_kw[t])
        wind_used[t] = pulp.LpVariable(f"wind_used_{t}", 0, inputs.wind_available_kw[t])
        curtail[t] = pulp.LpVariable(f"curtail_{t}", 0)
        charge[t] = pulp.LpVariable(f"charge_{t}", 0, battery.max_charge_kw)
        discharge[t] = pulp.LpVariable(f"discharge_{t}", 0, battery.max_discharge_kw)
        soc_kwh[t] = pulp.LpVariable(f"soc_kwh_{t}", soc_min_kwh, soc_max_kwh)
        diesel_kw[t] = pulp.LpVariable(f"diesel_{t}", 0, diesel.capacity_kw)
        diesel_on[t] = pulp.LpVariable(f"diesel_on_{t}", cat=pulp.LpBinary)
        charge_on[t] = pulp.LpVariable(f"charge_on_{t}", cat=pulp.LpBinary)

        shed_upper_kw = inputs.demand_kw[t] if relaxed_critical else inputs.noncritical_kw[t]
        shed[t] = pulp.LpVariable(f"shed_{t}", 0, shed_upper_kw)

    for t in range(horizon):
        # 1. Power balance
        prob += (
            solar_used[t] + wind_used[t] + discharge[t] + diesel_kw[t]
            == inputs.demand_kw[t] - shed[t] + charge[t]
        ), f"power_balance_{t}"

        # 2. Renewable accounting
        prob += (
            solar_used[t] + wind_used[t] + curtail[t]
            == inputs.solar_available_kw[t] + inputs.wind_available_kw[t]
        ), f"renewable_accounting_{t}"

        # 3. Battery dynamics
        soc_prev = soc_initial_kwh if t == 0 else soc_kwh[t - 1]
        prob += (
            soc_kwh[t] == soc_prev + battery.eff_charge * charge[t] - discharge[t] / battery.eff_discharge
        ), f"battery_dynamics_{t}"

        # 4. No simultaneous charge/discharge
        prob += charge[t] <= battery.max_charge_kw * charge_on[t], f"charge_exclusivity_{t}"
        prob += (
            discharge[t] <= battery.max_discharge_kw * (1 - charge_on[t])
        ), f"discharge_exclusivity_{t}"

        # 5. Diesel operating range
        prob += (
            diesel_kw[t] >= diesel.capacity_kw * diesel.min_load_frac * diesel_on[t]
        ), f"diesel_min_load_{t}"
        prob += diesel_kw[t] <= diesel.capacity_kw * diesel_on[t], f"diesel_max_load_{t}"

        # 6. Diesel availability override
        if not inputs.diesel_available:
            prob += diesel_on[t] == 0, f"diesel_unavailable_{t}"

    # 7. Terminal condition: don't borrow energy from the next day
    prob += soc_kwh[horizon - 1] >= soc_initial_kwh, "terminal_soc"

    shed_penalty = economics.shed_penalty_inr_per_kwh
    if relaxed_critical:
        shed_penalty *= RELAXED_SHED_PENALTY_MULTIPLIER

    def _diesel_liters(t: int):
        return (
            diesel.fuel_intercept_l_per_h_per_kw * diesel.capacity_kw * diesel_on[t]
            + diesel.fuel_slope_l_per_kwh * diesel_kw[t]
        )

    fuel_cost = pulp.lpSum(diesel.fuel_price_inr_per_l * _diesel_liters(t) for t in range(horizon))
    co2_cost = pulp.lpSum(
        economics.co2_penalty_inr_per_kg * diesel.co2_kg_per_l * _diesel_liters(t)
        for t in range(horizon)
    )
    battery_wear_cost = pulp.lpSum(
        battery.wear_cost_inr_per_kwh * (charge[t] + discharge[t]) / 2 for t in range(horizon)
    )
    shed_cost = pulp.lpSum(shed_penalty * shed[t] for t in range(horizon))

    prob += fuel_cost + co2_cost + battery_wear_cost + shed_cost

    solver = pulp.PULP_CBC_CMD(
        msg=False, timeLimit=time_limit_s, threads=SOLVER_THREADS, gapRel=gap_rel
    )
    start = time.perf_counter()
    prob.solve(solver)
    solve_time_ms = (time.perf_counter() - start) * 1000

    status = pulp.LpStatus[prob.status]
    infeasible = status != "Optimal"
    objective_value = pulp.value(prob.objective)

    hours: list[DispatchHour] = []
    for t in range(horizon):
        solar_used_kw = _clamp(pulp.value(solar_used[t]))
        wind_used_kw = _clamp(pulp.value(wind_used[t]))
        curtailed_kw = _clamp(pulp.value(curtail[t]))
        battery_charge_kw = _clamp(pulp.value(charge[t]))
        battery_discharge_kw = _clamp(pulp.value(discharge[t]))
        diesel_kw_value = _clamp(pulp.value(diesel_kw[t]))
        load_shed_kw = _clamp(pulp.value(shed[t]))
        diesel_on_value = pulp.value(diesel_on[t])
        diesel_on_bool = round(diesel_on_value) == 1 if diesel_on_value is not None else False
        soc_kwh_value = pulp.value(soc_kwh[t])
        soc_fraction = (soc_kwh_value / capacity_kwh) if soc_kwh_value is not None and capacity_kwh > 0 else 0.0

        hours.append(
            DispatchHour(
                hour_index=t,
                timestamp=inputs.timestamps[t],
                demand_kw=inputs.demand_kw[t],
                critical_kw=inputs.critical_kw[t],
                solar_available_kw=inputs.solar_available_kw[t],
                wind_available_kw=inputs.wind_available_kw[t],
                solar_used_kw=solar_used_kw,
                wind_used_kw=wind_used_kw,
                curtailed_kw=curtailed_kw,
                battery_charge_kw=battery_charge_kw,
                battery_discharge_kw=battery_discharge_kw,
                soc=soc_fraction,
                diesel_kw=diesel_kw_value,
                diesel_on=diesel_on_bool,
                load_shed_kw=load_shed_kw,
                reason_codes=[],
            )
        )

    result = DispatchResult(
        hours=hours,
        status=status,
        objective_value=objective_value,
        solve_time_ms=solve_time_ms,
        infeasible=infeasible,
        relaxed_critical=relaxed_critical,
        strategy="optimized",
    )

    _result_cache[cache_key] = result
    if len(_result_cache) > _CACHE_MAXSIZE:
        _result_cache.popitem(last=False)

    return result
