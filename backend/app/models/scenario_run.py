from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

JSON_VARIANT = JSON().with_variant(JSONB, "postgresql")


class ScenarioRun(SQLModel, table=True):
    __tablename__ = "scenario_runs"

    id: str = Field(primary_key=True)
    village_id: str = Field(index=True)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=lambda: datetime.now(timezone.utc),
    )
    request_json: dict[str, Any] = Field(sa_column=Column(JSON_VARIANT, nullable=False))
    response_json: dict[str, Any] = Field(sa_column=Column(JSON_VARIANT, nullable=False))
    total_cost_inr: float
    cost_saved_inr: float | None = None
