from pydantic import BaseModel

from app.schemas.common import Language, ReasonCode


class ExplainRequest(BaseModel):
    run_id: str
    hour_index: int
    language: Language = Language.en


class ExplainResponse(BaseModel):
    run_id: str
    hour_index: int
    language: Language
    reason_codes: list[ReasonCode]
    explanation: str
