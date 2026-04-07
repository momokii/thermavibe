"""AI analysis API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.schemas.ai import AIAnalyzeResponse
from app.services import ai_service, session_service

router = APIRouter()


@router.post('/analyze', response_model=AIAnalyzeResponse)
async def analyze_image(
    image: UploadFile = File(..., description='Image file to analyze'),
    session_id: UUID | None = None,
    prompt: str | None = None,
    db: AsyncSession = Depends(get_db_session),
) -> AIAnalyzeResponse:
    """Analyze an uploaded image using the configured AI provider.

    Accepts a multipart/form-data image upload and returns an AI-generated
    vibe reading. Falls back through the provider chain on failure.
    """
    image_bytes = await image.read()

    result = await ai_service.analyze_image(
        image_bytes=image_bytes,
        session_id=session_id,
        prompt=prompt,
    )

    # If a session_id was provided, store the AI response
    if session_id is not None:
        try:
            await session_service.store_ai_response(
                db=db,
                session_id=session_id,
                response_text=result.analysis_text,
                provider=result.provider,
            )
        except Exception:
            pass  # Don't fail the AI request if session storage fails

    return result
