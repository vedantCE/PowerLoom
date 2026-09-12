"""Chat Service Coordinator.

Retrieves or computes the live Powerloom state, builds the context payload,
and invokes Gemini to produce grounded answers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, select

from app.models.scenario_run import ScenarioRun
from app.optimizer.baselines import cycle_charging_dispatch, naive_dispatch
from app.optimizer.metrics import compute_savings, compute_summary
from app.optimizer.milp import DEFAULT_GAP_REL, FAST_GAP_REL, format_solver_status, solve_dispatch
from app.optimizer.models import DispatchHour, DispatchResult
from app.optimizer.reasons import assign_reason_codes
from app.presets.loader import load_preset
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.optimize import (
    BaselineResult,
    HourlyDispatch,
    OptimizeResponse,
    SolverInfo,
    WhatIfOverrides,
)
from app.services.chat.context import build_powerloom_context, format_context_for_prompt
from app.services.chat.gemini import generate_chat_response
from app.services.pipeline import OptimizationInputs, prepare_inputs

logger = logging.getLogger(__name__)


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


class ChatService:
    @staticmethod
    def process_chat(req: ChatRequest, session: Session) -> ChatResponse:
        """Process a chat request by retrieving or computing Powerloom context and querying Gemini."""
        village_id = req.village_id or "dang_village"
        run_id = req.run_id

        response_dict: dict[str, Any] | None = None
        village_cfg_dict: dict[str, Any] | None = None

        # 1. If run_id is supplied, look up existing run
        if run_id:
            try:
                run: ScenarioRun | None = session.exec(
                    select(ScenarioRun).where(ScenarioRun.id == run_id)
                ).first()
            except Exception as exc:
                logger.warning("DB error querying run '%s': %s", run_id, exc)
                run = None

            if run is None:
                raise ValueError(f"Scenario run '{run_id}' not found.")

            response_dict = run.response_json
            village_id = run.village_id
            preset_config = load_preset(village_id)
            village_cfg_dict = preset_config.model_dump(mode="json") if preset_config else {}

        # 2. If no run_id or fresh request, run optimizer pipeline
        if response_dict is None:
            preset_config = load_preset(village_id)
            if preset_config is None:
                raise ValueError(f"Unknown village_id '{village_id}'")
            village_cfg_dict = preset_config.model_dump(mode="json")

            effective_overrides = req.overrides or WhatIfOverrides()
            inputs = prepare_inputs(
                session=session,
                village_id=village_id,
                horizon_hours=req.horizon_hours,
                overrides=effective_overrides,
            )

            fast = _has_overrides(effective_overrides)
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

            opt_response = OptimizeResponse(
                run_id="live_context",
                village_id=village_id,
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
            response_dict = opt_response.model_dump(mode="json")

        # 3. Build Powerloom structured context
        context_dict = build_powerloom_context(village_cfg_dict or {}, response_dict)
        context_text = format_context_for_prompt(context_dict)

        # 4. Generate answer using Gemini with GEMINI_API_KEY_1
        answer = generate_chat_response(
            message=req.message,
            context_text=context_text,
            history=req.history,
        )

        return ChatResponse(
            message=answer,
            village_id=village_id,
            run_id=run_id,
            sources_used=[
                "site_microgrid_config",
                "current_operating_state",
                "hourly_dispatch_schedule",
                "performance_kpis",
                "baseline_comparison",
                "decision_reason_codes",
            ],
        )
