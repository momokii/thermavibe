"""Integration tests for AI analysis flow.

Tests exercise the /api/v1/ai/analyze endpoint via httpx AsyncClient with
ASGITransport. The ai_service and session_service are mocked at the endpoint
module level so no real AI provider is required.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.ai import AIAnalyzeResponse, TokenUsage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_analyze_response(
    analysis_text: str = 'Your aura is radiating cosmic turquoise energy today!',
    provider: str = 'mock',
    model: str = 'mock-vibes-v1',
    latency_ms: int = 150,
) -> AIAnalyzeResponse:
    """Create a mock AIAnalyzeResponse for testing."""
    return AIAnalyzeResponse(
        analysis_text=analysis_text,
        provider=provider,
        model=model,
        latency_ms=latency_ms,
        tokens_used=TokenUsage(input=42, output=88),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyze_image_returns_200(client: AsyncClient, sample_image_bytes: bytes):
    """POST /api/v1/ai/analyze with a valid image returns AIAnalyzeResponse."""
    mock_response = _make_mock_analyze_response()

    with patch('app.api.v1.endpoints.ai.ai_service') as ai_svc:
        ai_svc.analyze_image = AsyncMock(return_value=mock_response)

        resp = await client.post(
            '/api/v1/ai/analyze',
            files={'image': ('photo.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert 'analysis_text' in data
    assert data['provider'] == 'mock'
    assert data['model'] == 'mock-vibes-v1'
    assert data['latency_ms'] == 150
    assert data['tokens_used']['input'] == 42
    assert data['tokens_used']['output'] == 88
    ai_svc.analyze_image.assert_awaited_once()


@pytest.mark.asyncio
async def test_analyze_image_calls_service_with_bytes(client: AsyncClient, sample_image_bytes: bytes):
    """POST /api/v1/ai/analyze passes image bytes to the AI service."""
    mock_response = _make_mock_analyze_response()

    with patch('app.api.v1.endpoints.ai.ai_service') as ai_svc:
        ai_svc.analyze_image = AsyncMock(return_value=mock_response)

        await client.post(
            '/api/v1/ai/analyze',
            files={'image': ('photo.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')},
        )

    call_kwargs = ai_svc.analyze_image.call_args
    # The image_bytes passed should be the same bytes we uploaded
    actual_bytes = call_kwargs.kwargs.get('image_bytes') or call_kwargs[1].get('image_bytes')
    assert actual_bytes == sample_image_bytes


@pytest.mark.asyncio
async def test_analyze_image_with_session_id(client: AsyncClient, sample_image_bytes: bytes, sample_session_id: uuid.UUID):
    """POST /api/v1/ai/analyze with session_id stores AI response."""
    mock_response = _make_mock_analyze_response()

    with (
        patch('app.api.v1.endpoints.ai.ai_service') as ai_svc,
        patch('app.api.v1.endpoints.ai.session_service') as sess_svc,
    ):
        ai_svc.analyze_image = AsyncMock(return_value=mock_response)
        sess_svc.store_ai_response = AsyncMock()

        resp = await client.post(
            '/api/v1/ai/analyze',
            files={'image': ('photo.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')},
            params={'session_id': str(sample_session_id)},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['analysis_text'] == mock_response.analysis_text

    # session_service.store_ai_response should have been called
    sess_svc.store_ai_response.assert_awaited_once()
    call_kwargs = sess_svc.store_ai_response.call_args.kwargs
    assert str(call_kwargs.get('session_id')) == str(sample_session_id)
    assert call_kwargs.get('response_text') == mock_response.analysis_text
    assert call_kwargs.get('provider') == mock_response.provider


@pytest.mark.asyncio
async def test_analyze_image_with_prompt(client: AsyncClient, sample_image_bytes: bytes):
    """POST /api/v1/ai/analyze with custom prompt passes it to the service."""
    mock_response = _make_mock_analyze_response()

    with patch('app.api.v1.endpoints.ai.ai_service') as ai_svc:
        ai_svc.analyze_image = AsyncMock(return_value=mock_response)

        resp = await client.post(
            '/api/v1/ai/analyze',
            files={'image': ('photo.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')},
            params={'prompt': 'Give me a short, funny vibe reading.'},
        )

    assert resp.status_code == 200

    call_kwargs = ai_svc.analyze_image.call_args
    prompt_arg = call_kwargs.kwargs.get('prompt') or call_kwargs[1].get('prompt')
    assert prompt_arg == 'Give me a short, funny vibe reading.'


@pytest.mark.asyncio
async def test_analyze_image_session_store_failure_does_not_fail(client: AsyncClient, sample_image_bytes: bytes, sample_session_id: uuid.UUID):
    """POST /api/v1/ai/analyze still returns response even if session storage fails."""
    mock_response = _make_mock_analyze_response()

    with (
        patch('app.api.v1.endpoints.ai.ai_service') as ai_svc,
        patch('app.api.v1.endpoints.ai.session_service') as sess_svc,
    ):
        ai_svc.analyze_image = AsyncMock(return_value=mock_response)
        sess_svc.store_ai_response = AsyncMock(side_effect=Exception('DB error'))

        resp = await client.post(
            '/api/v1/ai/analyze',
            files={'image': ('photo.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')},
            params={'session_id': str(sample_session_id)},
        )

    # The endpoint catches session storage failures and still returns AI result
    assert resp.status_code == 200
    assert resp.json()['analysis_text'] == mock_response.analysis_text


@pytest.mark.asyncio
async def test_analyze_image_without_file_returns_422(client: AsyncClient):
    """POST /api/v1/ai/analyze without image file returns 422 validation error."""
    resp = await client.post('/api/v1/ai/analyze')

    assert resp.status_code == 422
    data = resp.json()
    assert 'detail' in data


@pytest.mark.asyncio
async def test_analyze_image_ai_service_failure(client: AsyncClient, sample_image_bytes: bytes):
    """POST /api/v1/ai/analyze propagates AI service errors."""
    from app.core.exceptions import AIFallbackExhausted

    with patch('app.api.v1.endpoints.ai.ai_service') as ai_svc:
        ai_svc.analyze_image = AsyncMock(
            side_effect=AIFallbackExhausted('mock', 'mock')
        )

        resp = await client.post(
            '/api/v1/ai/analyze',
            files={'image': ('photo.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')},
        )

    assert resp.status_code == 502
    data = resp.json()
    assert data['error']['code'] == 'AI_FALLBACK_EXHAUSTED'


@pytest.mark.asyncio
async def test_analyze_image_with_session_id_and_prompt(client: AsyncClient, sample_image_bytes: bytes, sample_session_id: uuid.UUID):
    """POST /api/v1/ai/analyze with both session_id and prompt works correctly."""
    mock_response = _make_mock_analyze_response(
        provider='openai',
        model='gpt-4o',
    )

    with (
        patch('app.api.v1.endpoints.ai.ai_service') as ai_svc,
        patch('app.api.v1.endpoints.ai.session_service') as sess_svc,
    ):
        ai_svc.analyze_image = AsyncMock(return_value=mock_response)
        sess_svc.store_ai_response = AsyncMock()

        resp = await client.post(
            '/api/v1/ai/analyze',
            files={'image': ('photo.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')},
            params={
                'session_id': str(sample_session_id),
                'prompt': 'Custom prompt for testing',
            },
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['provider'] == 'openai'
    assert data['model'] == 'gpt-4o'

    # Verify both services were called
    ai_svc.analyze_image.assert_awaited_once()
    sess_svc.store_ai_response.assert_awaited_once()
