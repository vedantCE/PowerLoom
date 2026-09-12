"""POST /api/chat — Powerloom Energy Optimization Assistant chatbot endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db.session import get_session
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat.gemini import ChatConfigurationError, ChatServiceError
from app.services.chat.service import ChatService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Powerloom Energy Optimization Assistant Chat",
    description="Context-grounded assistant for explaining Powerloom microgrid state, optimization decisions, KPIs, and domain concepts.",
)
def chat(
    req: ChatRequest,
    session: Session = Depends(get_session),
) -> ChatResponse:
    """Process a chat interaction with the Powerloom Energy Optimization Assistant."""
    try:
        return ChatService.process_chat(req=req, session=session)
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)
    except ChatConfigurationError as exc:
        logger.error("Chat configuration error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except ChatServiceError as exc:
        logger.error("Chat service error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The energy assistant is temporarily unavailable. Please try again.",
        )
    except Exception as exc:
        logger.exception("Unexpected error in chat endpoint: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while processing the chat request.",
        )
