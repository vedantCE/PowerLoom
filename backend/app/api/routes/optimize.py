import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db.session import get_session
from app.models.scenario_run import ScenarioRun
from app.presets.loader import load_preset
from app.schemas.optimize import OptimizeRequest, OptimizeResponse

logger = logging.getLogger(__name__)
router = APIRouter()

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2] / "fixtures" / "sample_optimize_response.json"
)


def _load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest, session: Session = Depends(get_session)) -> OptimizeResponse:
    if load_preset(req.village_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown village_id '{req.village_id}'")

    fixture = _load_fixture()
    fixture["run_id"] = str(uuid4())
    fixture["village_id"] = req.village_id
    fixture["created_at"] = datetime.now(timezone.utc).isoformat()
    fixture["is_mock"] = True

    response = OptimizeResponse.model_validate(fixture)

    try:
        session.add(
            ScenarioRun(
                id=response.run_id,
                village_id=response.village_id,
                request_json=req.model_dump(mode="json"),
                response_json=response.model_dump(mode="json"),
                total_cost_inr=response.summary.total_cost_inr,
                cost_saved_inr=response.savings[0].cost_saved_inr if response.savings else None,
            )
        )
        session.commit()
    except Exception as exc:
        logger.warning("Could not persist scenario run: %s", exc)
        session.rollback()

    return response
