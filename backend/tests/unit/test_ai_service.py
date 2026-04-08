"""Unit tests for app.services.ai_service — image compression, encoding, provider dispatch."""

from __future__ import annotations

import base64
import io
from unittest.mock import AsyncMock, patch

import pytest
from PIL import Image

from app.core.exceptions import AIFallbackExhausted, AIProviderError
from app.models.session import AIProvider
from app.schemas.ai import AIAnalyzeResponse, TokenUsage


# ---------------------------------------------------------------------------
# compress_image
# ---------------------------------------------------------------------------

class TestCompressImage:
    """Tests for the compress_image utility function."""

    def _create_large_image(self, width: int = 2000, height: int = 2000) -> bytes:
        """Create an in-memory RGB image of the given size, encoded as JPEG."""
        img = Image.new('RGB', (width, height), color='red')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=95)
        return buffer.getvalue()

    def test_resizes_large_images(self, sample_image_bytes: bytes) -> None:
        """Images larger than 1024px should be resized down."""
        from app.services.ai_service import compress_image

        large = self._create_large_image(2000, 2000)
        compressed = compress_image(large)

        # The compressed result should be a valid image
        result_img = Image.open(io.BytesIO(compressed))
        assert max(result_img.size) <= 1024

    def test_leaves_small_images_unchanged(self, sample_image_bytes: bytes) -> None:
        """Images already at or below 1024px should not be resized."""
        from app.services.ai_service import compress_image

        small = self._create_large_image(100, 100)
        compressed = compress_image(small)

        result_img = Image.open(io.BytesIO(compressed))
        # A 100x100 image should stay 100x100 (aspect ratio preserved)
        assert result_img.size == (100, 100)

    def test_output_is_jpeg(self) -> None:
        """Compressed output should be decodable as JPEG."""
        from app.services.ai_service import compress_image

        large = self._create_large_image(2000, 2000)
        compressed = compress_image(large)

        img = Image.open(io.BytesIO(compressed))
        assert img.format == 'JPEG'

    def test_rgba_to_rgb_conversion(self) -> None:
        """RGBA images should be converted to RGB."""
        from app.services.ai_service import compress_image

        img = Image.new('RGBA', (2000, 2000), color=(255, 0, 0, 128))
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        png_bytes = buffer.getvalue()

        compressed = compress_image(png_bytes)
        result_img = Image.open(io.BytesIO(compressed))
        assert result_img.mode == 'RGB'


# ---------------------------------------------------------------------------
# encode_image_base64
# ---------------------------------------------------------------------------

class TestEncodeImageBase64:
    """Tests for the encode_image_base64 utility function."""

    def test_produces_valid_base64(self) -> None:
        from app.services.ai_service import encode_image_base64

        data = b'\x89PNG\r\n\x1a\nfake-image-data'
        encoded = encode_image_base64(data)
        # Should roundtrip correctly
        decoded = base64.b64decode(encoded)
        assert decoded == data

    def test_returns_string(self, sample_image_bytes: bytes) -> None:
        from app.services.ai_service import encode_image_base64

        result = encode_image_base64(sample_image_bytes)
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# _build_provider_chain
# ---------------------------------------------------------------------------

class TestBuildProviderChain:
    """Tests for the provider chain builder."""

    @pytest.mark.parametrize(
        ('primary', 'expected_chain'),
        [
            (AIProvider.OPENAI, [AIProvider.OPENAI, AIProvider.ANTHROPIC, AIProvider.GOOGLE, AIProvider.MOCK]),
            (AIProvider.ANTHROPIC, [AIProvider.ANTHROPIC, AIProvider.OPENAI, AIProvider.GOOGLE, AIProvider.MOCK]),
            (AIProvider.GOOGLE, [AIProvider.GOOGLE, AIProvider.OPENAI, AIProvider.ANTHROPIC, AIProvider.MOCK]),
            (AIProvider.OLLAMA, [AIProvider.OLLAMA, AIProvider.MOCK]),
            (AIProvider.MOCK, [AIProvider.MOCK]),
        ],
    )
    def test_chain_starts_with_primary(self, primary: str, expected_chain: list[str]) -> None:
        from app.services.ai_service import _build_provider_chain

        chain = _build_provider_chain(primary)
        assert chain == expected_chain

    def test_unknown_provider_returns_mock_chain(self) -> None:
        from app.services.ai_service import _build_provider_chain

        chain = _build_provider_chain('nonexistent_provider')
        assert chain == [AIProvider.MOCK]

    def test_mock_is_always_last(self) -> None:
        """Every chain should end with 'mock' as the fallback."""
        from app.services.ai_service import _build_provider_chain

        for provider in [AIProvider.OPENAI, AIProvider.ANTHROPIC, AIProvider.GOOGLE, AIProvider.OLLAMA]:
            chain = _build_provider_chain(provider)
            assert chain[-1] == AIProvider.MOCK


# ---------------------------------------------------------------------------
# _analyze_mock
# ---------------------------------------------------------------------------

