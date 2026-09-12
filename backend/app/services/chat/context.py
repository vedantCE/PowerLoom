"""Powerloom Context Builder.

Assembles comprehensive, structured microgrid and optimization data from the
backend state into a clean context dictionary and formatted prompt text for the
chat model.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

REASON_CODE_DESCRIPTIONS = {
    "PRECHARGE_FOR_FORECAST_DEFICIT": "Optimizer runs diesel proactively to pre-charge the battery before an upcoming multi-hour renewable deficit.",
    "SOLAR_SURPLUS_CHARGING": "Excess solar generation above current demand is stored into the battery.",
    "EVENING_PEAK_DISCHARGE": "Battery discharges during high-demand evening hours (17:00-23:00) to displace expensive diesel generation.",
    "RENEWABLES_COVER_DEMAND": "Renewable generation (solar + wind) completely covers the current village demand.",
    "DIESEL_EFFICIENT_LOADING": "Diesel generator runs in a high-efficiency load band to minimize specific fuel consumption.",
    "DIESEL_CHARGING_BATTERY": "Diesel generator operates at higher load to serve deficit and charge battery simultaneously.",
    "SOC_AT_MINIMUM": "Battery state-of-charge has reached the minimum allowable safety reserve (e.g. 20%), preventing further discharge.",
    "CURTAILMENT_BATTERY_FULL": "Renewable generation exceeds demand and battery is fully charged (SOC max), requiring excess generation curtailment.",
    "NONCRITICAL_LOAD_SHED": "Insufficient power available, non-critical appliances are temporarily shed while critical loads remain 100% protected.",
}


def _parse_datetime(dt_val: Any) -> datetime:
    if isinstance(dt_val, datetime):
        return dt_val
    if isinstance(dt_val, str):
        return datetime.fromisoformat(dt_val)
    raise ValueError(f"Cannot parse datetime from: {dt_val}")


def build_powerloom_context(
    village_config_dict: dict[str, Any],
    optimize_response_dict: dict[str, Any],
) -> dict[str, Any]:
    """Build a structured Powerloom microgrid context dictionary.

    Parameters
    ----------
    village_config_dict : dict
        The village preset / configuration dictionary.
    optimize_response_dict : dict
        The full optimize response dictionary (hourly dispatch, summary, baselines, savings).

    Returns
    -------
    dict
        Structured context suitable for prompt construction and auditability.
    """
    loc = village_config_dict.get("location", {})
    solar_cfg = village_config_dict.get("solar", {})
    wind_cfg = village_config_dict.get("wind", {})
    battery_cfg = village_config_dict.get("battery", {})
    diesel_cfg = village_config_dict.get("diesel", {})
    economics_cfg = village_config_dict.get("economics", {})

    hourly_list = optimize_response_dict.get("hourly", [])
    summary = optimize_response_dict.get("summary", {})
    savings_list = optimize_response_dict.get("savings", [])
    baselines_list = optimize_response_dict.get("baselines", [])
    solver_info = optimize_response_dict.get("solver", {})

    # Time information
    if hourly_list:
        first_ts = _parse_datetime(hourly_list[0]["timestamp"]).astimezone(KOLKATA_TZ)
        last_ts = _parse_datetime(hourly_list[-1]["timestamp"]).astimezone(KOLKATA_TZ)
        start_time_str = first_ts.strftime("%Y-%m-%d %H:%M IST")
        end_time_str = last_ts.strftime("%Y-%m-%d %H:%M IST")
        start_date_str = first_ts.strftime("%Y-%m-%d")
    else:
        first_ts = datetime.now(KOLKATA_TZ)
        start_time_str = first_ts.strftime("%Y-%m-%d %H:%M IST")
        end_time_str = ""
        start_date_str = first_ts.strftime("%Y-%m-%d")

    horizon_hours = optimize_response_dict.get("horizon_hours", len(hourly_list))

    # Savings vs baselines
    savings_naive = next((s for s in savings_list if s.get("vs_strategy") == "naive"), {})
    savings_cycle = next((s for s in savings_list if s.get("vs_strategy") == "cycle_charging"), {})

    # Baselines summary
    naive_base = next((b for b in baselines_list if b.get("strategy") == "naive"), {})
    cycle_base = next((b for b in baselines_list if b.get("strategy") == "cycle_charging"), {})

    # Process hourly dispatch
    processed_hours = []
    diesel_on_hours = []
    min_soc = 1.0
    min_soc_hour = 0
    max_demand = 0.0
    max_demand_hour = 0
    max_solar = 0.0
    max_solar_hour = 0
    unique_reason_codes: set[str] = set()

    for idx, h in enumerate(hourly_list):
        ts = _parse_datetime(h["timestamp"]).astimezone(KOLKATA_TZ)
        time_label = ts.strftime("%d %b %H:%M")
        day_label = "Today" if ts.strftime("%Y-%m-%d") == start_date_str else "Tomorrow"

        demand_kw = round(float(h.get("demand_kw", 0.0)), 2)
        critical_kw = round(float(h.get("critical_demand_kw", 0.0)), 2)
        solar_avail = round(float(h.get("solar_available_kw", 0.0)), 2)
        solar_used = round(float(h.get("solar_used_kw", 0.0)), 2)
        wind_avail = round(float(h.get("wind_available_kw", 0.0)), 2)
        wind_used = round(float(h.get("wind_used_kw", 0.0)), 2)
        charge_kw = round(float(h.get("battery_charge_kw", 0.0)), 2)
        discharge_kw = round(float(h.get("battery_discharge_kw", 0.0)), 2)
        soc = float(h.get("soc", 0.0))
        soc_pct = round(soc * 100, 1)
        diesel_kw = round(float(h.get("diesel_kw", 0.0)), 2)
        diesel_on = bool(h.get("diesel_on", False))
        load_shed_kw = round(float(h.get("load_shed_kw", 0.0)), 2)
        curtailed_kw = round(float(h.get("curtailed_kw", 0.0)), 2)
        reasons = [str(r) for r in h.get("reason_codes", [])]
        unique_reason_codes.update(reasons)

        if diesel_on:
            diesel_on_hours.append({"hour_index": idx, "time": time_label, "diesel_kw": diesel_kw})

        if soc < min_soc:
            min_soc = soc
            min_soc_hour = idx

        if demand_kw > max_demand:
            max_demand = demand_kw
            max_demand_hour = idx

        if solar_avail > max_solar:
            max_solar = solar_avail
            max_solar_hour = idx

        processed_hours.append({
            "hour_index": idx,
            "timestamp": h["timestamp"],
            "time_label": time_label,
            "day": day_label,
            "demand_kw": demand_kw,
            "critical_demand_kw": critical_kw,
            "solar_available_kw": solar_avail,
            "solar_used_kw": solar_used,
            "wind_available_kw": wind_avail,
            "wind_used_kw": wind_used,
            "battery_charge_kw": charge_kw,
            "battery_discharge_kw": discharge_kw,
            "soc_pct": soc_pct,
            "diesel_kw": diesel_kw,
            "diesel_on": diesel_on,
            "curtailed_kw": curtailed_kw,
            "load_shed_kw": load_shed_kw,
            "reason_codes": reasons,
        })

    # Current state (Hour 0)
    current_h = processed_hours[0] if processed_hours else {}

    context = {
        "site": {
            "village_id": village_config_dict.get("id", "dang_village"),
            "village_name": loc.get("name", "Dang Village"),
            "district": loc.get("district", "Dang"),
            "state": loc.get("state", "Gujarat"),
            "latitude": loc.get("latitude", 20.8),
            "longitude": loc.get("longitude", 73.7),
            "solar_capacity_kw": solar_cfg.get("capacity_kw", 15.0),
            "wind_capacity_kw": wind_cfg.get("capacity_kw", 0.0),
            "battery_capacity_kwh": battery_cfg.get("capacity_kwh", 40.0),
            "battery_max_charge_kw": battery_cfg.get("max_charge_kw", 10.0),
            "battery_max_discharge_kw": battery_cfg.get("max_discharge_kw", 10.0),
            "battery_soc_min_pct": round(battery_cfg.get("soc_min", 0.2) * 100, 1),
            "battery_soc_max_pct": round(battery_cfg.get("soc_max", 1.0) * 100, 1),
            "battery_soc_initial_pct": round(battery_cfg.get("soc_initial", 0.5) * 100, 1),
            "diesel_capacity_kw": diesel_cfg.get("capacity_kw", 10.0),
            "diesel_min_load_kw": round(
                diesel_cfg.get("capacity_kw", 10.0) * diesel_cfg.get("min_load_frac", 0.3), 2
            ),
            "diesel_min_load_frac": diesel_cfg.get("min_load_frac", 0.3),
            "fuel_price_inr_per_l": diesel_cfg.get("fuel_price_inr_per_l", 90.0),
            "co2_kg_per_l": diesel_cfg.get("co2_kg_per_l", 2.68),
            "shed_penalty_inr_per_kwh": economics_cfg.get("shed_penalty_inr_per_kwh", 100.0),
        },
        "time_horizon": {
            "start_time": start_time_str,
            "end_time": end_time_str,
            "timezone": "Asia/Kolkata (IST)",
            "horizon_hours": horizon_hours,
            "forecast_source": optimize_response_dict.get("forecast_source", "OPEN_METEO"),
        },
        "current_operating_state": {
            "hour_index": 0,
            "time_label": current_h.get("time_label", start_time_str),
            "demand_kw": current_h.get("demand_kw", 0.0),
            "critical_demand_kw": current_h.get("critical_demand_kw", 0.0),
            "solar_available_kw": current_h.get("solar_available_kw", 0.0),
            "solar_used_kw": current_h.get("solar_used_kw", 0.0),
            "wind_available_kw": current_h.get("wind_available_kw", 0.0),
            "wind_used_kw": current_h.get("wind_used_kw", 0.0),
            "battery_charge_kw": current_h.get("battery_charge_kw", 0.0),
            "battery_discharge_kw": current_h.get("battery_discharge_kw", 0.0),
            "battery_soc_pct": current_h.get("soc_pct", 50.0),
            "battery_status": (
                "Charging"
                if current_h.get("battery_charge_kw", 0.0) > 0.05
                else "Discharging"
                if current_h.get("battery_discharge_kw", 0.0) > 0.05
                else "Idle"
            ),
            "diesel_kw": current_h.get("diesel_kw", 0.0),
            "diesel_on": current_h.get("diesel_on", False),
            "diesel_status": "ON" if current_h.get("diesel_on", False) else "OFF",
            "load_shed_kw": current_h.get("load_shed_kw", 0.0),
            "reason_codes": current_h.get("reason_codes", []),
        },
        "performance_kpis": {
            "total_cost_inr": round(float(summary.get("total_cost_inr", 0.0)), 2),
            "fuel_cost_inr": round(float(summary.get("fuel_cost_inr", 0.0)), 2),
            "diesel_liters": round(float(summary.get("diesel_liters", 0.0)), 2),
            "diesel_hours": round(float(summary.get("diesel_hours", 0.0)), 1),
            "co2_kg": round(float(summary.get("co2_kg", 0.0)), 2),
            "renewable_share_pct": round(float(summary.get("renewable_share_pct", 0.0)), 1),
            "clean_uptime_pct": round(float(summary.get("uptime_pct", 0.0)), 1),
            "critical_uptime_pct": round(float(summary.get("critical_uptime_pct", 100.0)), 1),
            "load_shed_kwh": round(float(summary.get("load_shed_kwh", 0.0)), 2),
            "curtailed_kwh": round(float(summary.get("curtailed_kwh", 0.0)), 2),
            "savings_vs_naive": {
                "cost_saved_inr": round(float(savings_naive.get("cost_saved_inr", 0.0)), 2),
                "cost_saved_pct": round(float(savings_naive.get("cost_saved_pct", 0.0)), 1),
                "diesel_hours_saved": round(float(savings_naive.get("diesel_hours_saved", 0.0)), 1),
                "diesel_liters_saved": round(float(savings_naive.get("diesel_liters_saved", 0.0)), 2),
                "co2_saved_kg": round(float(savings_naive.get("co2_saved_kg", 0.0)), 2),
            },
            "savings_vs_cycle_charging": {
                "cost_saved_inr": round(float(savings_cycle.get("cost_saved_inr", 0.0)), 2),
                "cost_saved_pct": round(float(savings_cycle.get("cost_saved_pct", 0.0)), 1),
                "diesel_hours_saved": round(float(savings_cycle.get("diesel_hours_saved", 0.0)), 1),
                "diesel_liters_saved": round(float(savings_cycle.get("diesel_liters_saved", 0.0)), 2),
                "co2_saved_kg": round(float(savings_cycle.get("co2_saved_kg", 0.0)), 2),
            } if savings_cycle else None,
        },
        "baseline_comparison": {
            "naive_dispatch": {
                "strategy": "naive (standard load-following operator practice)",
                "total_cost_inr": round(float(naive_base.get("summary", {}).get("total_cost_inr", 0.0)), 2),
                "diesel_hours": round(float(naive_base.get("summary", {}).get("diesel_hours", 0.0)), 1),
                "diesel_liters": round(float(naive_base.get("summary", {}).get("diesel_liters", 0.0)), 2),
                "co2_kg": round(float(naive_base.get("summary", {}).get("co2_kg", 0.0)), 2),
            } if naive_base else None,
            "cycle_charging": {
                "strategy": "cycle_charging (run diesel at capacity to charge battery when turned on)",
                "total_cost_inr": round(float(cycle_base.get("summary", {}).get("total_cost_inr", 0.0)), 2),
                "diesel_hours": round(float(cycle_base.get("summary", {}).get("diesel_hours", 0.0)), 1),
                "diesel_liters": round(float(cycle_base.get("summary", {}).get("diesel_liters", 0.0)), 2),
                "co2_kg": round(float(cycle_base.get("summary", {}).get("co2_kg", 0.0)), 2),
            } if cycle_base else None,
        },
        "key_milestones": {
            "diesel_on_hours": diesel_on_hours,
            "lowest_soc": {
                "hour_index": min_soc_hour,
                "time": processed_hours[min_soc_hour]["time_label"] if processed_hours else "",
                "soc_pct": round(min_soc * 100, 1),
            },
            "peak_demand": {
                "hour_index": max_demand_hour,
                "time": processed_hours[max_demand_hour]["time_label"] if processed_hours else "",
                "demand_kw": max_demand,
            },
            "peak_solar": {
                "hour_index": max_solar_hour,
                "time": processed_hours[max_solar_hour]["time_label"] if processed_hours else "",
                "solar_kw": max_solar,
            },
        },
        "reason_codes_definitions": {
            code: REASON_CODE_DESCRIPTIONS.get(code, "Decision code assigned by optimizer.")
            for code in unique_reason_codes
        },
        "hourly_dispatch": processed_hours,
        "solver": solver_info,
    }

    return context


def format_context_for_prompt(ctx: dict[str, Any]) -> str:
    """Format the context dictionary into a concise, readable string for Gemini."""
    site = ctx["site"]
    time_h = ctx["time_horizon"]
    curr = ctx["current_operating_state"]
    kpi = ctx["performance_kpis"]
    savings_n = kpi["savings_vs_naive"]
    milestones = ctx["key_milestones"]
    reasons_def = ctx.get("reason_codes_definitions", {})

    lines: list[str] = []

    # 1. Microgrid & Site
    lines.append("=== 1. SITE & MICROGRID CONFIGURATION ===")
    lines.append(
        f"Site: {site['village_name']} ({site['district']}, {site['state']}) [ID: {site['village_id']}]"
    )
    lines.append(
        f"Capacities: Solar PV={site['solar_capacity_kw']} kW | Wind={site['wind_capacity_kw']} kW | "
        f"Battery={site['battery_capacity_kwh']} kWh (Max charge={site['battery_max_charge_kw']} kW, "
        f"Max discharge={site['battery_max_discharge_kw']} kW, Safety Reserve / SOC Min={site['battery_soc_min_pct']}%, "
        f"SOC Max={site['battery_soc_max_pct']}%, Initial SOC={site['battery_soc_initial_pct']}%) | "
        f"Diesel Generator={site['diesel_capacity_kw']} kW (Min load={site['diesel_min_load_kw']} kW / {int(site['diesel_min_load_frac']*100)}%)"
    )
    lines.append(
        f"Economics: Fuel Price=₹{site['fuel_price_inr_per_l']}/L | CO2={site['co2_kg_per_l']} kg/L | "
        f"Shed Penalty=₹{site['shed_penalty_inr_per_kwh']}/kWh"
    )

    # 2. Time & Horizon
    lines.append("\n=== 2. SIMULATION & HORIZON ===")
    lines.append(
        f"Start: {time_h['start_time']} | End: {time_h['end_time']} | "
        f"Horizon: {time_h['horizon_hours']} Hours | Timezone: {time_h['timezone']} | Forecast Source: {time_h['forecast_source']}"
    )

    # 3. Current Operating State (Hour 0)
    lines.append("\n=== 3. CURRENT OPERATING STATE (Hour 0 / Current Time) ===")
    lines.append(f"Current Time: {curr['time_label']}")
    lines.append(
        f"Demand: Total={curr['demand_kw']} kW (Critical={curr['critical_demand_kw']} kW)"
    )
    lines.append(
        f"Renewables: Solar Gen={curr['solar_used_kw']} kW (Avail={curr['solar_available_kw']} kW) | "
        f"Wind Gen={curr['wind_used_kw']} kW (Avail={curr['wind_available_kw']} kW)"
    )
    lines.append(
        f"Battery: SOC={curr['battery_soc_pct']}% | Status={curr['battery_status']} "
        f"(Charge={curr['battery_charge_kw']} kW, Discharge={curr['battery_discharge_kw']} kW)"
    )
    lines.append(
        f"Diesel Generator: Status={curr['diesel_status']} (Output={curr['diesel_kw']} kW)"
    )
    lines.append(
        f"Load Shedding: {curr['load_shed_kw']} kW | Decision Reasons: {', '.join(curr['reason_codes']) if curr['reason_codes'] else 'Normal Dispatch'}"
    )

    # 4. Overall KPIs & Savings
    lines.append("\n=== 4. OPTIMIZED PERFORMANCE & SAVINGS SUMMARY ===")
    lines.append(
        f"Optimized Plan: Total Cost=₹{kpi['total_cost_inr']} (Fuel Cost=₹{kpi['fuel_cost_inr']}) | "
        f"Diesel Used={kpi['diesel_liters']} L ({kpi['diesel_hours']} operating hours) | "
        f"CO2 Emissions={kpi['co2_kg']} kg | Renewable Share={kpi['renewable_share_pct']}% | "
        f"Clean Uptime={kpi['clean_uptime_pct']}% | Critical Power Secured={kpi['critical_uptime_pct']}% | "
        f"Curtailed Energy={kpi['curtailed_kwh']} kWh | Unmet Load={kpi['load_shed_kwh']} kWh"
    )
    lines.append(
        f"Savings vs Naive Dispatch: Cost Saved=₹{savings_n['cost_saved_inr']} ({savings_n['cost_saved_pct']}%) | "
        f"Diesel Hours Saved={savings_n['diesel_hours_saved']} hrs | "
        f"Fuel Avoided={savings_n['diesel_liters_saved']} L | CO2 Avoided={savings_n['co2_saved_kg']} kg"
    )

    # 5. Baseline Comparison
    naive = ctx["baseline_comparison"].get("naive_dispatch")
    cycle = ctx["baseline_comparison"].get("cycle_charging")
    lines.append("\n=== 5. BASELINE COMPARISON ===")
    if naive:
        lines.append(
            f"Naive Dispatch (Unoptimized baseline): Cost=₹{naive['total_cost_inr']} | "
            f"Diesel Hours={naive['diesel_hours']} hrs | Diesel Fuel={naive['diesel_liters']} L | CO2={naive['co2_kg']} kg"
        )
    if cycle:
        lines.append(
            f"Cycle Charging Dispatch: Cost=₹{cycle['total_cost_inr']} | "
            f"Diesel Hours={cycle['diesel_hours']} hrs | Diesel Fuel={cycle['diesel_liters']} L | CO2={cycle['co2_kg']} kg"
        )

    # 6. Key Milestones
    lines.append("\n=== 6. KEY DISPATCH MILESTONES ===")
    if milestones["diesel_on_hours"]:
        diesel_times = ", ".join(
            [f"Hour {d['hour_index']} ({d['time']}: {d['diesel_kw']} kW)" for d in milestones["diesel_on_hours"]]
        )
        lines.append(f"Diesel Running Hours: {diesel_times}")
    else:
        lines.append("Diesel Running Hours: None (Diesel stays OFF for the entire horizon!)")

    lines.append(
        f"Lowest Battery SOC: {milestones['lowest_soc']['soc_pct']}% at Hour {milestones['lowest_soc']['hour_index']} ({milestones['lowest_soc']['time']})"
    )
    lines.append(
        f"Peak Village Demand: {milestones['peak_demand']['demand_kw']} kW at Hour {milestones['peak_demand']['hour_index']} ({milestones['peak_demand']['time']})"
    )
    lines.append(
        f"Peak Solar Generation: {milestones['peak_solar']['solar_kw']} kW at Hour {milestones['peak_solar']['hour_index']} ({milestones['peak_solar']['time']})"
    )

    # 7. Reason Codes Definitions
    if reasons_def:
        lines.append("\n=== 7. DECISION REASON CODES IN THIS SCHEDULE ===")
        for code, desc in reasons_def.items():
            lines.append(f"- {code}: {desc}")

    # 8. Complete Hourly Dispatch Table
    lines.append("\n=== 8. COMPLETE HOURLY DISPATCH SCHEDULE ===")
    lines.append(
        "Hour | Time | Day | Demand(kW) | Solar(kW) | Batt Chg(kW) | Batt Dis(kW) | SOC(%) | Diesel(kW) | Reasons"
    )
    lines.append("-" * 110)
    for h in ctx["hourly_dispatch"]:
        d_state = f"{h['diesel_kw']:.1f} (ON)" if h["diesel_on"] else "0.0 (OFF)"
        reasons_str = ",".join(h["reason_codes"]) if h["reason_codes"] else "-"
        lines.append(
            f"H{h['hour_index']:02d} | {h['time_label']} | {h['day']} | "
            f"{h['demand_kw']:>5.1f} | {h['solar_available_kw']:>5.1f} | "
            f"{h['battery_charge_kw']:>6.1f} | {h['battery_discharge_kw']:>6.1f} | "
            f"{h['soc_pct']:>5.1f}% | {d_state:>10} | {reasons_str}"
        )

    return "\n".join(lines)
