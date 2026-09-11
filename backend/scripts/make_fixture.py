"""Generate the temporary mock optimize-response fixture for kutch_village.

This is a rule-based, hand-rolled dispatch simulation used ONLY to produce a
plausible, internally-consistent sample OptimizeResponse for Phase 1.2 (API
contract + DB + presets). It is NOT the real MILP optimizer, which lands in a
later phase.

Run with:
    backend/.venv/bin/python backend/scripts/make_fixture.py
"""

import json
import math
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.schemas.common import ForecastSource, ReasonCode  # noqa: E402
from app.schemas.optimize import (  # noqa: E402
    BaselineResult,
    HourlyDispatch,
    OptimizeResponse,
    PlanSummary,
    Savings,
    SolverInfo,
)

KOLKATA_TZ = timezone(timedelta(hours=5, minutes=30))
HORIZON = 48
START_TIME = datetime(2026, 1, 15, 0, 0, 0, tzinfo=KOLKATA_TZ)

# Battery (kutch_village preset)
BATTERY_CAPACITY_KWH = 50.0
SOC_MIN = 0.2
SOC_MAX = 1.0
SOC_INITIAL = 0.5
MAX_CHARGE_KW = 25.0
MAX_DISCHARGE_KW = 25.0
EFF_CHARGE = 0.95
EFF_DISCHARGE = 0.95
BATTERY_WEAR_COST_INR_PER_KWH = 2.0

# Diesel (kutch_village preset)
DIESEL_CAPACITY_KW = 25.0
DIESEL_MIN_LOAD_FRAC = 0.3
DIESEL_MIN_LOAD_KW = DIESEL_CAPACITY_KW * DIESEL_MIN_LOAD_FRAC
FUEL_INTERCEPT_L_PER_H_PER_KW = 0.08145
FUEL_SLOPE_L_PER_KWH = 0.246
FUEL_PRICE_INR_PER_L = 90.0
CO2_KG_PER_L = 2.68

# Economics
CO2_PENALTY_INR_PER_KG = 2.0
SHED_PENALTY_INR_PER_KWH = 100.0

EPS = 1e-6

DEMAND_PROFILE_DAY1 = [
    5, 4.5, 4.5, 4.5, 4.5, 5, 8, 10, 9, 7, 6.5, 6.5,
    6.5, 6.5, 6.5, 7, 7.5, 9, 14, 19, 18, 14, 9, 6.5,
]


def _critical_profile() -> list[float]:
    profile = []
    for h in range(24):
        value = 1.5
        if 6 <= h < 9 or 18 <= h < 21:
            value += 2.0
        profile.append(value)
    return profile


CRITICAL_PROFILE = _critical_profile()


def solar_curve(hour_of_day: int, peak_kw: float) -> float:
    if hour_of_day < 6 or hour_of_day > 18:
        return 0.0
    fraction = math.sin(math.pi * (hour_of_day - 6) / 12)
    return max(0.0, peak_kw * fraction)


def wind_curve(t: int) -> float:
    value = 4.5 + 2.5 * math.sin(2 * math.pi * t / 17) + 1.2 * math.cos(2 * math.pi * t / 7)
    return round(max(0.0, min(10.0, value)), 2)


def build_series() -> tuple[list[float], list[float], list[float], list[float]]:
    demand: list[float] = []
    critical: list[float] = []
    solar: list[float] = []
    for t in range(HORIZON):
        h = t % 24
        day = t // 24
        d = DEMAND_PROFILE_DAY1[h] * (1.03 if day == 1 else 1.0)
        demand.append(round(d, 2))
        critical.append(round(CRITICAL_PROFILE[h], 2))
        peak = 16.0 if day == 0 else 16.0 * 0.4
        solar.append(round(solar_curve(h, peak), 2))
    wind = [wind_curve(t) for t in range(HORIZON)]
    return demand, critical, solar, wind


