from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

JSON_VARIANT = JSON().with_variant(JSONB, "postgresql")


class ForecastCache(SQLModel, table=True):
    __tablename__ = "forecast_cache"
    __table_args__ = (Index("ix_forecast_cache_lat_lon", "lat_key", "lon_key"),)

    id: int | None = Field(default=None, primary_key=True)
    lat_key: float
    lon_key: float
    fetched_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=lambda: datetime.now(timezone.utc),
    )
    horizon_hours: int
    payload_json: dict[str, Any] = Field(sa_column=Column(JSON_VARIANT, nullable=False))