class TestAnalyzeMock:
    """Tests for the mock provider analyzer."""

    @pytest.mark.asyncio
    async def test_returns_deterministic_response(self) -> None:
        """Mock should always return the same reading for the same image."""
        from app.services.ai_service import _analyze_mock

        b64 = base64.b64encode(b'test-image').decode()
        response1 = await _analyze_mock(b64, 'You are a vibe reader.')
        response2 = await _analyze_mock(b64, 'You are a vibe reader.')

        assert response1.analysis_text == response2.analysis_text
        assert response1.provider == AIProvider.MOCK
        assert response1.model == 'mock-vibes-v1'

    @pytest.mark.asyncio
    async def test_different_images_produce_different_readings(self) -> None:
        """Different images should produce different readings."""
        from app.services.ai_service import _analyze_mock

        # Use inputs known to produce different MD5 mod 5 indices
        b64_a = base64.b64encode(b'the-quick-brown-fox').decode()
        b64_b = base64.b64encode(b'a-completely-different-input').decode()

        response_a = await _analyze_mock(b64_a, 'prompt')
        response_b = await _analyze_mock(b64_b, 'prompt')

        assert response_a.analysis_text != response_b.analysis_text

    @pytest.mark.asyncio
    async def test_returns_valid_ai_analyze_response(self) -> None:
        from app.services.ai_service import _analyze_mock

        b64 = base64.b64encode(b'any').decode()
        response = await _analyze_mock(b64, 'prompt')

        assert isinstance(response, AIAnalyzeResponse)
        assert isinstance(response.analysis_text, str)
        assert len(response.analysis_text) > 0
        assert response.provider == AIProvider.MOCK
        assert response.latency_ms == 0
        assert response.tokens_used is not None
        assert response.tokens_used.input == 0
        assert response.tokens_used.output == 0


# ---------------------------------------------------------------------------
# analyze_image with mock provider
# ---------------------------------------------------------------------------

class TestAnalyzeImageMock:
    """Tests for analyze_image using the mock provider."""

    @pytest.mark.asyncio
    async def test_mock_provider_returns_response(self, sample_image_bytes: bytes) -> None:
        """With mock provider, analyze_image should succeed without network."""
        from app.services.ai_service import analyze_image

        with patch('app.services.ai_service.settings') as mock_settings:
            mock_settings.ai_provider = AIProvider.MOCK
            mock_settings.ai_system_prompt = 'Test prompt.'

            response = await analyze_image(sample_image_bytes)

        assert isinstance(response, AIAnalyzeResponse)
        assert response.provider == AIProvider.MOCK
        assert response.latency_ms >= 0  # Set by the caller (may be 0 on fast systems)
        assert len(response.analysis_text) > 0

    @pytest.mark.asyncio
    async def test_fallback_to_mock_on_provider_failure(self, sample_image_bytes: bytes) -> None:
        """When the primary provider fails, the chain should fall back to mock."""
        from app.services.ai_service import analyze_image

        with patch('app.services.ai_service.settings') as mock_settings:
            mock_settings.ai_provider = AIProvider.OPENAI
            mock_settings.ai_system_prompt = 'Test prompt.'

            # Patch the openai dispatcher to raise an error
            with patch('app.services.ai_service._analyze_openai', new_callable=AsyncMock) as mock_openai, \
                 patch('app.services.ai_service._analyze_anthropic', new_callable=AsyncMock) as mock_anthropic, \
                 patch('app.services.ai_service._analyze_google', new_callable=AsyncMock) as mock_google:
                mock_openai.side_effect = AIProviderError('OpenAI down', AIProvider.OPENAI)
                mock_anthropic.side_effect = AIProviderError('Anthropic down', AIProvider.ANTHROPIC)
                mock_google.side_effect = AIProviderError('Google down', AIProvider.GOOGLE)

                response = await analyze_image(sample_image_bytes)

        # Should fall through to mock
        assert response.provider == AIProvider.MOCK

    @pytest.mark.asyncio
    async def test_all_providers_exhausted_raises(self, sample_image_bytes: bytes) -> None:
        """When even mock fails (unlikely but possible if patched), raise AIFallbackExhausted."""
        from app.services.ai_service import analyze_image

        with patch('app.services.ai_service.settings') as mock_settings:
            mock_settings.ai_provider = AIProvider.MOCK
            mock_settings.ai_system_prompt = 'Test prompt.'

            with patch('app.services.ai_service._analyze_mock', new_callable=AsyncMock) as mock_fn:
                mock_fn.side_effect = AIProviderError('Mock also failed', AIProvider.MOCK)

                with pytest.raises(AIFallbackExhausted):
                    await analyze_image(sample_image_bytes)


# ---------------------------------------------------------------------------
# _dispatch_to_provider with unknown provider
# ---------------------------------------------------------------------------

class TestDispatchToProvider:
    """Tests for the provider dispatch function."""

    @pytest.mark.asyncio
    async def test_unknown_provider_raises(self) -> None:
        from app.services.ai_service import _dispatch_to_provider

        with pytest.raises(AIProviderError) as exc_info:
            await _dispatch_to_provider(
                provider_name='unknown_provider',
                b64_image='fake',
                system_prompt='prompt',
            )
        assert 'Unknown provider' in str(exc_info.value)
