"""Fetch a live 48h forecast for kutch_village and print it as a table.

Run with:
    backend/.venv/bin/python backend/scripts/check_forecast.py
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.presets.loader import load_preset  # noqa: E402
from app.services.forecast.service import get_forecast  # noqa: E402

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def main() -> None:
    config = load_preset("kutch_village")
    start_time = (datetime.now(KOLKATA_TZ) + timedelta(hours=1)).replace(
        minute=0, second=0, microsecond=0
    )

    forecast = get_forecast(
        None, config.location.latitude, config.location.longitude, start_time, 48
    )

    print(f"source: {forecast.source.value}")
    print(f"start_time: {forecast.start_time.isoformat()}  horizon_hours: {forecast.horizon_hours}")
    print()

    header = (
        f"{'time':16} {'GHI':>7} {'GTI':>7} {'CS_GHI':>7} {'cloud%':>7} "
        f"{'temp':>6} {'w10':>6} {'w80':>6}"
    )
    print(header)
    print("-" * len(header))
    for h in forecast.hours:
        gti_str = f"{h.gti_wm2:7.1f}" if h.gti_wm2 is not None else f"{'--':>7}"
        print(
            f"{h.timestamp.strftime('%m-%d %H:%M'):16} "
            f"{h.ghi_wm2:7.1f} {gti_str} {h.clearsky_ghi_wm2:7.1f} "
            f"{h.cloud_cover_pct:7.1f} {h.temp_c:6.1f} "
            f"{h.wind_speed_10m_ms:6.2f} {h.wind_speed_80m_ms:6.2f}"
        )


if __name__ == "__main__":
    main()
