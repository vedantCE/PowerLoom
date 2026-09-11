from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.db.session import get_session
from app.models.scenario_run import ScenarioRun

router = APIRouter()


@router.get("/runs")
def list_runs(
    village_id: str | None = None,
    limit: int = Query(default=10, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[dict]:
    statement = select(ScenarioRun).order_by(ScenarioRun.created_at.desc()).limit(limit)
    if village_id:
        statement = statement.where(ScenarioRun.village_id == village_id)

    rows = session.exec(statement).all()
    return [
        {
            "id": row.id,
            "village_id": row.village_id,
            "created_at": row.created_at,
            "total_cost_inr": row.total_cost_inr,
            "cost_saved_inr": row.cost_saved_inr,
        }
        for row in rows
    ]
