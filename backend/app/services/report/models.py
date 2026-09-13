"""Internal data model for the 24-hour dispatch report.

Built by the route from live optimizer output; consumed by the PDF generator.
Not exposed on the API — the route returns a PDF blob, not JSON.
"""

from datetime import datetime
from typing import Any


class ReportData:
    """Plain Python class (not Pydantic) — only used internally."""

    def __init__(
        self,
        generated_at: datetime,
        forecast_date: datetime,
        location: dict[str, Any],
        summary: dict[str, float],
        hourly: list[dict[str, Any]],
        insights: list[str],
    ) -> None:
        self.generated_at = generated_at
        self.forecast_date = forecast_date
        self.location = location
        self.summary = summary
        self.hourly = hourly
        self.insights = insights
