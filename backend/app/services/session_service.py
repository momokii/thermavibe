"""Kiosk session state machine — core orchestrator.

Manages the 6-state kiosk FSM:
    IDLE → PAYMENT → CAPTURE → PROCESSING → REVEAL → RESET

Valid transitions:
    IDLE       → PAYMENT (if payment_enabled)
    IDLE       → CAPTURE (if payment not enabled)
    PAYMENT    → CAPTURE (on payment confirmed)
    CAPTURE    → PROCESSING (on capture complete)
    PROCESSING → REVEAL (on AI response received)
    REVEAL     → RESET (on finish/timeout)
    RESET      → IDLE (auto, or new session)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import SessionNotFoundError, StateTransitionError
from app.models.analytics import EventType
from app.models.session import KioskSession, KioskState, PaymentStatus

logger = structlog.get_logger(__name__)

# Valid state transition map: current_state → set of allowed target states
VALID_TRANSITIONS: dict[str, set[str]] = {
    KioskState.IDLE: {KioskState.PAYMENT, KioskState.CAPTURE},
    KioskState.PAYMENT: {KioskState.CAPTURE, KioskState.RESET},
    KioskState.CAPTURE: {KioskState.PROCESSING, KioskState.RESET},
    KioskState.PROCESSING: {KioskState.REVEAL, KioskState.RESET},
    KioskState.REVEAL: {KioskState.RESET},
    KioskState.RESET: {KioskState.IDLE},
}


async def create_session(
    db: AsyncSession,
    payment_enabled: bool = False,
) -> KioskSession:
    """Create a new kiosk session in IDLE state.

    Args:
        db: Async database session.
        payment_enabled: Whether payment is required for this session.

    Returns:
        The newly created KioskSession.
    """
    session = KioskSession(
        state=KioskState.IDLE,
        payment_status=PaymentStatus.NONE if not payment_enabled else None,
    )
    db.add(session)

    # Record analytics event
    event = _make_event(
        session_id=session.id,
        event_type=EventType.SESSION_START,
        metadata={'payment_enabled': payment_enabled},
    )
    db.add(event)

    await db.commit()
    await db.refresh(session)

    logger.info(
        'session_created',
        session_id=str(session.id),
        payment_enabled=payment_enabled,
    )
    return session


async def get_session(db: AsyncSession, session_id: uuid.UUID) -> KioskSession:
    """Retrieve a session by ID.

    Args:
        db: Async database session.
        session_id: UUID of the session.

    Returns:
        The matching KioskSession.

    Raises:
        SessionNotFoundError: If the session does not exist.
    """
    stmt = select(KioskSession).where(KioskSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session is None:
        raise SessionNotFoundError(str(session_id))
    return session


async def transition_state(
    db: AsyncSession,
    session_id: uuid.UUID,
    target_state: str,
) -> KioskSession:
    """Transition a session to a new state.

    Validates the transition against the allowed transition map.
    If transitioning to RESET, clears session data for privacy.

    Args:
        db: Async database session.
        session_id: UUID of the session.
        target_state: Target state string.

    Returns:
        The updated KioskSession.

    Raises:
        SessionNotFoundError: If the session does not exist.
        StateTransitionError: If the transition is invalid.
    """
    session = await get_session(db, session_id)
    current = session.state

    # Allow self-transition (idempotent)
    if current == target_state:
        return session

    allowed = VALID_TRANSITIONS.get(current, set())
    if target_state not in allowed:
        raise StateTransitionError(current, target_state)

    previous_state = current
    session.state = target_state

    # Record the transition event
    event = _make_event(
        session_id=session.id,
        event_type=_state_to_event_type(target_state),
        metadata={
            'from_state': previous_state,
            'to_state': target_state,
        },
    )
    db.add(event)

    # Handle state-specific logic
    if target_state == KioskState.CAPTURE:
        pass  # Camera service will be called from the endpoint
    elif target_state == KioskState.PROCESSING:
        pass  # AI service will be called from the endpoint
    elif target_state == KioskState.REVEAL:
        session.completed_at = datetime.now(timezone.utc)
    elif target_state == KioskState.RESET:
        await _clear_session_data(db, session)

    await db.commit()
    await db.refresh(session)

    logger.info(
        'state_transition',
        session_id=str(session.id),
        from_state=previous_state,
        to_state=target_state,
    )
    return session


async def start_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    payment_enabled: bool = False,
) -> KioskSession:
    """Start a session by transitioning from IDLE to the next state.

    If payment is enabled, transitions to PAYMENT. Otherwise,
    transitions directly to CAPTURE.

    Args:
        db: Async database session.
        session_id: UUID of the session.
        payment_enabled: Whether payment is required.

    Returns:
        The updated KioskSession.
    """
    target = KioskState.PAYMENT if payment_enabled else KioskState.CAPTURE
    return await transition_state(db, session_id, target)


async def capture_photo(
    db: AsyncSession,
    session_id: uuid.UUID,
    photo_path: str | None = None,
) -> KioskSession:
    """Record a photo capture for the session.

    Transitions from CAPTURE to PROCESSING and stores the photo path.

    Args:
        db: Async database session.
        session_id: UUID of the session.
        photo_path: Filesystem path to the captured JPEG.

    Returns:
        The updated KioskSession.
    """
    session = await get_session(db, session_id)

    if session.state != KioskState.CAPTURE:
        raise StateTransitionError(session.state, KioskState.PROCESSING)

    session.photo_path = photo_path

    # Record capture event
    event = _make_event(
        session_id=session.id,
        event_type=EventType.CAPTURE_COMPLETE,
        metadata={'photo_path': photo_path},
    )
    db.add(event)

    # Transition to PROCESSING
    session.state = KioskState.PROCESSING
    processing_event = _make_event(
        session_id=session.id,
        event_type=EventType.AI_REQUEST_SENT,
        metadata={'from_state': KioskState.CAPTURE, 'to_state': KioskState.PROCESSING},
    )
    db.add(processing_event)

    await db.commit()
    await db.refresh(session)

    logger.info(
        'photo_captured',
        session_id=str(session.id),
        photo_path=photo_path,
    )
    return session


async def store_ai_response(
    db: AsyncSession,
    session_id: uuid.UUID,
    response_text: str,
    provider: str,
) -> KioskSession:
    """Store the AI analysis response and transition to REVEAL.

    Args:
        db: Async database session.
        session_id: UUID of the session.
        response_text: The AI-generated vibe reading.
        provider: Name of the AI provider used.

    Returns:
        The updated KioskSession.
    """
    session = await get_session(db, session_id)

    session.ai_response_text = response_text
    session.ai_provider_used = provider
    session.completed_at = datetime.now(timezone.utc)
    session.state = KioskState.REVEAL

    # Record AI response event
    event = _make_event(
        session_id=session.id,
        event_type=EventType.AI_RESPONSE_RECEIVED,
        metadata={'provider': provider, 'from_state': KioskState.PROCESSING, 'to_state': KioskState.REVEAL},
    )
    db.add(event)

    await db.commit()
    await db.refresh(session)

    logger.info(
        'ai_response_stored',
        session_id=str(session.id),
        provider=provider,
    )
    return session


async def record_payment(
    db: AsyncSession,
    session_id: uuid.UUID,
    provider: str,
    amount: int,
    reference: str,
    status: str = PaymentStatus.CONFIRMED,
) -> KioskSession:
    """Record payment details and transition to CAPTURE on confirmation.

    Args:
        db: Async database session.
        session_id: UUID of the session.
        provider: Payment provider name.
        amount: Payment amount in smallest currency unit.
        reference: External payment reference ID.
        status: Payment status.

    Returns:
        The updated KioskSession.
    """
    session = await get_session(db, session_id)

    session.payment_provider = provider
    session.payment_amount = amount
    session.payment_reference = reference
    session.payment_status = status

    event_type = (
        EventType.PAYMENT_CONFIRMED
        if status == PaymentStatus.CONFIRMED
        else EventType.PAYMENT_INITIATED
    )
    event = _make_event(
        session_id=session.id,
        event_type=event_type,
        metadata={
            'provider': provider,
            'amount': amount,
            'reference': reference,
            'status': status,
        },
    )
    db.add(event)

    # Auto-transition to CAPTURE on confirmed payment
    if status == PaymentStatus.CONFIRMED and session.state == KioskState.PAYMENT:
        session.state = KioskState.CAPTURE
        transition_event = _make_event(
            session_id=session.id,
            event_type=EventType.CAPTURE_COMPLETE,
            metadata={'from_state': KioskState.PAYMENT, 'to_state': KioskState.CAPTURE},
        )
        db.add(transition_event)

    await db.commit()
    await db.refresh(session)

    logger.info(
        'payment_recorded',
        session_id=str(session.id),
        provider=provider,
        amount=amount,
        status=status,
    )
    return session


async def finish_session(db: AsyncSession, session_id: uuid.UUID) -> dict:
    """End a session, clearing all data for privacy.

    Args:
        db: Async database session.
        session_id: UUID of the session.

    Returns:
        Dict with session_id, final state, message, and duration.
    """
    session = await get_session(db, session_id)
    created_at = session.created_at

    # Transition to RESET (which clears data)
    session = await transition_state(db, session_id, KioskState.RESET)

    now = datetime.now(timezone.utc)
    duration = (now - created_at).total_seconds() if created_at else 0.0

    logger.info(
        'session_finished',
        session_id=str(session_id),
        duration_seconds=duration,
    )

    return {
        'id': session_id,
        'state': KioskState.RESET,
        'message': 'Session completed. All data cleared for privacy.',
        'duration_seconds': duration,
    }


async def get_active_session(db: AsyncSession) -> KioskSession | None:
    """Find the most recent session that is not in RESET state.

    Args:
        db: Async database session.

    Returns:
        The active KioskSession, or None.
    """
    stmt = (
        select(KioskSession)
        .where(KioskSession.state != KioskState.RESET)
        .order_by(KioskSession.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _clear_session_data(db: AsyncSession, session: KioskSession) -> None:
    """Clear sensitive session data for privacy.

    Args:
        db: Async database session.
        session: The session to clear.
    """
    session.photo_path = None
    session.cleared_at = datetime.now(timezone.utc)


def _make_event(
    session_id: uuid.UUID,
    event_type: EventType,
    metadata: dict | None = None,
):
    """Create an AnalyticsEvent instance (not yet added to session).

    Import here to avoid circular imports at module level.
    """
    from app.models.analytics import AnalyticsEvent

    return AnalyticsEvent(
        session_id=session_id,
        event_type=event_type.value,
        metadata_=metadata or {},
    )


def _state_to_event_type(state: str) -> EventType:
    """Map a target state to the corresponding analytics event type."""
    mapping = {
        KioskState.PAYMENT: EventType.PAYMENT_INITIATED,
        KioskState.CAPTURE: EventType.CAPTURE_COMPLETE,
        KioskState.PROCESSING: EventType.AI_REQUEST_SENT,
        KioskState.REVEAL: EventType.AI_RESPONSE_RECEIVED,
        KioskState.RESET: EventType.SESSION_TIMEOUT,
    }
    return mapping.get(state, EventType.SESSION_START)
