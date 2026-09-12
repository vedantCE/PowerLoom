"""24-hour energy dispatch report endpoint.

GET /api/reports/24-hour?village_id=<id>

Runs the full pipeline (weather → generation → demand → MILP optimizer →
baselines → metrics) and returns a dynamically generated PDF.

The MILP optimizer is the sole source of truth for energy decisions.
"""

import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlmodel import Session

from app.db.session import get_session
from app.optimizer.baselines import naive_dispatch
from app.optimizer.metrics import compute_savings, compute_summary
from app.optimizer.milp import solve_dispatch
from app.optimizer.reasons import assign_reason_codes
from app.schemas.common import ReasonCode
from app.services.pipeline import prepare_inputs
from app.services.report.models import ReportData
from app.services.report.pdf import generate_pdf

logger = logging.getLogger(__name__)
router = APIRouter()

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

# Reason-code → human-readable recommendation (deterministic, no LLM)
_REASON_MESSAGES: dict[str, str] = {
    ReasonCode.RENEWABLES_COVER_DEMAND: "Use solar + wind; no diesel required.",
    ReasonCode.SOLAR_SURPLUS_CHARGING: "Charge battery using excess solar generation.",
    ReasonCode.PRECHARGE_FOR_FORECAST_DEFICIT: "Pre-charge battery via diesel; low renewable generation expected ahead.",
    ReasonCode.EVENING_PEAK_DISCHARGE: "Discharge battery to meet evening peak demand.",
    ReasonCode.SOC_AT_MINIMUM: "Battery at minimum SOC; prioritise charging before next demand peak.",
    ReasonCode.DIESEL_EFFICIENT_LOADING: "Run diesel at efficient load; renewable + battery insufficient.",
    ReasonCode.DIESEL_CHARGING_BATTERY: "Diesel running; excess output charges battery.",
    ReasonCode.CURTAILMENT_BATTERY_FULL: "Battery full; curtailing excess renewable generation.",
    ReasonCode.NONCRITICAL_LOAD_SHED: "Non-critical load shed; insufficient supply for full demand.",
}


def _recommendation(reason_codes: list[str]) -> str:
    for code in reason_codes:
        msg = _REASON_MESSAGES.get(code)
        if msg:
            return msg
    return "Dispatch based on available renewable and storage resources."


def _build_insights(hourly: list[dict], summary: dict) -> list[str]:
    """Generate 3–5 plain-language insights from actual optimizer output."""
    insights = []

    # 1. Solar peak window
    solar_hours = [h for h in hourly if h["solar_used_kw"] > 1.0]
    if solar_hours:
        peak_solar = max(solar_hours, key=lambda h: h["solar_used_kw"])
        ts = peak_solar["timestamp"]
        if isinstance(ts, str):
            from datetime import datetime as _dt
            ts = _dt.fromisoformat(ts)
        insights.append(
            f"Peak solar generation of {peak_solar['solar_used_kw']:.1f} kW occurred at "
            f"{ts.strftime('%H:%M')}, allowing the optimizer to reduce diesel usage during that period."
        )

    # 2. Battery pre-charge
    precharge_hours = [
        h for h in hourly if ReasonCode.PRECHARGE_FOR_FORECAST_DEFICIT in h.get("reason_codes", [])
    ]
    if precharge_hours:
        insights.append(
            f"The battery was pre-charged during {len(precharge_hours)} hour(s) in anticipation of "
            "low renewable generation ahead, reducing the need for diesel during demand peaks."
        )

    # 3. Evening discharge
    evening_discharge = [
        h for h in hourly if ReasonCode.EVENING_PEAK_DISCHARGE in h.get("reason_codes", [])
    ]
    if evening_discharge:
        insights.append(
            f"Battery discharge was used during {len(evening_discharge)} evening hour(s) "
            "to avoid or reduce diesel generation during the demand peak."
        )

    # 4. Diesel usage
    diesel_hours = [h for h in hourly if h["diesel_kw"] > 0.1]
    if diesel_hours:
        insights.append(
            f"Diesel generation was required in {len(diesel_hours)} hour(s) "
            f"(total: {summary['optimized_diesel']:.1f} L) when renewable and battery capacity "
            "could not satisfy demand."
        )
    else:
        insights.append(
            "The optimizer achieved zero diesel generation across the full 24-hour horizon "
            "using solar, wind, and battery storage alone."
        )

    # 5. Renewable utilization
    insights.append(
        f"Renewable energy covered {summary['renewable_utilization']:.1f}% of total served load, "
        f"compared to {summary['baseline_renewable']:.1f}% under the naive baseline strategy."
    )

    return insights[:5]


