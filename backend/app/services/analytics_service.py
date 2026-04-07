"""Session aggregation and analytics service.

Provides analytics queries for session counts, revenue, completion rates,
and time-series data for the admin dashboard.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import structlog
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import AnalyticsEvent
from app.models.session import KioskSession, PaymentStatus
from app.schemas.admin import (
    ProviderRevenueStats,
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
    completion_rate = (completed_sessions / total_sessions * 100) if total_sessions > 0 else 0.0

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

    timeseries = [
        SessionTimeseriesPoint(
            period=str(row.period),
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
    """Get revenue analytics with summary and timeseries."""
    now = datetime.now(timezone.utc)
    if start_date is None:
        start_date = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        start_date = start_date.replace(day=max(1, now.day - 30))
    if end_date is None:
        end_date = now

    # Revenue summary
    confirmed_stmt = select(
        func.count().label('tx_count'),
        func.coalesce(func.sum(KioskSession.payment_amount), 0).label('total'),
        func.coalesce(func.avg(KioskSession.payment_amount), 0).label('avg'),
    ).where(
        KioskSession.payment_status == PaymentStatus.CONFIRMED,
        KioskSession.created_at >= start_date,
        KioskSession.created_at <= end_date,
    )
    confirmed_result = await db.execute(confirmed_stmt)
    row = confirmed_result.one()

    total_transactions = row.tx_count or 0
    total_revenue = int(row.total or 0)
    avg_transaction = int(row.avg or 0)

    summary = RevenueAnalyticsSummary(
        total_revenue=total_revenue,
        total_transactions=total_transactions,
        avg_transaction_amount=avg_transaction,
        currency='IDR',
        refund_count=0,
        refund_total=0,
    )

    # Time-series
    trunc_map = {'day': 'day', 'week': 'week', 'month': 'month'}
    trunc = trunc_map.get(group_by, 'day')

    timeseries_stmt = (
        select(
            func.date_trunc(trunc, KioskSession.created_at).label('period'),
            func.coalesce(func.sum(KioskSession.payment_amount), 0).label('revenue'),
            func.count().label('transactions'),
        )
        .where(
            KioskSession.payment_status == PaymentStatus.CONFIRMED,
            KioskSession.created_at >= start_date,
            KioskSession.created_at <= end_date,
        )
        .group_by(text('period'))
        .order_by(text('period'))
    )
    ts_result = await db.execute(timeseries_stmt)
    ts_rows = ts_result.all()

    timeseries = [
        RevenueTimeseriesPoint(
            period=str(row.period),
            revenue=int(row.revenue or 0),
            transactions=row.transactions or 0,
            refunds=0,
        )
        for row in ts_rows
    ]

    return RevenueAnalyticsResponse(
        summary=summary,
        timeseries=timeseries,
        by_provider={},
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
