"""Access code ORM model.

Tracks one-time or multi-use access codes that grant kiosk feature access
as an alternative to payment.
"""

from __future__ import annotations

import enum

from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.types import INTEGER, TIMESTAMP

from app.core.database import Base


class AccessCodeStatus(str, enum.Enum):
    ACTIVE = 'active'
    USED = 'used'
    EXPIRED = 'expired'
    REVOKED = 'revoked'


class AccessCodeType(str, enum.Enum):
    VIBE_CHECK = 'vibe_check'
    PHOTOBOOTH = 'photobooth'
    UNIVERSAL = 'universal'


class AccessCode(Base):
    """Access code ORM model.

    Attributes:
        id: Serial integer primary key.
        code: Unique access code string (e.g. "VC-A3B7K9M2").
        code_type: Feature type this code unlocks (vibe_check, photobooth, universal).
        max_uses: Maximum number of times this code can be used.
        use_count: Number of times this code has been redeemed.
        status: Current status (active, used, expired, revoked).
        expires_at: Optional expiration timestamp (null = no expiry).
        notes: Optional admin notes.
        price: Optional price in smallest currency unit. Copied to session.payment_amount on redemption.
        created_at: Timestamp when the code was created.
        created_by: Identifier of the admin who created the code.
    """

    __tablename__ = 'access_codes'

    id: Mapped[int] = mapped_column(
        INTEGER,
        primary_key=True,
        autoincrement=True,
    )
    code: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
    )
    code_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=AccessCodeType.UNIVERSAL,
        index=True,
    )
    max_uses: Mapped[int] = mapped_column(
        INTEGER,
        nullable=False,
        default=1,
    )
    use_count: Mapped[int] = mapped_column(
        INTEGER,
        nullable=False,
        default=0,
    )
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=AccessCodeStatus.ACTIVE,
        index=True,
    )
    expires_at: Mapped[str | None] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int | None] = mapped_column(INTEGER, nullable=True)
    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    created_by: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default='admin',
    )

    __mapper_args__ = {'eager_defaults': False}
