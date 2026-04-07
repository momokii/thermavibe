"""Analytics and print job ORM models.

Tracks analytics events and print jobs for the kiosk lifecycle.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import INTEGER, TIMESTAMP, Uuid

from app.core.database import Base


class EventType(str, enum.Enum):
    """Valid analytics event types."""

    SESSION_START = 'session_start'
    PAYMENT_INITIATED = 'payment_initiated'
    PAYMENT_CONFIRMED = 'payment_confirmed'
    CAPTURE_COMPLETE = 'capture_complete'
    AI_REQUEST_SENT = 'ai_request_sent'
    AI_RESPONSE_RECEIVED = 'ai_response_received'
    PRINT_STARTED = 'print_started'
    PRINT_COMPLETE = 'print_complete'
    PRINT_FAILED = 'print_failed'
    ERROR = 'error'
    SESSION_TIMEOUT = 'session_timeout'


class PrintJobStatus(str, enum.Enum):
    """Valid print job status values."""

    PENDING = 'pending'
    PRINTING = 'printing'
    COMPLETE = 'complete'
    FAILED = 'failed'


class AnalyticsEvent(Base):
    """Analytics event ORM model.

    Records discrete events in the kiosk lifecycle for audit,
    debugging, and analytics.

    Attributes:
        id: UUID primary key.
        session_id: Foreign key to KioskSession (nullable).
        event_type: Type of event that occurred.
        metadata: Additional event data as JSONB.
        timestamp: When the event occurred.
    """

    __tablename__ = 'analytics_events'

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
        server_default=text('gen_random_uuid()'),
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey('kiosk_sessions.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_: Mapped[dict | None] = mapped_column(
        'metadata',
        JSONB,
        nullable=True,
        default=dict,
    )
    timestamp: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    session: Mapped['KioskSession | None'] = relationship(
        'KioskSession',
        back_populates='analytics_events',
    )

    __table_args__ = (
        Index('idx_analytics_events_session_id', 'session_id'),
        Index('idx_analytics_events_type', 'event_type'),
        Index('idx_analytics_events_timestamp', 'timestamp'),
    )
    __mapper_args__ = {'eager_defaults': False}


class PrintJob(Base):
    """Print job ORM model.

    Tracks the thermal printer job lifecycle for a single print per session.

    Attributes:
        id: UUID primary key.
        session_id: Foreign key to KioskSession (unique, one per session).
        status: Current status of the print job.
        retry_count: Number of retry attempts.
        error_message: Error details if the job failed.
        created_at: When the job was created.
        completed_at: When the job finished.
    """

    __tablename__ = 'print_jobs'

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
        server_default=text('gen_random_uuid()'),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey('kiosk_sessions.id', ondelete='CASCADE'),
        nullable=False,
        unique=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=PrintJobStatus.PENDING,
        index=True,
    )
    retry_count: Mapped[int] = mapped_column(INTEGER, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    completed_at: Mapped[str | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    # Relationships
    session: Mapped['KioskSession'] = relationship(
        'KioskSession',
        back_populates='print_job',
    )

    __mapper_args__ = {'eager_defaults': False}
