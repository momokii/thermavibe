"""Access code service — generate, validate, redeem, CRUD.

Manages access codes that grant kiosk feature access as an
alternative to payment. Codes are typed (vibe_check, photobooth,
universal) and track usage counts and expiration.
"""

from __future__ import annotations

import random
import string
from datetime import datetime, timezone

import structlog
from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access_code import AccessCode, AccessCodeStatus, AccessCodeType

logger = structlog.get_logger(__name__)

# Prefix per code type for human-readable codes
_CODE_PREFIXES: dict[str, str] = {
    AccessCodeType.VIBE_CHECK: 'VC',
    AccessCodeType.PHOTOBOOTH: 'PB',
    AccessCodeType.UNIVERSAL: 'UN',
}

# Which code types unlock which session types
_COMPATIBLE_TYPES: dict[str, set[str]] = {
    'vibe_check': {AccessCodeType.VIBE_CHECK, AccessCodeType.UNIVERSAL},
    'photobooth': {AccessCodeType.PHOTOBOOTH, AccessCodeType.UNIVERSAL},
}


def _generate_code_string(code_type: str) -> str:
    """Generate a random 8-char alphanumeric code with type prefix."""
    prefix = _CODE_PREFIXES.get(code_type, 'UN')
    chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return f'{prefix}-{chars}'


async def generate_code(
    db: AsyncSession,
    code_type: str = AccessCodeType.UNIVERSAL,
    max_uses: int = 1,
    expires_at: datetime | None = None,
    notes: str | None = None,
    created_by: str = 'admin',
    price: int | None = None,
) -> AccessCode:
    """Create a single access code with a random code string.

    Args:
        db: Async database session.
        code_type: Feature type this code unlocks.
        max_uses: Maximum number of redemptions.
        expires_at: Optional expiration timestamp.
        notes: Optional admin notes.
        created_by: Identifier of the creator.
        price: Optional price per redemption in smallest currency unit.

    Returns:
        The newly created AccessCode ORM object.
    """
    code_str = _generate_code_string(code_type)

    access_code = AccessCode(
        code=code_str,
        code_type=code_type,
        max_uses=max_uses,
        use_count=0,
        status=AccessCodeStatus.ACTIVE,
        expires_at=expires_at,
        notes=notes,
        created_by=created_by,
        price=price,
    )
    db.add(access_code)
    await db.commit()
    await db.refresh(access_code)

    logger.info('access_code_generated', code=code_str, code_type=code_type, max_uses=max_uses, price=price)
    return access_code


async def generate_batch(
    db: AsyncSession,
    code_type: str = AccessCodeType.UNIVERSAL,
    count: int = 1,
    max_uses: int = 1,
    expires_at: datetime | None = None,
    notes: str | None = None,
    created_by: str = 'admin',
    price: int | None = None,
) -> list[AccessCode]:
    """Batch-create access codes (up to 100).

    Args:
        db: Async database session.
        code_type: Feature type for all codes.
        count: Number of codes to generate (1-100).
        max_uses: Maximum redemptions per code.
        expires_at: Optional expiration timestamp.
        notes: Optional admin notes applied to all codes.
        created_by: Identifier of the creator.
        price: Optional price per redemption in smallest currency unit.

    Returns:
        List of newly created AccessCode ORM objects.
    """
    count = max(1, min(count, 100))
    codes: list[AccessCode] = []

    for _ in range(count):
        code_str = _generate_code_string(code_type)
        access_code = AccessCode(
            code=code_str,
            code_type=code_type,
            max_uses=max_uses,
            use_count=0,
            status=AccessCodeStatus.ACTIVE,
            expires_at=expires_at,
            notes=notes,
            created_by=created_by,
            price=price,
        )
        db.add(access_code)
        codes.append(access_code)

    await db.commit()

    # Refresh all to get DB-assigned IDs and timestamps
    for code in codes:
        await db.refresh(code)

    logger.info('access_codes_batch_generated', count=count, code_type=code_type)
    return codes


