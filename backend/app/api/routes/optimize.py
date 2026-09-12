import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db.session import get_session
from app.models.scenario_run import ScenarioRun
from app.optimizer.baselines import cycle_charging_dispatch, naive_dispatch
from app.optimizer.metrics import compute_savings, compute_summary
from app.optimizer.milp import DEFAULT_GAP_REL, FAST_GAP_REL, format_solver_status, solve_dispatch
from app.optimizer.models import DispatchHour, DispatchResult
from app.optimizer.reasons import assign_reason_codes
from app.schemas.optimize import (
    BaselineResult,
    HourlyDispatch,
    OptimizeRequest,
    OptimizeResponse,
    SolverInfo,
    WhatIfOverrides,
)
from app.services.pipeline import OptimizationInputs, prepare_inputs

logger = logging.getLogger(__name__)
router = APIRouter()


def _has_overrides(overrides: WhatIfOverrides) -> bool:
    return (
        overrides.cloud_cover_pct is not None
        or overrides.diesel_price_inr_per_l is not None
        or overrides.extra_solar_kw is not None
        or overrides.extra_battery_kwh is not None
        or overrides.initial_soc is not None
        or overrides.diesel_available is False
    )


def _to_hourly_dispatch(hour: DispatchHour) -> HourlyDispatch:
    return HourlyDispatch(
        hour_index=hour.hour_index,
        timestamp=hour.timestamp,
        demand_kw=hour.demand_kw,
        critical_demand_kw=hour.critical_kw,
        solar_available_kw=hour.solar_available_kw,
        wind_available_kw=hour.wind_available_kw,
        solar_used_kw=hour.solar_used_kw,
        wind_used_kw=hour.wind_used_kw,
        curtailed_kw=hour.curtailed_kw,
        battery_charge_kw=hour.battery_charge_kw,
        battery_discharge_kw=hour.battery_discharge_kw,
        soc=hour.soc,
        diesel_kw=hour.diesel_kw,
        diesel_on=hour.diesel_on,
        load_shed_kw=hour.load_shed_kw,
        reason_codes=hour.reason_codes,
    )


def _to_baseline_result(inputs: OptimizationInputs, result: DispatchResult) -> BaselineResult:
    return BaselineResult(
        strategy=result.strategy,
        summary=compute_summary(inputs, result),
        hourly=[_to_hourly_dispatch(hour) for hour in result.hours],
    )


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest, session: Session = Depends(get_session)) -> OptimizeResponse:
    try:
        inputs = prepare_inputs(
            session=session,
            village_id=req.village_id,
            horizon_hours=req.horizon_hours,
            start_time=req.start_time,
            overrides=req.overrides,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Slider-driven what-if runs (any override present) favor an instant
    # response over the last fraction of a percent of solve quality; the
    # default run can afford to spend more time getting closer to optimal.
    fast = _has_overrides(req.overrides)
    result = solve_dispatch(inputs, fast=fast)
    result = assign_reason_codes(inputs, result)

    naive_result = naive_dispatch(inputs)
    cycle_result = cycle_charging_dispatch(inputs)

    optimized_summary = compute_summary(inputs, result)
    naive_summary = compute_summary(inputs, naive_result)
    cycle_summary = compute_summary(inputs, cycle_result)

    savings = [
        compute_savings(optimized_summary, naive_summary, "naive"),
        compute_savings(optimized_summary, cycle_summary, "cycle_charging"),
    ]
    baselines = [
        _to_baseline_result(inputs, naive_result),
        _to_baseline_result(inputs, cycle_result),
    ]

    gap_rel = FAST_GAP_REL if fast else DEFAULT_GAP_REL
    solver_info = SolverInfo(
        status=format_solver_status(result.status, gap_rel),
        solve_time_ms=result.solve_time_ms,
        objective_value=result.objective_value,
    )

    response = OptimizeResponse(
        run_id=str(uuid4()),
        village_id=req.village_id,
        created_at=datetime.now(timezone.utc),
        horizon_hours=inputs.horizon_hours,
        forecast_source=inputs.forecast_source,
        hourly=[_to_hourly_dispatch(hour) for hour in result.hours],
        summary=optimized_summary,
        baselines=baselines,
        savings=savings,
        solver=solver_info,
        is_mock=False,
    )

    try:
        session.add(
            ScenarioRun(
                id=response.run_id,
                village_id=response.village_id,
                request_json=req.model_dump(mode="json"),
                response_json=response.model_dump(mode="json"),
                total_cost_inr=response.summary.total_cost_inr,
                cost_saved_inr=savings[0].cost_saved_inr if savings else None,
            )
        )
        session.commit()
    except Exception as exc:
        logger.warning("Could not persist scenario run: %s", exc)
        session.rollback()

    return response
