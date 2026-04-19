"""Configuration CRUD service.

Reads and updates operator configuration from the OperatorConfig table.
Configs are grouped by category (hardware, ai, payment, kiosk, general).
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.configuration import ConfigCategory, OperatorConfig

logger = structlog.get_logger(__name__)

# Default configuration seed values, organized by category.
# These are inserted on first application start if not present.
DEFAULT_CONFIGS: dict[str, dict[str, dict[str, str]]] = {
    ConfigCategory.HARDWARE: {
        'printer_vendor_id': {'value': settings.printer_vendor_id, 'description': 'USB vendor ID for thermal printer'},
        'printer_product_id': {'value': settings.printer_product_id, 'description': 'USB product ID for thermal printer'},
        'printer_paper_width': {'value': str(settings.printer_paper_width), 'description': 'Paper width in dots'},
        'camera_device_index': {'value': str(settings.camera_device_index), 'description': 'Active camera device index'},
        'camera_resolution_width': {'value': str(settings.camera_resolution_width), 'description': 'Camera capture width'},
        'camera_resolution_height': {'value': str(settings.camera_resolution_height), 'description': 'Camera capture height'},
    },
    ConfigCategory.AI: {
        'provider': {'value': settings.ai_provider, 'description': 'Active AI provider (openai, anthropic, google, ollama, mock)'},
        'openai_api_key': {'value': settings.openai_api_key, 'description': 'OpenAI API key'},
        'anthropic_api_key': {'value': settings.anthropic_api_key, 'description': 'Anthropic API key'},
        'google_api_key': {'value': settings.google_api_key, 'description': 'Google Gemini API key'},
        'ollama_base_url': {'value': settings.ollama_base_url, 'description': 'Ollama base URL for local inference'},
        'model': {'value': settings.ai_model, 'description': 'Model identifier for the AI provider'},
        'system_prompt': {'value': settings.ai_system_prompt, 'description': 'System prompt for AI analysis'},
    },
    ConfigCategory.PAYMENT: {
        'payment_enabled': {'value': str(settings.payment_enabled).lower(), 'description': 'Enable payment step'},
        'payment_provider': {'value': settings.payment_provider, 'description': 'Payment provider (midtrans, xendit, mock)'},
        'payment_amount': {'value': str(settings.payment_amount), 'description': 'Payment amount in IDR'},
        'payment_currency': {'value': settings.payment_currency, 'description': 'Currency code'},
        'payment_timeout_seconds': {'value': str(settings.payment_timeout_seconds), 'description': 'Payment timeout in seconds'},
    },
    ConfigCategory.KIOSK: {
        'kiosk_idle_timeout_seconds': {'value': str(settings.kiosk_idle_timeout_seconds), 'description': 'Idle screen timeout'},
        'kiosk_capture_countdown_seconds': {'value': str(settings.kiosk_capture_countdown_seconds), 'description': 'Countdown before capture'},
        'kiosk_processing_timeout_seconds': {'value': str(settings.kiosk_processing_timeout_seconds), 'description': 'AI processing timeout'},
        'kiosk_reveal_display_seconds': {'value': str(settings.kiosk_reveal_display_seconds), 'description': 'Reveal screen display duration'},
    },
    ConfigCategory.GENERAL: {
        'app_env': {'value': settings.app_env, 'description': 'Application environment'},
        'admin_pin': {'value': settings.admin_pin, 'description': 'Admin PIN for dashboard access'},
    },
}


async def get_all_configs(db: AsyncSession) -> dict[str, dict[str, str]]:
    """Get all configuration values grouped by category.

    Args:
        db: Async database session.

    Returns:
        Dict mapping category names to dicts of key→value pairs.
    """
    stmt = select(OperatorConfig).order_by(OperatorConfig.category, OperatorConfig.key)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    categories: dict[str, dict[str, str]] = {}
    for row in rows:
        if row.category not in categories:
            categories[row.category] = {}
        categories[row.category][row.key] = row.value

    return categories


async def get_configs_by_category(
    db: AsyncSession,
    category: str,
) -> dict[str, str]:
    """Get configuration values for a specific category.

    Args:
        db: Async database session.
        category: Category name to filter by.

    Returns:
        Dict of key→value pairs for the category.
    """
    stmt = (
        select(OperatorConfig)
        .where(OperatorConfig.category == category)
        .order_by(OperatorConfig.key)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return {row.key: row.value for row in rows}


async def update_config(
    db: AsyncSession,
    category: str,
    values: dict[str, str],
) -> dict[str, str]:
    """Update configuration values for a category.

    Only updates keys that already exist in the database. New keys are ignored
    unless they are in the default seed set.

    Args:
        db: Async database session.
        category: Category to update.
        values: Dict of key→value pairs to update.

    Returns:
        Dict of all key→value pairs for the category after update.
    """
    for key, value in values.items():
        stmt = select(OperatorConfig).where(
            OperatorConfig.category == category,
            OperatorConfig.key == key,
        )
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if config is not None:
            config.value = str(value)
        else:
            # Create a new config entry
            new_config = OperatorConfig(
                key=key,
                value=str(value),
                category=category,
                description='',
            )
            db.add(new_config)

    await db.commit()

    logger.info('config_updated', category=category, updated_keys=list(values.keys()))

    return await get_configs_by_category(db, category)


async def seed_default_configs(db: AsyncSession) -> int:
    """Seed default configuration values if not already present.

    Called during application startup to ensure all expected config
    keys exist in the database.

    Args:
        db: Async database session.

    Returns:
        Number of new config entries created.
    """
    created = 0

    for category, keys in DEFAULT_CONFIGS.items():
        for key, config in keys.items():
            stmt = select(OperatorConfig).where(
                OperatorConfig.category == category,
                OperatorConfig.key == key,
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing is None:
                new_config = OperatorConfig(
                    key=key,
                    value=config['value'],
                    category=category,
                    description=config['description'],
                )
                db.add(new_config)
                created += 1

    if created > 0:
        await db.commit()
        logger.info('config_seeded', new_entries=created)

    return created


async def get_ai_config(db: AsyncSession) -> dict[str, str]:
    """Get AI configuration from database, falling back to env-var defaults.

    Args:
        db: Async database session.

    Returns:
        Dict with keys: provider, openai_api_key, anthropic_api_key,
        google_api_key, ollama_base_url, model, system_prompt.
    """
    db_values = await get_configs_by_category(db, ConfigCategory.AI)

    return {
        'provider': db_values.get('provider', settings.ai_provider),
        'openai_api_key': db_values.get('openai_api_key', settings.openai_api_key),
        'anthropic_api_key': db_values.get('anthropic_api_key', settings.anthropic_api_key),
        'google_api_key': db_values.get('google_api_key', settings.google_api_key),
        'ollama_base_url': db_values.get('ollama_base_url', settings.ollama_base_url),
        'model': db_values.get('model', settings.ai_model),
        'system_prompt': db_values.get('system_prompt', settings.ai_system_prompt),
    }
