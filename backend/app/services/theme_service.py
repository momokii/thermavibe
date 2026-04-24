"""Photobooth theme CRUD service.

Manages built-in and custom photobooth themes. Built-in themes are seeded
on first startup and cannot be deleted. Custom themes are created by admins
through the admin panel.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import VibePrintError
from app.models.photobooth_theme import PhotoboothTheme
from app.schemas.photobooth import ThemeConfig

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Built-in theme definitions
# ---------------------------------------------------------------------------

BUILTIN_THEMES: list[dict] = [
    {
        'name': 'classic_black',
        'display_name': 'Classic Black',
        'sort_order': 0,
        'config': {
            'background': {'type': 'solid', 'color': '#000000'},
            'photo_slot': {
                'border_width': 4,
                'border_color': '#ffffff',
                'border_radius': 0,
                'padding': 8,
                'shadow': True,
            },
            'decorations': {
                'top_banner': True,
                'banner_text': 'VibePrint',
                'divider_style': 'line',
                'divider_color': '#ffffff',
                'date_format': '%Y-%m-%d',
            },
            'font': {'family': 'default', 'color': '#ffffff', 'size': 24},
            'watermark': {'enabled': False, 'text': '', 'position': 'bottom-right', 'opacity': 0.3},
        },
    },
    {
        'name': 'polaroid_white',
        'display_name': 'Polaroid White',
        'sort_order': 1,
        'config': {
            'background': {'type': 'solid', 'color': '#f5f5f5'},
            'photo_slot': {
                'border_width': 0,
                'border_color': '#e0e0e0',
                'border_radius': 0,
                'padding': 16,
                'shadow': True,
            },
            'decorations': {
                'top_banner': True,
                'banner_text': 'VibePrint',
                'divider_style': 'none',
                'divider_color': '#cccccc',
                'date_format': '%Y-%m-%d',
            },
            'font': {'family': 'default', 'color': '#333333', 'size': 22},
            'watermark': {'enabled': False, 'text': '', 'position': 'bottom-right', 'opacity': 0.3},
        },
    },
    {
        'name': 'neon_glow',
        'display_name': 'Neon Glow',
        'sort_order': 2,
        'config': {
            'background': {'type': 'gradient', 'color': '#0a0a0a', 'gradient_start': '#0a0a23', 'gradient_end': '#1a0a2e'},
            'photo_slot': {
                'border_width': 3,
                'border_color': '#00ffff',
                'border_radius': 4,
                'padding': 6,
                'shadow': True,
            },
            'decorations': {
                'top_banner': True,
                'banner_text': 'VIBE',
                'divider_style': 'dotted',
                'divider_color': '#ff00ff',
                'date_format': '%Y-%m-%d',
            },
            'font': {'family': 'default', 'color': '#00ffff', 'size': 26},
            'watermark': {'enabled': False, 'text': '', 'position': 'bottom-right', 'opacity': 0.3},
        },
    },
    {
        'name': 'pastel_dream',
        'display_name': 'Pastel Dream',
        'sort_order': 3,
        'config': {
            'background': {'type': 'gradient', 'color': '#fce4ec', 'gradient_start': '#fce4ec', 'gradient_end': '#e1bee7'},
            'photo_slot': {
                'border_width': 2,
                'border_color': '#f8bbd0',
                'border_radius': 16,
                'padding': 10,
                'shadow': False,
            },
            'decorations': {
                'top_banner': True,
                'banner_text': 'Sweet Vibes',
                'divider_style': 'none',
                'divider_color': '#ce93d8',
                'date_format': '%Y-%m-%d',
            },
            'font': {'family': 'default', 'color': '#7b1fa2', 'size': 22},
            'watermark': {'enabled': False, 'text': '', 'position': 'bottom-center', 'opacity': 0.3},
        },
    },
]


# ---------------------------------------------------------------------------
# Theme CRUD operations
# ---------------------------------------------------------------------------


async def list_themes(
    db: AsyncSession,
    enabled_only: bool = True,
) -> list[PhotoboothTheme]:
    """List available photobooth themes.

    Args:
        db: Async database session.
        enabled_only: If True, only return enabled themes.

    Returns:
        List of PhotoboothTheme objects.
    """
    stmt = select(PhotoboothTheme).order_by(PhotoboothTheme.sort_order, PhotoboothTheme.id)
    if enabled_only:
        stmt = stmt.where(PhotoboothTheme.is_enabled == True)  # noqa: E712
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_theme(db: AsyncSession, theme_id: int) -> PhotoboothTheme:
    """Get a single theme by ID.

    Args:
        db: Async database session.
        theme_id: Theme ID.

    Returns:
        PhotoboothTheme object.

    Raises:
        VibePrintError: If theme not found.
    """
    stmt = select(PhotoboothTheme).where(PhotoboothTheme.id == theme_id)
    result = await db.execute(stmt)
    theme = result.scalar_one_or_none()

    if theme is None:
        raise VibePrintError(f'Theme {theme_id} not found', code='THEME_NOT_FOUND')

    return theme


async def get_default_theme(db: AsyncSession) -> PhotoboothTheme:
    """Get the default theme.

    Falls back to the first enabled theme if no default is set,
    or the first theme period if none are enabled.

    Args:
        db: Async database session.

    Returns:
        PhotoboothTheme object.
    """
    # Try default first
    stmt = select(PhotoboothTheme).where(
        PhotoboothTheme.is_default == True,  # noqa: E712
    )
    result = await db.execute(stmt)
    theme = result.scalar_one_or_none()
    if theme:
        return theme

    # Fall back to first enabled theme
    stmt = (
        select(PhotoboothTheme)
        .where(PhotoboothTheme.is_enabled == True)  # noqa: E712
        .order_by(PhotoboothTheme.sort_order, PhotoboothTheme.id)
        .limit(1)
    )
    result = await db.execute(stmt)
    theme = result.scalar_one_or_none()
    if theme:
        return theme

    # Last resort: first theme period
    stmt = select(PhotoboothTheme).order_by(PhotoboothTheme.sort_order, PhotoboothTheme.id).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one()


async def create_theme(
    db: AsyncSession,
    name: str,
    display_name: str,
    config: ThemeConfig | dict,
) -> PhotoboothTheme:
    """Create a new custom photobooth theme.

    Args:
        db: Async database session.
        name: Unique machine-readable name.
        display_name: Human-readable name.
        config: Theme configuration.

    Returns:
        Newly created PhotoboothTheme.
    """
    config_dict = config.model_dump() if isinstance(config, ThemeConfig) else config

    theme = PhotoboothTheme(
        name=name,
        display_name=display_name,
        config=config_dict,
        is_builtin=False,
        is_enabled=True,
        is_default=False,
    )
    db.add(theme)
    await db.commit()
    await db.refresh(theme)

    logger.info('theme_created', theme_id=theme.id, name=name)
    return theme


async def update_theme(
    db: AsyncSession,
    theme_id: int,
    **kwargs: object,
) -> PhotoboothTheme:
    """Update a theme's fields.

    Args:
        db: Async database session.
        theme_id: Theme ID to update.
        **kwargs: Fields to update (display_name, config, sort_order).

    Returns:
        Updated PhotoboothTheme.
    """
    theme = await get_theme(db, theme_id)

    for key, value in kwargs.items():
        if value is not None and hasattr(theme, key):
            setattr(theme, key, value)

    await db.commit()
    await db.refresh(theme)

    logger.info('theme_updated', theme_id=theme_id, updated_fields=list(kwargs.keys()))
    return theme


async def toggle_theme(
    db: AsyncSession,
    theme_id: int,
    enabled: bool,
) -> PhotoboothTheme:
    """Enable or disable a theme.

    Args:
        db: Async database session.
        theme_id: Theme ID.
        enabled: New enabled state.

    Returns:
        Updated PhotoboothTheme.
    """
    theme = await get_theme(db, theme_id)
    theme.is_enabled = enabled
    await db.commit()
    await db.refresh(theme)

    logger.info('theme_toggled', theme_id=theme_id, enabled=enabled)
    return theme


async def set_default_theme(
    db: AsyncSession,
    theme_id: int,
) -> PhotoboothTheme:
    """Set a theme as the default (unsets any previous default).

    Args:
        db: Async database session.
        theme_id: Theme ID to set as default.

    Returns:
        Updated PhotoboothTheme.
    """
    # Clear existing default
    await db.execute(
        update(PhotoboothTheme)
        .where(PhotoboothTheme.is_default == True)  # noqa: E712
        .values(is_default=False)
    )

    # Set new default
    theme = await get_theme(db, theme_id)
    theme.is_default = True
    await db.commit()
    await db.refresh(theme)

    logger.info('theme_set_default', theme_id=theme_id)
    return theme


async def delete_theme(db: AsyncSession, theme_id: int) -> None:
    """Delete a custom theme. Built-in themes cannot be deleted.

    Args:
        db: Async database session.
        theme_id: Theme ID to delete.

    Raises:
        VibePrintError: If the theme is built-in.
    """
    theme = await get_theme(db, theme_id)

    if theme.is_builtin:
        raise VibePrintError(
            'Cannot delete built-in themes',
            code='THEME_BUILTIN',
        )

    await db.delete(theme)
    await db.commit()

    logger.info('theme_deleted', theme_id=theme_id, name=theme.name)


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------


async def seed_builtin_themes(db: AsyncSession) -> int:
    """Seed built-in themes if not already present.

    Called during application startup alongside config seeding.

    Args:
        db: Async database session.

    Returns:
        Number of new themes created.
    """
    created = 0

    for theme_data in BUILTIN_THEMES:
        stmt = select(PhotoboothTheme).where(PhotoboothTheme.name == theme_data['name'])
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is None:
            theme = PhotoboothTheme(
                name=theme_data['name'],
                display_name=theme_data['display_name'],
                config=theme_data['config'],
                is_builtin=True,
                is_enabled=True,
                is_default=(theme_data['sort_order'] == 0),  # First theme is default
                sort_order=theme_data['sort_order'],
            )
            db.add(theme)
            created += 1

    if created > 0:
        await db.commit()
        logger.info('builtin_themes_seeded', new_themes=created)

    return created
