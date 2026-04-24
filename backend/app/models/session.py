"""Kiosk session ORM model.

Tracks a single user interaction cycle from touch-to-start through payment, capture,
AI analysis, printing, and final cleanup.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import INTEGER, TIMESTAMP, Uuid

from app.core.database import Base


class KioskState(str, enum.Enum):
    """Valid states for the kiosk state machine.

    Shared states (both flows): IDLE, PAYMENT, CAPTURE, RESET
    Vibe Check states: REVIEW, PROCESSING, REVEAL
    Photobooth states: FRAME_SELECT, ARRANGE, COMPOSITING, PHOTOBOOTH_REVEAL
    """

    IDLE = 'idle'
    PAYMENT = 'payment'
    CAPTURE = 'capture'
    REVIEW = 'review'
    PROCESSING = 'processing'
    REVEAL = 'reveal'
    FRAME_SELECT = 'frame_select'
    ARRANGE = 'arrange'
    COMPOSITING = 'compositing'
    PHOTOBOOTH_REVEAL = 'photobooth_reveal'
    RESET = 'reset'


class SessionType(str, enum.Enum):
    """Session type discriminator."""

    VIBE_CHECK = 'vibe_check'
    PHOTOBOOTH = 'photobooth'


class PaymentStatus(str, enum.Enum):
    """Valid payment status values."""

    NONE = 'none'
    PENDING = 'pending'
    CONFIRMED = 'confirmed'
    EXPIRED = 'expired'
    DENIED = 'denied'
    REFUNDED = 'refunded'


class AIProvider(str, enum.Enum):
    """Valid AI provider identifiers."""

    OPENAI = 'openai'
    ANTHROPIC = 'anthropic'
    GOOGLE = 'google'
    OLLAMA = 'ollama'
    FALLBACK = 'fallback'
    MOCK = 'mock'


class KioskSession(Base):
    """Kiosk session ORM model.

    Represents a single user interaction cycle with the kiosk,
    from touch-to-start through payment, capture, AI analysis,
    printing, and final cleanup.

    Attributes:
        id: UUID primary key.
        state: Current state in the state machine.
        photo_path: Filesystem path to the captured JPEG photo.
        ai_response_text: The AI-generated vibe reading text.
        ai_provider_used: Identifier of the AI provider used.
        payment_status: Current payment status.
        payment_provider: Payment gateway used.
        payment_amount: Payment amount in smallest currency unit.
        payment_reference: External reference/transaction ID.
        created_at: Timestamp when the session was created.
        completed_at: Timestamp when the session reached REVEAL state.
        cleared_at: Timestamp when session data was cleared.
    """

    __tablename__ = 'kiosk_sessions'

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
        server_default=text('gen_random_uuid()'),
    )
    state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=KioskState.IDLE,
        index=True,
    )
    photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    photos: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    session_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=SessionType.VIBE_CHECK,
        index=True,
    )
    composite_image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    photobooth_layout: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_provider_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payment_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payment_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payment_amount: Mapped[int | None] = mapped_column(INTEGER, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    completed_at: Mapped[str | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    cleared_at: Mapped[str | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    # Relationships
    analytics_events: Mapped[list['AnalyticsEvent']] = relationship(
        'AnalyticsEvent',
        back_populates='session',
        cascade='all, delete-orphan',
    )
    print_job: Mapped['PrintJob | None'] = relationship(
        'PrintJob',
        back_populates='session',
        uselist=False,
        cascade='all, delete-orphan',
    )

    __table_args__ = (
        Index('idx_kiosk_sessions_state', 'state'),
        Index('idx_kiosk_sessions_created_at', created_at.desc()),
        Index('idx_kiosk_sessions_session_type', 'session_type'),
        Index(
            'idx_kiosk_sessions_not_cleared',
            'id',
            postgresql_where=cleared_at.is_(None),
        ),
        Index(
            'idx_kiosk_sessions_payment_status',
            'payment_status',
            postgresql_where=payment_status.isnot(None),
        ),
    )
    __mapper_args__ = {'eager_defaults': False}
