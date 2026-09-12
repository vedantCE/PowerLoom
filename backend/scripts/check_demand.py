"""Build demand profiles for all 3 village presets and print a summary.

Run with:
    backend/.venv/bin/python backend/scripts/check_demand.py
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.presets.loader import load_all_presets  # noqa: E402
from app.services.demand.checks import check_system_adequacy  # noqa: E402
from app.services.demand.model import build_demand_profile  # noqa: E402
from app.services.forecast.service import get_forecast  # noqa: E402

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
BAR_WIDTH = 40


def _ascii_bar_chart(hours) -> str:
    peak = max((h.total_kw for h in hours), default=0.0)
    lines = []
    for h in hours:
        bar_len = round((h.total_kw / peak) * BAR_WIDTH) if peak > 0 else 0
        bar = "#" * bar_len
        lines.append(f"  {h.timestamp.strftime('%H:%M')}  {h.total_kw:6.2f} kW  {bar}")
    return "\n".join(lines)


def main() -> None:
    presets = load_all_presets()
    start_time = (datetime.now(KOLKATA_TZ) + timedelta(hours=1)).replace(
        minute=0, second=0, microsecond=0
    )

    print("=" * 80)
    print("Powerloom - Demand Model Verification (48-Hour Horizon)")
    print(f"Start time (IST): {start_time.isoformat()}")
    print("=" * 80)

    for config in presets:
        forecast = get_forecast(
            session=None,
            latitude=config.location.latitude,
            longitude=config.location.longitude,
            start_time=start_time,
            horizon_hours=48,
        )
        profile = build_demand_profile(config, forecast)
        warnings = check_system_adequacy(config, profile)

        day1_hours = profile.hours[:24]
        day1_kwh = sum(h.total_kw for h in day1_hours)
        day1_critical_kwh = sum(h.critical_kw for h in day1_hours)

        morning_hour = next(
            (
                h.timestamp.strftime("%m-%d %H:%M")
                for h in profile.hours
                if h.total_kw == profile.morning_peak_kw
            ),
            "N/A",
        )
        evening_hour = next(
            (
                h.timestamp.strftime("%m-%d %H:%M")
                for h in profile.hours
                if h.total_kw == profile.evening_peak_kw
            ),
            "N/A",
        )

        print(f"\nVillage: {config.location.name} ({config.id})")
        print(f"Diesel capacity: {config.diesel.capacity_kw:.1f} kW | Battery max discharge: {config.battery.max_discharge_kw:.1f} kW")
        print("-" * 80)
        print(f"Total demand (day 1, 24h):     {day1_kwh:8.2f} kWh")
        print(f"Critical demand (day 1, 24h):  {day1_critical_kwh:8.2f} kWh")
        print(f"Morning peak:                  {profile.morning_peak_kw:8.2f} kW @ {morning_hour}")
        print(f"Evening peak:                  {profile.evening_peak_kw:8.2f} kW @ {evening_hour}")
        print(f"Load factor:                   {profile.load_factor:8.3f}")

        if warnings:
            print("Adequacy warnings:")
            for w in warnings:
                print(f"  ! {w}")
        else:
            print("Adequacy warnings: none")

        if config.id == "kutch_village":
            print("\n24h demand profile (day 1):")
            print(_ascii_bar_chart(day1_hours))

        print("-" * 80)


if __name__ == "__main__":
    main()
