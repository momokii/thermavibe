"""AI provider dispatch service — provider-agnostic image analysis.

Dispatches image analysis requests to the configured AI provider
with automatic fallback chain:
    OpenAI → Anthropic → Google → Ollama → Mock (template-based)

Each provider adapter follows the same interface for consistent behavior.
"""

from __future__ import annotations

import base64
import io
import time
import uuid

import httpx
import structlog
from PIL import Image

from app.core.config import settings
from app.core.exceptions import AIProviderError, AIFallbackExhausted
from app.models.session import AIProvider
from app.schemas.ai import AIAnalyzeResponse, TokenUsage

logger = structlog.get_logger(__name__)

# Maximum image dimension for API submission
_MAX_IMAGE_DIMENSION = 1024
_JPEG_QUALITY = 85

# Provider timeout in seconds
_PROVIDER_TIMEOUT = 45


def compress_image(image_bytes: bytes) -> bytes:
    """Compress and resize an image for optimal API bandwidth.

    Resizes to fit within MAX_IMAGE_DIMENSION while preserving aspect ratio,
    then re-encodes as JPEG.

    Args:
        image_bytes: Raw image bytes (any PIL-supported format).

    Returns:
        Compressed JPEG bytes.
    """
    img = Image.open(io.BytesIO(image_bytes))

    # Convert RGBA to RGB
    if img.mode == 'RGBA':
        background = Image.new('RGB', img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[3])
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Resize if needed
    if max(img.size) > _MAX_IMAGE_DIMENSION:
        img.thumbnail((_MAX_IMAGE_DIMENSION, _MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=_JPEG_QUALITY)
    return buffer.getvalue()


def encode_image_base64(image_bytes: bytes) -> str:
    """Encode image bytes to a base64 string for API submission."""
    return base64.b64encode(image_bytes).decode('utf-8')


async def analyze_image(
    image_bytes: bytes,
    session_id: uuid.UUID | None = None,
    prompt: str | None = None,
    ai_config: dict[str, str] | None = None,
) -> AIAnalyzeResponse:
    """Analyze an image using the configured AI provider.

    Falls back through the provider chain on failure.

    Args:
        image_bytes: Raw image bytes.
        session_id: Optional session ID for logging.
        prompt: Override system prompt (defaults to settings).
        ai_config: Runtime config from database. Falls back to env vars if None.

    Returns:
        AIAnalyzeResponse with analysis text and metadata.

    Raises:
        AIFallbackExhausted: If all providers fail.
    """
    cfg = ai_config or {}
    system_prompt = prompt or cfg.get('system_prompt', settings.ai_system_prompt)
    compressed = compress_image(image_bytes)
    b64_image = encode_image_base64(compressed)

    provider = cfg.get('provider', settings.ai_provider)
    provider_chain = _build_provider_chain(provider)

    last_error: Exception | None = None

    for provider_name in provider_chain:
        try:
            start = time.monotonic()
            result = await _dispatch_to_provider(
                provider_name=provider_name,
                b64_image=b64_image,
                system_prompt=system_prompt,
                session_id=session_id,
                cfg=cfg,
            )
            latency = int((time.monotonic() - start) * 1000)
            result.latency_ms = latency
            return result
        except AIProviderError as exc:
            last_error = exc
            logger.warning(
                'ai_provider_failed',
                provider=provider_name,
                error=str(exc),
                session_id=str(session_id) if session_id else None,
            )
            continue

    # All providers exhausted
    primary = provider_chain[0] if provider_chain else 'unknown'
    fallback = provider_chain[-1] if len(provider_chain) > 1 else None
    raise AIFallbackExhausted(primary, fallback)


def _build_provider_chain(primary: str) -> list[str]:
    """Build a fallback chain starting with the primary provider.

    The chain always ends with 'mock' as the last resort.
    """
    chain_map: dict[str, list[str]] = {
        AIProvider.OPENAI: [AIProvider.OPENAI, AIProvider.ANTHROPIC, AIProvider.GOOGLE, AIProvider.MOCK],
        AIProvider.ANTHROPIC: [AIProvider.ANTHROPIC, AIProvider.OPENAI, AIProvider.GOOGLE, AIProvider.MOCK],
        AIProvider.GOOGLE: [AIProvider.GOOGLE, AIProvider.OPENAI, AIProvider.ANTHROPIC, AIProvider.MOCK],
        AIProvider.OLLAMA: [AIProvider.OLLAMA, AIProvider.MOCK],
        AIProvider.MOCK: [AIProvider.MOCK],
    }
    return chain_map.get(primary, [AIProvider.MOCK])


async def _dispatch_to_provider(
    provider_name: str,
    b64_image: str,
    system_prompt: str,
    session_id: uuid.UUID | None = None,
    cfg: dict[str, str] | None = None,
) -> AIAnalyzeResponse:
    """Dispatch analysis to a specific provider.

    Args:
        provider_name: Provider to use.
        b64_image: Base64-encoded image.
        system_prompt: System prompt for the AI.
        session_id: Session ID for logging.
        cfg: Runtime config dict from database.

    Returns:
        AIAnalyzeResponse.

    Raises:
        AIProviderError: If the provider fails.
    """
    dispatchers = {
        AIProvider.OPENAI: _analyze_openai,
        AIProvider.ANTHROPIC: _analyze_anthropic,
        AIProvider.GOOGLE: _analyze_google,
        AIProvider.OLLAMA: _analyze_ollama,
        AIProvider.MOCK: _analyze_mock,
    }

    dispatcher = dispatchers.get(provider_name)
    if dispatcher is None:
        raise AIProviderError(f'Unknown provider: {provider_name}', provider_name)

    return await dispatcher(b64_image, system_prompt, cfg=cfg)


async def _analyze_openai(b64_image: str, system_prompt: str, cfg: dict[str, str] | None = None) -> AIAnalyzeResponse:
    """Analyze image using OpenAI Vision API."""
    _cfg = cfg or {}
    api_key = _cfg.get('openai_api_key', settings.openai_api_key)
    model = _cfg.get('model', settings.ai_model)

    if not api_key:
        raise AIProviderError('OpenAI API key not configured', AIProvider.OPENAI)

    async with httpx.AsyncClient(timeout=_PROVIDER_TIMEOUT) as client:
        response = await client.post(
            'https://api.openai.com/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': model,
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {
                        'role': 'user',
                        'content': [
                            {'type': 'text', 'text': 'Analyze this photo and give me a vibe reading.'},
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f'data:image/jpeg;base64,{b64_image}',
                                    'detail': 'low',
                                },
                            },
                        ],
                    },
                ],
                'max_tokens': 1000,
            },
        )

    if response.status_code != 200:
        raise AIProviderError(f'OpenAI API error: {response.status_code} {response.text}', AIProvider.OPENAI)

    data = response.json()
    text = data['choices'][0]['message']['content']
    usage = data.get('usage', {})

    return AIAnalyzeResponse(
        analysis_text=text,
        provider=AIProvider.OPENAI,
        model=model,
        latency_ms=0,  # Set by caller
        tokens_used=TokenUsage(
            input=usage.get('prompt_tokens', 0),
            output=usage.get('completion_tokens', 0),
        ),
    )


