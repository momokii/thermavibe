"""Operator configuration ORM model.

Stores operator-configurable settings as key-value pairs
for the operator_configs table.
"""

from __future__ import annotations

import enum

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.types import INTEGER, TIMESTAMP

from app.core.database import Base


class ConfigCategory(str, enum.Enum):
    """Valid configuration categories."""

    HARDWARE = 'hardware'
    AI = 'ai'
    PAYMENT = 'payment'
    KIOSK = 'kiosk'
    GENERAL = 'general'
    PHOTOBOOTH = 'photobooth'


class OperatorConfig(Base):
    """Operator-configurable settings stored as key-value pairs.

    Attributes:
        id: Serial integer primary key.
        key: Unique configuration key name.
        value: Configuration value as text.
        category: Category for grouping (hardware, ai, payment, kiosk, general).
        description: Human-readable description of the config key.
        updated_at: Timestamp of the last update.
    """

    __tablename__ = 'operator_configs'

    id: Mapped[int] = mapped_column(
        INTEGER,
        primary_key=True,
        autoincrement=True,
    )
    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ConfigCategory.GENERAL,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __mapper_args__ = {'eager_defaults': False}