def simulate(
    demand: list[float],
    critical: list[float],
    solar: list[float],
    wind: list[float],
    smart: bool,
) -> list[dict]:
    soc = SOC_INITIAL
    hourly: list[dict] = []

    for t in range(HORIZON):
        h = t % 24
        day = t // 24
        available_supply = solar[t] + wind[t]
        reason_codes: list[ReasonCode] = []
        curtailed_kw = 0.0
        load_shed_kw = 0.0

        if available_supply >= demand[t] - EPS:
            surplus = max(0.0, available_supply - demand[t])
            charge_headroom_kwh = max(0.0, (SOC_MAX - soc) * BATTERY_CAPACITY_KWH)
            charge_capacity_kw = min(MAX_CHARGE_KW, charge_headroom_kwh / EFF_CHARGE)
            charge_kw = min(surplus, charge_capacity_kw)
            leftover = surplus - charge_kw

            wind_curtail = min(leftover, wind[t])
            solar_curtail = leftover - wind_curtail
            solar_used_kw = solar[t] - solar_curtail
            wind_used_kw = wind[t] - wind_curtail
            curtailed_kw = leftover

            discharge_kw = 0.0
            diesel_kw = 0.0
            diesel_on = False

            soc = soc + (charge_kw * EFF_CHARGE) / BATTERY_CAPACITY_KWH
            soc = min(SOC_MAX, max(SOC_MIN, soc))

            reason_codes.append(ReasonCode.RENEWABLES_COVER_DEMAND)
            if charge_kw > EPS:
                reason_codes.append(ReasonCode.SOLAR_SURPLUS_CHARGING)
            if curtailed_kw > EPS:
                reason_codes.append(ReasonCode.CURTAILMENT_BATTERY_FULL)
        else:
            deficit = demand[t] - available_supply
            solar_used_kw = solar[t]
            wind_used_kw = wind[t]
            charge_kw = 0.0

            discharge_cap = MAX_DISCHARGE_KW if smart else MAX_DISCHARGE_KW * 0.5
            available_energy_kwh = max(0.0, (soc - SOC_MIN) * BATTERY_CAPACITY_KWH)
            max_discharge_from_energy_kw = available_energy_kwh * EFF_DISCHARGE
            discharge_kw = min(deficit, discharge_cap, max_discharge_from_energy_kw)

            soc = soc - discharge_kw / (EFF_DISCHARGE * BATTERY_CAPACITY_KWH)
            soc = min(SOC_MAX, max(SOC_MIN, soc))

            if discharge_kw > EPS and (18 <= h < 22):
                reason_codes.append(ReasonCode.EVENING_PEAK_DISCHARGE)
            if soc <= SOC_MIN + 1e-4:
                reason_codes.append(ReasonCode.SOC_AT_MINIMUM)

            remaining_deficit = deficit - discharge_kw
            diesel_kw = 0.0
            diesel_on = False

            if remaining_deficit > EPS:
                diesel_on = True
                diesel_kw = min(max(remaining_deficit, DIESEL_MIN_LOAD_KW), DIESEL_CAPACITY_KW)
                reason_codes.append(ReasonCode.DIESEL_EFFICIENT_LOADING)

                extra = diesel_kw - remaining_deficit
                if extra > EPS:
                    charge_headroom_kwh = max(0.0, (SOC_MAX - soc) * BATTERY_CAPACITY_KWH)
                    charge_capacity_kw = min(MAX_CHARGE_KW, charge_headroom_kwh / EFF_CHARGE)
                    extra_charge_kw = min(extra, charge_capacity_kw)
                    unused = extra - extra_charge_kw
                    diesel_kw -= unused

                    if extra_charge_kw > EPS:
                        charge_kw = extra_charge_kw
                        soc = soc + (charge_kw * EFF_CHARGE) / BATTERY_CAPACITY_KWH
                        soc = min(SOC_MAX, max(SOC_MIN, soc))
                        reason_codes.append(ReasonCode.DIESEL_CHARGING_BATTERY)
                        if smart and day == 0 and h == 23:
                            reason_codes.append(ReasonCode.PRECHARGE_FOR_FORECAST_DEFICIT)

            if not reason_codes:
                reason_codes.append(ReasonCode.RENEWABLES_COVER_DEMAND)

        if not reason_codes:
            reason_codes.append(ReasonCode.RENEWABLES_COVER_DEMAND)

        hourly.append(
            {
                "hour_index": t,
                "timestamp": START_TIME + timedelta(hours=t),
                "demand_kw": demand[t],
                "critical_demand_kw": critical[t],
                "solar_available_kw": solar[t],
                "wind_available_kw": wind[t],
                "solar_used_kw": round(solar_used_kw, 3),
                "wind_used_kw": round(wind_used_kw, 3),
                "curtailed_kw": round(curtailed_kw, 3),
                "battery_charge_kw": round(charge_kw, 3),
                "battery_discharge_kw": round(discharge_kw, 3),
                "soc": round(soc, 4),
                "diesel_kw": round(diesel_kw, 3),
                "diesel_on": diesel_on,
                "load_shed_kw": round(load_shed_kw, 3),
                "reason_codes": reason_codes,
            }
        )

    return hourly


def _hour_fuel_liters(diesel_kw: float, diesel_on: bool) -> float:
    intercept = FUEL_INTERCEPT_L_PER_H_PER_KW * DIESEL_CAPACITY_KW if diesel_on else 0.0
    return intercept + FUEL_SLOPE_L_PER_KWH * diesel_kw


