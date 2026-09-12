"""Run the MILP optimizer and both baselines for all 3 village presets at 48 h
and print a cost/quality comparison.

Run with:
    backend/.venv/bin/python backend/scripts/check_optimizer.py
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.optimizer.baselines import cycle_charging_dispatch, naive_dispatch  # noqa: E402
from app.optimizer.metrics import compute_savings, compute_summary  # noqa: E402
from app.optimizer.milp import solve_dispatch  # noqa: E402
from app.optimizer.reasons import assign_reason_codes  # noqa: E402
from app.optimizer.verify import verify_dispatch  # noqa: E402
from app.presets.loader import load_all_presets  # noqa: E402
from app.services.pipeline import prepare_inputs  # noqa: E402

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def _ascii_table(result) -> str:
    header = f"{'Hour':<6}{'Demand':>9}{'Solar':>9}{'Wind':>9}{'Batt':>9}{'Diesel':>9}{'SOC%':>8}"
    lines = [header, "-" * len(header)]
    for hour in result.hours[:24]:
        batt_net = hour.battery_discharge_kw - hour.battery_charge_kw
        lines.append(
            f"{hour.timestamp.strftime('%H:%M'):<6}"
            f"{hour.demand_kw:>9.2f}"
            f"{hour.solar_used_kw:>9.2f}"
            f"{hour.wind_used_kw:>9.2f}"
            f"{batt_net:>9.2f}"
            f"{hour.diesel_kw:>9.2f}"
            f"{hour.soc * 100:>7.1f}%"
        )
    return "\n".join(lines)


def _comparison_table(rows: list[tuple[str, object]]) -> str:
    header = (
        f"{'Strategy':<16}{'Total Cost':>13}{'Diesel Hrs':>12}{'Diesel L':>11}"
        f"{'CO2 kg':>10}{'Renew %':>10}{'Uptime %':>10}"
    )
    lines = [header, "-" * len(header)]
    for name, summary in rows:
        lines.append(
            f"{name:<16}"
            f"{summary.total_cost_inr:>13.2f}"
            f"{summary.diesel_hours:>12.0f}"
            f"{summary.diesel_liters:>11.2f}"
            f"{summary.co2_kg:>10.2f}"
            f"{summary.renewable_share_pct:>10.1f}"
            f"{summary.uptime_pct:>10.1f}"
        )
    return "\n".join(lines)


def _interesting_hours(result, limit: int = 6):
    def score(hour) -> tuple:
        return (
            "PRECHARGE_FOR_FORECAST_DEFICIT" in hour.reason_codes,
            hour.load_shed_kw > 0,
            hour.diesel_on,
            hour.curtailed_kw > 0,
        )

    return sorted(result.hours, key=score, reverse=True)[:limit]


def main() -> None:
    presets = load_all_presets()
    start_time = (datetime.now(KOLKATA_TZ) + timedelta(hours=1)).replace(
        minute=0, second=0, microsecond=0
    )

    print("=" * 80)
    print("Powerloom - MILP Dispatch Optimizer Verification (48-Hour Horizon)")
    print(f"Start time (IST): {start_time.isoformat()}")
    print("=" * 80)

    for config in presets:
        inputs = prepare_inputs(
            session=None,
            village_id=config.id,
            horizon_hours=48,
            start_time=start_time,
        )
        result = solve_dispatch(inputs)
        result = assign_reason_codes(inputs, result)
        naive_result = naive_dispatch(inputs)
        cycle_result = cycle_charging_dispatch(inputs)

        violations = verify_dispatch(inputs, result)
        naive_violations = verify_dispatch(inputs, naive_result, skip_terminal_soc=True)
        cycle_violations = verify_dispatch(inputs, cycle_result, skip_terminal_soc=True)

        optimized_summary = compute_summary(inputs, result)
        naive_summary = compute_summary(inputs, naive_result)
        cycle_summary = compute_summary(inputs, cycle_result)

        savings_vs_naive = compute_savings(optimized_summary, naive_summary, "naive")
        savings_vs_cycle = compute_savings(optimized_summary, cycle_summary, "cycle_charging")

        min_soc = min(h.soc for h in result.hours)
        max_soc = max(h.soc for h in result.hours)

        print(f"\nVillage: {config.location.name} ({config.id})")
        print("-" * 80)
        print(f"Solver status:       {result.status}  (infeasible={result.infeasible}, relaxed_critical={result.relaxed_critical})")
        print(f"Solve time:          {result.solve_time_ms:.1f} ms")
        print(f"Objective value:     {result.objective_value:.2f} INR" if result.objective_value is not None else "Objective value:     N/A")
        print(f"SOC range:           {min_soc * 100:.1f}% - {max_soc * 100:.1f}%")
        print(f"Verification:        optimized={len(violations)}, naive={len(naive_violations)}, cycle_charging={len(cycle_violations)} violation(s)")
        for v in violations + naive_violations + cycle_violations:
            print(f"  ! {v}")

        print("\nStrategy comparison:")
        print(
            _comparison_table(
                [
                    ("optimized", optimized_summary),
                    ("naive", naive_summary),
                    ("cycle_charging", cycle_summary),
                ]
            )
        )
        print(
            f"\nSavings vs naive:          {savings_vs_naive.cost_saved_inr:>10.2f} INR "
            f"({savings_vs_naive.cost_saved_pct:.1f}%), "
            f"{savings_vs_naive.diesel_hours_saved:.0f} fewer diesel hours, "
            f"{savings_vs_naive.co2_saved_kg:.2f} kg CO2 saved"
        )
        print(
            f"Savings vs cycle_charging: {savings_vs_cycle.cost_saved_inr:>10.2f} INR "
            f"({savings_vs_cycle.cost_saved_pct:.1f}%), "
            f"{savings_vs_cycle.diesel_hours_saved:.0f} fewer diesel hours, "
            f"{savings_vs_cycle.co2_saved_kg:.2f} kg CO2 saved"
        )

        print("\nReason codes for the 6 most interesting hours:")
        for hour in _interesting_hours(result):
            print(
                f"  hour {hour.hour_index:>2} ({hour.timestamp.strftime('%m-%d %H:%M')}): "
                f"{', '.join(hour.reason_codes)}"
            )

        if config.id == "kutch_village":
            print("\n24h dispatch (day 1):")
            print(_ascii_table(result))

        print("-" * 80)


if __name__ == "__main__":
    main()
