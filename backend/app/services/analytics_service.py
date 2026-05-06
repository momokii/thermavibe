"""Session aggregation and analytics service.

Provides analytics queries for session counts, revenue, completion rates,
and time-series data for the admin dashboard.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import structlog
from sqlalchemy import Integer, and_, case, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import AnalyticsEvent
from app.models.session import KioskSession, PaymentStatus, SessionType
from app.schemas.admin import (
    EntryMethodStats,
    FeatureBreakdownItem,
    FeatureBreakdownResponse,
    PeakHourSlot,
    PeakHoursResponse,
    RevenueAnalyticsResponse,
    RevenueAnalyticsSummary,
    RevenueTimeseriesPoint,
    SessionAnalyticsResponse,
    SessionAnalyticsSummary,
    SessionTimeseriesPoint,
)

logger = structlog.get_logger(__name__)


async def get_session_analytics(
    db: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    group_by: str = 'day',
) -> SessionAnalyticsResponse:
    """Get session analytics with summary and timeseries."""
    now = datetime.now(timezone.utc)
    if start_date is None:
        start_date = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        start_date = start_date.replace(day=max(1, now.day - 30))
    if end_date is None:
        end_date = now

    # Summary stats
    total_stmt = select(func.count()).select_from(KioskSession).where(
        KioskSession.created_at >= start_date,
        KioskSession.created_at <= end_date,
    )
    total_result = await db.execute(total_stmt)
    total_sessions = total_result.scalar() or 0

    completed_stmt = select(func.count()).select_from(KioskSession).where(
        KioskSession.created_at >= start_date,
        KioskSession.created_at <= end_date,
        KioskSession.completed_at.isnot(None),
    )
    completed_result = await db.execute(completed_stmt)
    completed_sessions = completed_result.scalar() or 0

    abandoned_sessions = total_sessions - completed_sessions
    completion_rate = (completed_sessions / total_sessions) if total_sessions > 0 else 0.0

    avg_duration_stmt = select(
        func.avg(
            func.extract('epoch', KioskSession.completed_at - KioskSession.created_at)
        )
    ).where(
        KioskSession.created_at >= start_date,
        KioskSession.created_at <= end_date,
        KioskSession.completed_at.isnot(None),
    )
    avg_result = await db.execute(avg_duration_stmt)
    avg_duration = float(avg_result.scalar() or 0)

    # State distribution
    state_stmt = (
        select(KioskSession.state, func.count())
        .where(KioskSession.created_at >= start_date, KioskSession.created_at <= end_date)
        .group_by(KioskSession.state)
    )
    state_result = await db.execute(state_stmt)
    state_distribution = dict(state_result.all())

    summary = SessionAnalyticsSummary(
        total_sessions=total_sessions,
        completed_sessions=completed_sessions,
        abandoned_sessions=abandoned_sessions,
        completion_rate=round(completion_rate, 2),
        avg_duration_seconds=round(avg_duration, 2),
    )

    # Time-series
    trunc_map = {'day': 'day', 'week': 'week', 'month': 'month'}
    trunc = trunc_map.get(group_by, 'day')

    timeseries_stmt = (
        select(
            func.date_trunc(trunc, KioskSession.created_at).label('period'),
            func.count().label('total'),
            func.count(KioskSession.completed_at).label('completed'),
            func.avg(
                func.extract('epoch', KioskSession.completed_at - KioskSession.created_at)
            ).label('avg_duration'),
        )
        .where(KioskSession.created_at >= start_date, KioskSession.created_at <= end_date)
        .group_by(text('period'))
        .order_by(text('period'))
    )
    ts_result = await db.execute(timeseries_stmt)
    ts_rows = ts_result.all()

    def _fmt_period(val: object, group: str) -> str:
        """Format a period value from date_trunc to a clean string."""
        if hasattr(val, 'strftime'):
            if group == 'week':
                return val.strftime('%Y-W%W')
            if group == 'month':
                return val.strftime('%Y-%m')
            return val.strftime('%Y-%m-%d')
        return str(val)

    timeseries = [
        SessionTimeseriesPoint(
            period=_fmt_period(row.period, trunc),
            sessions=row.total,
            completed=row.completed or 0,
            abandoned=(row.total - (row.completed or 0)),
            avg_duration_seconds=round(float(row.avg_duration or 0), 2),
        )
        for row in ts_rows
    ]

    return SessionAnalyticsResponse(
        summary=summary,
        state_distribution=state_distribution,
        timeseries=timeseries,
        page=1,
        per_page=len(timeseries),
        total_periods=len(timeseries),
    )


async def get_revenue_analytics(
    db: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    group_by: str = 'day',
) -> RevenueAnalyticsResponse:
    """Get revenue analytics with summary, timeseries, and entry method breakdown."""
    now = datetime.now(timezone.utc)
    if start_date is None:
        start_date = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        start_date = start_date.replace(day=max(1, now.day - 30))
    if end_date is None:
        end_date = now

    # Payment revenue (QRIS/cashless) — exclude access-code sessions
    payment_stmt = select(
        func.count().label('tx_count'),
        func.coalesce(func.sum(KioskSession.payment_amount), 0).label('total'),
    ).where(
        KioskSession.payment_status == PaymentStatus.CONFIRMED,
        KioskSession.access_code_id.is_(None),
        KioskSession.created_at >= start_date,
        KioskSession.created_at <= end_date,
    )
    payment_row = (await db.execute(payment_stmt)).one()
    payment_tx = payment_row.tx_count or 0
    payment_rev = int(payment_row.total or 0)

    # Access code revenue (priced codes) — only positive amounts
    ac_stmt = select(
        func.count().label('tx_count'),
        func.coalesce(func.sum(KioskSession.payment_amount), 0).label('total'),
    ).where(
        KioskSession.access_code_id.isnot(None),
        KioskSession.payment_amount > 0,
        KioskSession.created_at >= start_date,
        KioskSession.created_at <= end_date,
    )
    ac_row = (await db.execute(ac_stmt)).one()
    ac_tx = ac_row.tx_count or 0
    ac_rev = int(ac_row.total or 0)

    total_transactions = payment_tx + ac_tx
    total_revenue = payment_rev + ac_rev
    avg_transaction = int(total_revenue / total_transactions) if total_transactions > 0 else 0

    summary = RevenueAnalyticsSummary(
        total_revenue=total_revenue,
        total_transactions=total_transactions,
        avg_transaction_amount=avg_transaction,
        currency='IDR',
        refund_count=0,
        refund_total=0,
        payment_revenue=payment_rev,
        payment_transactions=payment_tx,
        access_code_revenue=ac_rev,
        access_code_transactions=ac_tx,
    )

    # Revenue filter for timeseries (same combined logic)
    revenue_filter = or_(
        KioskSession.payment_status == PaymentStatus.CONFIRMED,
        and_(
            KioskSession.access_code_id.isnot(None),
            KioskSession.payment_amount.isnot(None),
        ),
    )

    # Time-series with per-period entry method breakdown
    trunc_map = {'day': 'day', 'week': 'week', 'month': 'month'}
    trunc = trunc_map.get(group_by, 'day')

    timeseries_stmt = (
        select(
            func.date_trunc(trunc, KioskSession.created_at).label('period'),
            func.coalesce(func.sum(KioskSession.payment_amount), 0).label('revenue'),
            func.count().label('transactions'),
            func.coalesce(func.sum(case(
                (and_(
                    KioskSession.payment_status == PaymentStatus.CONFIRMED,
                    KioskSession.access_code_id.is_(None),
                ), KioskSession.payment_amount),
                else_=0,
            )), 0).label('payment_revenue'),
            func.sum(case(
                (and_(
                    KioskSession.payment_status == PaymentStatus.CONFIRMED,
                    KioskSession.access_code_id.is_(None),
                ), 1),
                else_=0,
            )).label('payment_tx'),
            func.coalesce(func.sum(case(
                (KioskSession.access_code_id.isnot(None), KioskSession.payment_amount),
                else_=0,
            )), 0).label('ac_revenue'),
            func.sum(case(
                (KioskSession.access_code_id.isnot(None), 1),
                else_=0,
            )).label('ac_tx'),
        )
        .where(
            revenue_filter,
            KioskSession.created_at >= start_date,
            KioskSession.created_at <= end_date,
        )
        .group_by(text('period'))
        .order_by(text('period'))
    )
    ts_result = await db.execute(timeseries_stmt)
    ts_rows = ts_result.all()

    def _fmt_period_rev(val: object, group: str) -> str:
        if hasattr(val, 'strftime'):
            if group == 'week':
                return val.strftime('%Y-W%W')
            if group == 'month':
                return val.strftime('%Y-%m')
            return val.strftime('%Y-%m-%d')
        return str(val)

    timeseries = [
        RevenueTimeseriesPoint(
            period=_fmt_period_rev(row.period, trunc),
            revenue=int(row.revenue or 0),
            transactions=row.transactions or 0,
            refunds=0,
            payment_revenue=int(row.payment_revenue or 0),
            payment_transactions=int(row.payment_tx or 0),
            access_code_revenue=int(row.ac_revenue or 0),
            access_code_transactions=int(row.ac_tx or 0),
        )
        for row in ts_rows
    ]

    by_entry_method: dict[str, EntryMethodStats] = {}
    if payment_tx > 0:
        by_entry_method['payment'] = EntryMethodStats(transactions=payment_tx, revenue=payment_rev)
    if ac_tx > 0:
        by_entry_method['access_code'] = EntryMethodStats(transactions=ac_tx, revenue=ac_rev)

    return RevenueAnalyticsResponse(
        summary=summary,
        timeseries=timeseries,
        by_entry_method=by_entry_method,
    )


async def record_event(
    db: AsyncSession,
    event_type: str,
    session_id: str | None = None,
    metadata: dict | None = None,
) -> AnalyticsEvent:
    """Record an analytics event."""
    event = AnalyticsEvent(
        session_id=UUID(session_id) if session_id else None,
        event_type=event_type,
        metadata_=metadata or {},
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def get_feature_breakdown(
    db: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> FeatureBreakdownResponse:
    """Get per-feature analytics breakdown (vibe_check vs photobooth).

    Returns completion rate, average duration, and revenue for each feature,
    allowing the admin to compare feature performance.
    """
    now = datetime.now(timezone.utc)
    if start_date is None:
        start_date = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        start_date = start_date.replace(day=max(1, now.day - 30))
    if end_date is None:
        end_date = now

    features: list[FeatureBreakdownItem] = []

    for session_type in (SessionType.VIBE_CHECK, SessionType.PHOTOBOOTH):
        base = (
            KioskSession.session_type == session_type,
            KioskSession.created_at >= start_date,
            KioskSession.created_at <= end_date,
        )

        # Total + completed counts
        total_stmt = select(func.count()).select_from(KioskSession).where(*base)
        total = (await db.execute(total_stmt)).scalar() or 0

        completed_stmt = select(func.count()).select_from(KioskSession).where(
            *base,
            KioskSession.completed_at.isnot(None),
        )
        completed = (await db.execute(completed_stmt)).scalar() or 0

        abandoned = total - completed
        completion_rate = (completed / total) if total > 0 else 0.0

        # Average duration
        avg_stmt = select(
            func.avg(
                func.extract('epoch', KioskSession.completed_at - KioskSession.created_at),
            ),
        ).where(*base, KioskSession.completed_at.isnot(None))
        avg_duration = float((await db.execute(avg_stmt)).scalar() or 0)

        # Revenue: payment (cashless) — exclude access-code sessions
        payment_rev_stmt = select(
            func.coalesce(func.sum(KioskSession.payment_amount), 0),
        ).where(
            *base,
            KioskSession.payment_status == PaymentStatus.CONFIRMED,
            KioskSession.access_code_id.is_(None),
        )
        payment_revenue = int((await db.execute(payment_rev_stmt)).scalar() or 0)

        # Revenue: access code — only positive amounts
        ac_rev_stmt = select(
            func.coalesce(func.sum(KioskSession.payment_amount), 0),
        ).where(
            *base,
            KioskSession.access_code_id.isnot(None),
            KioskSession.payment_amount > 0,
        )
        access_code_revenue = int((await db.execute(ac_rev_stmt)).scalar() or 0)

        revenue = payment_revenue + access_code_revenue

        features.append(FeatureBreakdownItem(
            feature=session_type.value,
            total_sessions=total,
            completed_sessions=completed,
            abandoned_sessions=abandoned,
            completion_rate=round(completion_rate, 2),
            avg_duration_seconds=round(avg_duration, 2),
            revenue=revenue,
            payment_revenue=payment_revenue,
            access_code_revenue=access_code_revenue,
        ))

    return FeatureBreakdownResponse(features=features)


async def get_peak_hours(
    db: AsyncSession,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> PeakHoursResponse:
    """Get session distribution by day-of-week and hour.

    Returns a slot for every (day, hour) combination within business
    hours (6–23) that has at least one session.
    """
    now = datetime.now(timezone.utc)
    if start_date is None:
        start_date = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        start_date = start_date.replace(day=max(1, now.day - 30))
    if end_date is None:
        end_date = now

    # PostgreSQL DOW: 0=Sunday, 6=Saturday.  Convert to ISO: 1=Mon..7=Sun.
    stmt = (
        select(
            ((func.extract('dow', KioskSession.created_at).cast(Integer) + 6) % 7).label('dow'),
            func.extract('hour', KioskSession.created_at).cast(Integer).label('hour'),
            func.count().label('sessions'),
        )
        .where(
            KioskSession.created_at >= start_date,
            KioskSession.created_at <= end_date,
        )
        .group_by(text('dow'), text('hour'))
        .order_by(text('dow'), text('hour'))
    )
    result = await db.execute(stmt)
    rows = result.all()

    slots = [
        PeakHourSlot(day_of_week=row.dow, hour=row.hour, sessions=row.sessions)
        for row in rows
    ]
    return PeakHoursResponse(slots=slots)