def summarize(hourly: list[dict]) -> dict:
    fuel_cost = 0.0
    diesel_liters = 0.0
    diesel_hours = 0.0
    co2_kg = 0.0
    load_shed_kwh = 0.0
    curtailed_kwh = 0.0
    renewable_kwh = 0.0
    demand_kwh = 0.0
    total_cost = 0.0

    for row in hourly:
        liters = _hour_fuel_liters(row["diesel_kw"], row["diesel_on"])
        cost = liters * FUEL_PRICE_INR_PER_L
        co2 = liters * CO2_KG_PER_L
        wear_cost = (row["battery_charge_kw"] + row["battery_discharge_kw"]) * BATTERY_WEAR_COST_INR_PER_KWH
        shed_cost = row["load_shed_kw"] * SHED_PENALTY_INR_PER_KWH
        co2_cost = co2 * CO2_PENALTY_INR_PER_KG

        fuel_cost += cost
        diesel_liters += liters
        diesel_hours += 1.0 if row["diesel_on"] else 0.0
        co2_kg += co2
        load_shed_kwh += row["load_shed_kw"]
        curtailed_kwh += row["curtailed_kw"]
        renewable_kwh += row["solar_used_kw"] + row["wind_used_kw"]
        demand_kwh += row["demand_kw"]
        total_cost += cost + co2_cost + shed_cost + wear_cost

    served_kwh = demand_kwh - load_shed_kwh
    critical_kwh = sum(row["critical_demand_kw"] for row in hourly)

    return {
        "total_cost_inr": round(total_cost, 2),
        "fuel_cost_inr": round(fuel_cost, 2),
        "diesel_liters": round(diesel_liters, 2),
        "diesel_hours": diesel_hours,
        "co2_kg": round(co2_kg, 2),
        "renewable_share_pct": round(100 * renewable_kwh / served_kwh, 2) if served_kwh else 0.0,
        "uptime_pct": round(100 * served_kwh / demand_kwh, 2) if demand_kwh else 100.0,
        "critical_uptime_pct": 100.0 if critical_kwh else 100.0,
        "load_shed_kwh": round(load_shed_kwh, 3),
        "curtailed_kwh": round(curtailed_kwh, 3),
    }


def build_response() -> OptimizeResponse:
    demand, critical, solar, wind = build_series()

    smart_hourly = simulate(demand, critical, solar, wind, smart=True)
    naive_hourly = simulate(demand, critical, solar, wind, smart=False)

    smart_summary = summarize(smart_hourly)
    naive_summary = summarize(naive_hourly)

    savings = {
        "vs_strategy": "naive",
        "cost_saved_inr": round(naive_summary["total_cost_inr"] - smart_summary["total_cost_inr"], 2),
        "cost_saved_pct": round(
            100
            * (naive_summary["total_cost_inr"] - smart_summary["total_cost_inr"])
            / naive_summary["total_cost_inr"],
            2,
        )
        if naive_summary["total_cost_inr"]
        else 0.0,
        "diesel_hours_saved": naive_summary["diesel_hours"] - smart_summary["diesel_hours"],
        "diesel_liters_saved": round(naive_summary["diesel_liters"] - smart_summary["diesel_liters"], 2),
        "co2_saved_kg": round(naive_summary["co2_kg"] - smart_summary["co2_kg"], 2),
    }

    payload = {
        "run_id": str(uuid4()),
        "village_id": "kutch_village",
        "created_at": datetime.now(timezone.utc),
        "horizon_hours": HORIZON,
        "forecast_source": ForecastSource.SYNTHETIC,
        "hourly": smart_hourly,
        "summary": smart_summary,
        "baselines": [
            {
                "strategy": "naive",
                "summary": naive_summary,
                "hourly": naive_hourly,
            }
        ],
        "savings": [savings],
        "solver": {
            "status": "mock",
            "solve_time_ms": 0.0,
            "objective_value": smart_summary["total_cost_inr"],
        },
        "is_mock": True,
    }

    return OptimizeResponse.model_validate(payload)


def _assert_power_balance(hourly: list[dict]) -> None:
    for row in hourly:
        supply = row["solar_used_kw"] + row["wind_used_kw"] + row["battery_discharge_kw"] + row["diesel_kw"]
        demand_side = row["demand_kw"] - row["load_shed_kw"] + row["battery_charge_kw"]
        if abs(supply - demand_side) > 0.01:
            raise AssertionError(
                f"Power balance violated at hour {row['hour_index']}: "
                f"supply={supply:.4f} demand_side={demand_side:.4f}"
            )
        if not (SOC_MIN - 1e-6 <= row["soc"] <= SOC_MAX + 1e-6):
            raise AssertionError(f"SOC out of bounds at hour {row['hour_index']}: {row['soc']}")


def main() -> None:
    response = build_response()

    hourly_dicts = [row for row in json.loads(response.model_dump_json())["hourly"]]
    _assert_power_balance(hourly_dicts)
    for baseline in json.loads(response.model_dump_json())["baselines"]:
        _assert_power_balance(baseline["hourly"])

    out_path = BACKEND_ROOT / "app" / "fixtures" / "sample_optimize_response.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(response.model_dump_json(indent=2) + "\n")
    print(f"Wrote {out_path}")

    frontend_mock_path = (
        BACKEND_ROOT.parent / "frontend" / "src" / "mocks" / "optimize-response.json"
    )
    frontend_mock_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(out_path, frontend_mock_path)
    print(f"Copied to {frontend_mock_path}")


if __name__ == "__main__":
    main()