@router.get("/reports/24-hour")
def generate_24h_report(
    village_id: str = Query(..., description="Village preset ID"),
    session: Session = Depends(get_session),
) -> Response:
    """Generate a fresh 24-hour optimized dispatch PDF report."""

    # 1. Prepare inputs (weather + demand + generation)
    try:
        inputs = prepare_inputs(
            session=session,
            village_id=village_id,
            horizon_hours=24,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to prepare inputs for report: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch weather forecast. Please try again later.",
        )

    # 2. Run MILP optimizer
    try:
        result = solve_dispatch(inputs, fast=False)
        result = assign_reason_codes(inputs, result)
    except Exception as exc:
        logger.error("Optimizer failed during report generation: %s", exc)
        raise HTTPException(status_code=500, detail="Optimizer failed. Please try again.")

    if result.infeasible:
        raise HTTPException(
            status_code=422,
            detail="Optimizer could not find a feasible dispatch plan for the given system configuration.",
        )

    # 3. Run naive baseline (source of truth for savings comparison)
    baseline_result = naive_dispatch(inputs)

    # 4. Compute summaries and savings
    optimized_summary = compute_summary(inputs, result)
    baseline_summary = compute_summary(inputs, baseline_result)
    savings = compute_savings(optimized_summary, baseline_summary, "naive")

    # 5. Per-hour cost and CO2 (mirrors milp.py objective exactly)
    diesel = inputs.village.diesel
    battery = inputs.village.battery

    def _hour_liters(h) -> float:
        if not h.diesel_on:
            return 0.0
        return (
            diesel.fuel_intercept_l_per_h_per_kw * diesel.capacity_kw
            + diesel.fuel_slope_l_per_kwh * h.diesel_kw
        )

    def _hour_cost(h) -> float:
        liters = _hour_liters(h)
        fuel = liters * diesel.fuel_price_inr_per_l
        co2_penalty = liters * diesel.co2_kg_per_l * inputs.village.economics.co2_penalty_inr_per_kg
        wear = battery.wear_cost_inr_per_kwh * (h.battery_charge_kw + h.battery_discharge_kw) / 2
        return fuel + co2_penalty + wear

    # 6. Build hourly data list
    hourly_data = []
    for h in result.hours:
        weather = inputs.weather[h.hour_index]
        liters = _hour_liters(h)
        hourly_data.append(
            {
                "timestamp": h.timestamp,
                "cloud_cover": weather.cloud_cover_pct,
                "wind_speed": weather.wind_speed_10m_ms,
                "solar_available_kw": h.solar_available_kw,
                "wind_available_kw": h.wind_available_kw,
                "demand_kw": h.demand_kw,
                "solar_used_kw": h.solar_used_kw,
                "wind_used_kw": h.wind_used_kw,
                "battery_charge_kw": h.battery_charge_kw,
                "battery_discharge_kw": h.battery_discharge_kw,
                "diesel_kw": h.diesel_kw,
                "soc_pct": h.soc * 100,
                "hourly_cost": _hour_cost(h),
                "hourly_co2": liters * diesel.co2_kg_per_l,
                "recommendation": _recommendation(h.reason_codes),
                "reason_codes": h.reason_codes,
            }
        )

    # 7. Build summary dict
    summary = {
        "baseline_cost": baseline_summary.total_cost_inr,
        "optimized_cost": optimized_summary.total_cost_inr,
        "baseline_co2": baseline_summary.co2_kg,
        "optimized_co2": optimized_summary.co2_kg,
        "baseline_diesel": baseline_summary.diesel_liters,
        "optimized_diesel": optimized_summary.diesel_liters,
        "baseline_renewable": baseline_summary.renewable_share_pct,
        "renewable_utilization": optimized_summary.renewable_share_pct,
        "uptime": optimized_summary.uptime_pct,
        "start_soc_pct": inputs.village.battery.soc_initial * 100,
        "end_soc_pct": result.hours[-1].soc * 100 if result.hours else 0.0,
    }

    # 8. Build insights
    insights = _build_insights(hourly_data, summary)

    # 9. Assemble ReportData
    now_ist = datetime.now(KOLKATA_TZ)
    forecast_date = inputs.start_time.astimezone(KOLKATA_TZ)
    loc = inputs.village.location

    report_data = ReportData(
        generated_at=now_ist,
        forecast_date=forecast_date,
        location={
            "name": loc.name,
            "district": loc.district,
            "state": loc.state,
        },
        summary=summary,
        hourly=hourly_data,
        insights=insights,
    )

    # 10. Locate logo (frontend/public/logo_clean.png relative to project root)
    here = os.path.dirname(__file__)
    project_root = os.path.abspath(os.path.join(here, "..", "..", "..", "..", ".."))
    logo_path = os.path.join(project_root, "frontend", "public", "logo_clean.png")
    if not os.path.isfile(logo_path):
        logo_path = None

    # 11. Generate PDF
    try:
        pdf_bytes = generate_pdf(report_data, logo_path=logo_path)
    except Exception as exc:
        logger.error("PDF generation failed: %s", exc)
        raise HTTPException(status_code=500, detail="PDF generation failed. Please try again.")

    filename = f"Microgrid_24H_Energy_Dispatch_{now_ist.strftime('%Y-%m-%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