async def validate_code(
    db: AsyncSession,
    code: str,
    session_type: str,
) -> dict:
    """Validate an access code for a given session type.

    Checks: code exists, status=active, not expired,
    use_count < max_uses, code_type compatible with session_type.

    Args:
        db: Async database session.
        code: Access code string (case-insensitive).
        session_type: 'vibe_check' or 'photobooth'.

    Returns:
        Dict with keys: valid (bool), message (str), access_code_id (int|None).
    """
    normalized = code.upper().strip().replace('-', '')
    stmt = select(AccessCode).where(
        func.replace(AccessCode.code, '-', '') == normalized,
    )
    result = await db.execute(stmt)
    access_code = result.scalar_one_or_none()

    if access_code is None:
        return {'valid': False, 'message': 'Invalid code', 'access_code_id': None}

    if access_code.status != AccessCodeStatus.ACTIVE:
        return {'valid': False, 'message': 'Code is no longer active', 'access_code_id': None}

    now = datetime.now(timezone.utc)
    if access_code.expires_at and access_code.expires_at <= now:
        # Auto-expire
        access_code.status = AccessCodeStatus.EXPIRED
        await db.commit()
        return {'valid': False, 'message': 'Code has expired', 'access_code_id': None}

    if access_code.use_count >= access_code.max_uses:
        return {'valid': False, 'message': 'Code has reached maximum uses', 'access_code_id': None}

    compatible_types = _COMPATIBLE_TYPES.get(session_type, set())
    if access_code.code_type not in compatible_types:
        return {'valid': False, 'message': 'Code is not valid for this feature', 'access_code_id': None}

    return {
        'valid': True,
        'message': 'Code validated successfully',
        'access_code_id': access_code.id,
    }


async def redeem_code(
    db: AsyncSession,
    code_id: int,
) -> AccessCode:
    """Redeem an access code by incrementing its use count.

    If use_count reaches max_uses after incrementing, sets status to USED.

    Args:
        db: Async database session.
        code_id: ID of the access code to redeem.

    Returns:
        The updated AccessCode ORM object.

    Raises:
        ValueError: If the code is not found or not redeemable.
    """
    stmt = select(AccessCode).where(AccessCode.id == code_id)
    result = await db.execute(stmt)
    access_code = result.scalar_one_or_none()

    if access_code is None:
        raise ValueError(f'Access code {code_id} not found')

    if access_code.status != AccessCodeStatus.ACTIVE:
        raise ValueError(f'Access code {code_id} is not active (status={access_code.status})')

    access_code.use_count += 1

    if access_code.use_count >= access_code.max_uses:
        access_code.status = AccessCodeStatus.USED

    await db.commit()
    await db.refresh(access_code)

    logger.info(
        'access_code_redeemed',
        code=access_code.code,
        use_count=access_code.use_count,
        max_uses=access_code.max_uses,
        price=access_code.price,
    )
    return access_code


async def get_summary(db: AsyncSession) -> dict:
    """Compute aggregate access code statistics via a single SQL query.

    Returns a dict matching AccessCodeSummaryResponse fields.
    """
    # Auto-expire before computing stats
    now = datetime.now(timezone.utc)
    expired_stmt = (
        select(AccessCode)
        .where(
            AccessCode.status == AccessCodeStatus.ACTIVE,
            AccessCode.expires_at.isnot(None),
            AccessCode.expires_at <= now,
        )
    )
    expired_result = await db.execute(expired_stmt)
    expired_codes = list(expired_result.scalars().all())
    for code in expired_codes:
        code.status = AccessCodeStatus.EXPIRED
    if expired_codes:
        await db.commit()

    stmt = select(
        func.count().label('total'),
        func.sum(case(
            (AccessCode.status == AccessCodeStatus.ACTIVE, 1),
            else_=0,
        )).label('active'),
        func.sum(case(
            (AccessCode.status == AccessCodeStatus.USED, 1),
            else_=0,
        )).label('used'),
        func.coalesce(func.sum(AccessCode.use_count), 0).label('total_redemptions'),
        func.coalesce(func.sum(AccessCode.max_uses), 0).label('total_max_uses'),
        func.coalesce(func.sum(
            AccessCode.use_count * AccessCode.price,
        ), 0).label('estimated_revenue'),
    )
    result = await db.execute(stmt)
    row = result.one()

    total = row.total or 0
    total_max = int(row.total_max_uses or 0)
    redemption_rate = round(int(row.total_redemptions or 0) / total_max, 4) if total_max > 0 else 0.0

    return {
        'total_codes': total,
        'active_codes': int(row.active or 0),
        'used_codes': int(row.used or 0),
        'total_redemptions': int(row.total_redemptions or 0),
        'total_max_uses': total_max,
        'redemption_rate': redemption_rate,
        'estimated_revenue': int(row.estimated_revenue or 0),
    }


