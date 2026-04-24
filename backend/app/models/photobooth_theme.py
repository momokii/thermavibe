"""Photobooth theme ORM model.

Stores theme configurations for the photobooth strip generator.
Built-in themes are seeded on first startup; admins can create custom themes.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.types import TIMESTAMP

from app.core.database import Base


class PhotoboothTheme(Base):
    """Photobooth theme ORM model.

    Attributes:
        id: Serial integer primary key.
        name: Unique machine-readable name (e.g., 'classic_black').
        display_name: Human-readable name shown in admin UI.
        config: JSONB with theme styling (background, borders, decorations, font, watermark).
        preview_image_path: Optional path to a generated preview thumbnail.
        is_builtin: System themes cannot be deleted.
        is_enabled: Disabled themes are hidden from kiosk selection.
        is_default: Only one theme can be the default at a time.
        sort_order: Lower values appear first in selection UI.
        created_at: Timestamp when the theme was created.
        updated_at: Timestamp of the last update.
    """

    __tablename__ = 'photobooth_themes'

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )
    name: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    preview_image_path: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
    )
    is_builtin: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __mapper_args__ = {'eager_defaults': False}
