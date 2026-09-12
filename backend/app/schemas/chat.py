from typing import Literal
from pydantic import BaseModel, Field, field_validator

from app.schemas.optimize import WhatIfOverrides


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., max_length=5000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Message content cannot be empty or whitespace only")
        return stripped


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    village_id: str | None = None
    run_id: str | None = None
    horizon_hours: Literal[24, 48] = 48
    overrides: WhatIfOverrides | None = None
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Chat message cannot be empty or whitespace only")
        return stripped


class ChatResponse(BaseModel):
    message: str
    village_id: str
    run_id: str | None = None
    sources_used: list[str] = Field(default_factory=list)