async def list_codes(
    db: AsyncSession,
    status: str | None = None,
    code_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AccessCode], int]:
    """List access codes with optional filters and pagination.

    Args:
        db: Async database session.
        status: Optional status filter.
        code_type: Optional code type filter.
        limit: Page size (max 100).
        offset: Page offset.

    Returns:
        Tuple of (list of AccessCode objects, total count).
    """
    limit = max(1, min(limit, 100))

    # Auto-expire any active codes past their expiration
    now = datetime.now(timezone.utc)
    expired_stmt = (
        select(AccessCode)
        .where(
            AccessCode.status == AccessCodeStatus.ACTIVE,
            AccessCode.expires_at.isnot(None),
            AccessCode.expires_at <= now,
        )
    )
    expired_result = await db.execute(expired_stmt)
    expired_codes = list(expired_result.scalars().all())
    for code in expired_codes:
        code.status = AccessCodeStatus.EXPIRED
    if expired_codes:
        await db.commit()
        logger.info('access_codes_auto_expired', count=len(expired_codes))

    # Build filtered query
    stmt = select(AccessCode)
    count_stmt = select(func.count()).select_from(AccessCode)

    if status:
        stmt = stmt.where(AccessCode.status == status)
        count_stmt = count_stmt.where(AccessCode.status == status)
    if code_type:
        stmt = stmt.where(AccessCode.code_type == code_type)
        count_stmt = count_stmt.where(AccessCode.code_type == code_type)

    # Get total count
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Get paginated results
    stmt = stmt.order_by(AccessCode.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    codes = list(result.scalars().all())

    return codes, total


async def revoke_code(
    db: AsyncSession,
    code_id: int,
) -> AccessCode:
    """Revoke an access code, preventing further use.

    Args:
        db: Async database session.
        code_id: ID of the access code to revoke.

    Returns:
        The updated AccessCode ORM object.

    Raises:
        ValueError: If the code is not found.
    """
    stmt = select(AccessCode).where(AccessCode.id == code_id)
    result = await db.execute(stmt)
    access_code = result.scalar_one_or_none()

    if access_code is None:
        raise ValueError(f'Access code {code_id} not found')

    access_code.status = AccessCodeStatus.REVOKED
    await db.commit()
    await db.refresh(access_code)

    logger.info('access_code_revoked', code=access_code.code, code_id=code_id)
    return access_code


async def delete_code(
    db: AsyncSession,
    code_id: int,
) -> bool:
    """Hard-delete an access code.

    Only succeeds if no active kiosk sessions reference the code.
    Since kiosk_sessions.access_code_id uses SET NULL on delete,
    the FK itself won't block deletion — but we check for any
    linked sessions as a safety measure.

    Args:
        db: Async database session.
        code_id: ID of the access code to delete.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If active sessions reference this code.
    """
    from app.models.session import KioskSession

    # Check for linked sessions
    session_stmt = (
        select(func.count())
        .select_from(KioskSession)
        .where(KioskSession.access_code_id == code_id)
    )
    session_result = await db.execute(session_stmt)
    linked_count = session_result.scalar() or 0

    if linked_count > 0:
        raise ValueError(
            f'Cannot delete access code {code_id}: {linked_count} session(s) reference it'
        )

    stmt = delete(AccessCode).where(AccessCode.id == code_id)
    result = await db.execute(stmt)

    if result.rowcount == 0:
        return False

    await db.commit()
    logger.info('access_code_deleted', code_id=code_id)
    return True