async def _analyze_anthropic(b64_image: str, system_prompt: str, cfg: dict[str, str] | None = None) -> AIAnalyzeResponse:
    """Analyze image using Anthropic Claude Vision API."""
    _cfg = cfg or {}
    api_key = _cfg.get('anthropic_api_key', settings.anthropic_api_key)

    if not api_key:
        raise AIProviderError('Anthropic API key not configured', AIProvider.ANTHROPIC)

    model = 'claude-sonnet-4-20250514'

    async with httpx.AsyncClient(timeout=_PROVIDER_TIMEOUT) as client:
        response = await client.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            json={
                'model': model,
                'max_tokens': 1000,
                'system': system_prompt,
                'messages': [
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'image',
                                'source': {
                                    'type': 'base64',
                                    'media_type': 'image/jpeg',
                                    'data': b64_image,
                                },
                            },
                            {'type': 'text', 'text': 'Analyze this photo and give me a vibe reading.'},
                        ],
                    },
                ],
            },
        )

    if response.status_code != 200:
        raise AIProviderError(f'Anthropic API error: {response.status_code} {response.text}', AIProvider.ANTHROPIC)

    data = response.json()
    text = data['content'][0]['text']
    usage = data.get('usage', {})

    return AIAnalyzeResponse(
        analysis_text=text,
        provider=AIProvider.ANTHROPIC,
        model=model,
        latency_ms=0,
        tokens_used=TokenUsage(
            input=usage.get('input_tokens', 0),
            output=usage.get('output_tokens', 0),
        ),
    )


