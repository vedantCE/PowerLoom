"""Fetch forecast and build generation profile for all 3 village presets.

Run with:
    backend/.venv/bin/python backend/scripts/check_generation.py
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.presets.loader import load_all_presets  # noqa: E402
from app.services.pipeline import prepare_inputs  # noqa: E402

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def main() -> None:
    presets = load_all_presets()
    start_time = (datetime.now(KOLKATA_TZ) + timedelta(hours=1)).replace(
        minute=0, second=0, microsecond=0
    )

    print("=" * 80)
    print("Powerloom - Generation Model Verification (48-Hour Horizon)")
    print(f"Start time (IST): {start_time.isoformat()}")
    print("=" * 80)

    for config in presets:
        village_id = config.id
        inputs = prepare_inputs(
            session=None,
            village_id=village_id,
            horizon_hours=48,
            start_time=start_time,
        )

        solar_cap = config.solar.capacity_kw
        wind_cap = config.wind.capacity_kw
        total_solar_kwh = sum(inputs.solar_available_kw)
        total_wind_kwh = sum(inputs.wind_available_kw)
        solar_kwh_per_kwp_total = total_solar_kwh / solar_cap if solar_cap > 0 else 0.0

        # Separate day 1 (0..24) and day 2 (24..48)
        day1_solar = inputs.solar_available_kw[:24]
        day2_solar = inputs.solar_available_kw[24:48]
        day1_wind = inputs.wind_available_kw[:24]
        day2_wind = inputs.wind_available_kw[24:48]
        day1_timestamps = inputs.timestamps[:24]
        day2_timestamps = inputs.timestamps[24:48]

        day1_solar_kwh = sum(day1_solar)
        day2_solar_kwh = sum(day2_solar)
        day1_wind_kwh = sum(day1_wind)
        day2_wind_kwh = sum(day2_wind)

        day1_peak_solar = max(day1_solar, default=0.0)
        day1_peak_solar_hr = next(
            (ts.strftime("%H:%M") for ts, v in zip(day1_timestamps, day1_solar) if v == day1_peak_solar),
            "N/A",
        )
        day2_peak_solar = max(day2_solar, default=0.0)
        day2_peak_solar_hr = next(
            (ts.strftime("%H:%M") for ts, v in zip(day2_timestamps, day2_solar) if v == day2_peak_solar),
            "N/A",
        )

        overall_peak_solar = max(inputs.solar_available_kw, default=0.0)
        overall_peak_solar_hr = next(
            (
                ts.strftime("%m-%d %H:%M")
                for ts, v in zip(inputs.timestamps, inputs.solar_available_kw)
                if v == overall_peak_solar
            ),
            "N/A",
        )

        solar_cf_total = total_solar_kwh / (solar_cap * 48) if solar_cap > 0 else 0.0
        wind_cf_total = total_wind_kwh / (wind_cap * 48) if wind_cap > 0 else 0.0

        print(f"\nVillage: {config.location.name} ({village_id})")
        print(f"Location: {config.location.district}, {config.location.state} ({config.location.latitude:.2f}°N, {config.location.longitude:.2f}°E)")
        print(f"Installed Capacities: Solar = {solar_cap} kW, Wind = {wind_cap} kW")
        print(f"Forecast Source: {inputs.forecast_source.value}")
        print("-" * 80)
        print(f"{'Metric':<32} {'Day 1 (24h)':<18} {'Day 2 (24h)':<18} {'Total (48h)':<18}")
        print("-" * 80)
        print(f"{'Solar Generation (kWh)':<32} {day1_solar_kwh:<18.2f} {day2_solar_kwh:<18.2f} {total_solar_kwh:<18.2f}")
        print(f"{'Solar Yield (kWh/kWp)':<32} {(day1_solar_kwh / solar_cap if solar_cap > 0 else 0):<18.2f} {(day2_solar_kwh / solar_cap if solar_cap > 0 else 0):<18.2f} {solar_kwh_per_kwp_total:<18.2f}")
        print(f"{'Peak Solar (kW @ Hour)':<32} {f'{day1_peak_solar:.2f} kW @ {day1_peak_solar_hr}':<18} {f'{day2_peak_solar:.2f} kW @ {day2_peak_solar_hr}':<18} {f'{overall_peak_solar:.2f} kW @ {overall_peak_solar_hr}':<18}")
        print(f"{'Solar Capacity Factor':<32} {(day1_solar_kwh / (solar_cap * 24) if solar_cap > 0 else 0):<18.2%} {(day2_solar_kwh / (solar_cap * 24) if solar_cap > 0 else 0):<18.2%} {solar_cf_total:<18.2%}")
        print(f"{'Wind Generation (kWh)':<32} {day1_wind_kwh:<18.2f} {day2_wind_kwh:<18.2f} {total_wind_kwh:<18.2f}")
        print(f"{'Wind Capacity Factor':<32} {(day1_wind_kwh / (wind_cap * 24) if wind_cap > 0 else 0):<18.2%} {(day2_wind_kwh / (wind_cap * 24) if wind_cap > 0 else 0):<18.2%} {wind_cf_total:<18.2%}")
        print("-" * 80)


if __name__ == "__main__":
    main()
