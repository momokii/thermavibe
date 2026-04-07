"""Pydantic schemas for AI analysis API endpoints.

Covers analyze requests and responses for provider-agnostic AI integration.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TokenUsage(BaseModel):
    """Token usage breakdown from the AI provider."""

    input: int = Field(..., description='Input/prompt tokens')
    output: int = Field(..., description='Output/completion tokens')


class AIAnalyzeResponse(BaseModel):
    """Response for POST /api/v1/ai/analyze."""

    analysis_text: str = Field(..., description='AI-generated vibe reading text')
    provider: str = Field(..., description='AI provider that generated the response')
    model: str = Field(..., description='Model identifier used')
    latency_ms: int = Field(..., description='Round-trip latency in milliseconds')
    tokens_used: TokenUsage | None = Field(None, description='Token usage if available')