async def _analyze_google(b64_image: str, system_prompt: str, cfg: dict[str, str] | None = None) -> AIAnalyzeResponse:
    """Analyze image using Google Gemini Vision API."""
    _cfg = cfg or {}
    api_key = _cfg.get('google_api_key', settings.google_api_key)

    if not api_key:
        raise AIProviderError('Google API key not configured', AIProvider.GOOGLE)

    model = 'gemini-1.5-flash'

    async with httpx.AsyncClient(timeout=_PROVIDER_TIMEOUT) as client:
        response = await client.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}',
            json={
                'contents': [
                    {
                        'parts': [
                            {'text': system_prompt},
                            {
                                'inline_data': {
                                    'mime_type': 'image/jpeg',
                                    'data': b64_image,
                                },
                            },
                        ],
                    },
                ],
                'generationConfig': {'maxOutputTokens': 1000},
            },
        )

    if response.status_code != 200:
        raise AIProviderError(f'Google API error: {response.status_code} {response.text}', AIProvider.GOOGLE)

    data = response.json()
    text = data['candidates'][0]['content']['parts'][0]['text']

    return AIAnalyzeResponse(
        analysis_text=text,
        provider=AIProvider.GOOGLE,
        model=model,
        latency_ms=0,
        tokens_used=None,
    )


async def _analyze_ollama(b64_image: str, system_prompt: str, cfg: dict[str, str] | None = None) -> AIAnalyzeResponse:
    """Analyze image using local Ollama API."""
    _cfg = cfg or {}
    model = _cfg.get('model', settings.ai_model)
    if model == 'gpt-4o':
        model = 'llama3.2-vision'
    base_url = _cfg.get('ollama_base_url', settings.ollama_base_url)

    async with httpx.AsyncClient(timeout=_PROVIDER_TIMEOUT) as client:
        response = await client.post(
            f'{base_url}/api/generate',
            json={
                'model': model,
                'prompt': f'{system_prompt}\n\nAnalyze this photo and give me a vibe reading.',
                'images': [b64_image],
                'stream': False,
            },
        )

    if response.status_code != 200:
        raise AIProviderError(f'Ollama API error: {response.status_code} {response.text}', AIProvider.OLLAMA)

    data = response.json()
    text = data.get('response', '')

    return AIAnalyzeResponse(
        analysis_text=text,
        provider=AIProvider.OLLAMA,
        model=model,
        latency_ms=0,
        tokens_used=None,
    )


async def _analyze_mock(b64_image: str, system_prompt: str, cfg: dict[str, str] | None = None) -> AIAnalyzeResponse:
    """Return a mock vibe reading for development/testing.

    Always succeeds — used as the final fallback in the chain.
    """
    mock_readings = [
        (
            "Your aura is radiating cosmic turquoise energy today! "
            "The universe has aligned your chakras with the frequency of pure vibes. "
            "Your presence brings a warm, electric charge to every room you enter."
        ),
        (
            "The stars have detected an incredibly rare golden aura around you! "
            "Your energy is buzzing at peak creativity levels — this is your moment to shine. "
            "People around you can feel your magnetic pull."
        ),
        (
            "A mystical lavender haze surrounds your vibe today. "
            "Your inner compass is pointing straight toward adventure and good fortune. "
            "The cosmos says: trust your instincts, they're spot on."
        ),
        (
            "Your vibe check reveals an electric neon aura — you're practically glowing! "
            "The universe has granted you a rare triple-threat energy boost: charisma, luck, and style. "
            "Share this energy and watch it multiply."
        ),
        (
            "The cosmic scanner detects a powerful aurora borealis emanating from your soul! "
            "Your energy is rare and captivating — a true original. "
            "Today is the day to embrace your unique sparkle."
        ),
    ]

    import hashlib
    # Deterministic selection based on image content
    index = int(hashlib.md5(b64_image.encode() if isinstance(b64_image, str) else b64_image).hexdigest(), 16) % len(mock_readings)

    return AIAnalyzeResponse(
        analysis_text=mock_readings[index],
        provider=AIProvider.MOCK,
        model='mock-vibes-v1',
        latency_ms=0,
        tokens_used=TokenUsage(input=0, output=0),
    )
