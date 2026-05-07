import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { adminApi } from '@/api/adminApi';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDuration, formatIDR, formatPercent, formatPeriod } from '@/lib/formatters';

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  payment: 'Payment',
  capture: 'Capture',
  review: 'Review',
  processing: 'Processing',
  reveal: 'Reveal',
  frame_select: 'Frame Select',
  arrange: 'Arrange',
  compositing: 'Compositing',
  photobooth_reveal: 'Photobooth Reveal',
  reset: 'Reset',
};

const FEATURE_LABELS: Record<string, string> = {
  vibe_check: 'Vibe Check',
  photobooth: 'Photobooth',
};

const COLORS = {
  payment: '#8b5cf6',
  access_code: '#06b6d4',
  completed: '#22c55e',
  abandoned: '#ef4444',
};

const MAX_CHART_POINTS = 30;

type Range = '7d' | '30d' | '90d' | 'all' | 'custom';

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

function getRangeParams(range: Range, customStart?: string, customEnd?: string) {
  const now = new Date();
  const end = now.toISOString();
  let start: string;
  let group_by: string;

  switch (range) {
    case '7d':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
      group_by = 'day';
      break;
    case '30d':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();
      group_by = 'day';
      break;
    case '90d':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90).toISOString();
      group_by = 'week';
      break;
    case 'all':
      start = '2000-01-01T00:00:00Z';
      group_by = 'month';
      break;
    case 'custom': {
      const s = customStart || new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString().slice(0, 10);
      const e = customEnd || now.toISOString().slice(0, 10);
      start = `${s}T00:00:00Z`;
      const endDate = `${e}T23:59:59Z`;
      const daysDiff = (new Date(endDate).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
      group_by = daysDiff <= 31 ? 'day' : daysDiff <= 180 ? 'week' : 'month';
      return { start_date: start, end_date: endDate, group_by };
    }
  }

  return { start_date: start, end_date: end, group_by };
}

const chartTooltipStyle = {
  backgroundColor: 'rgba(15,15,20,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: 'white',
  fontSize: '13px',
};

interface PeakHourSlot {
  day_of_week: number;
  hour: number;
  sessions: number;
  vibe_check_sessions: number;
  photobooth_sessions: number;
  revenue: number;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_START = 6;
const HOUR_END = 23;

function PeakHoursHeatmap({ slots, mode }: { slots: PeakHourSlot[]; mode: 'sessions' | 'revenue' }) {
  const lookup = useMemo(() => {
    const map = new Map<string, PeakHourSlot>();
    for (const s of slots) map.set(`${s.day_of_week}-${s.hour}`, s);
    return map;
  }, [slots]);

  const maxSessions = useMemo(
    () => Math.max(1, ...slots.map((s) => s.sessions)),
    [slots],
  );

  const maxRevenue = useMemo(
    () => Math.max(1, ...slots.map((s) => s.revenue)),
    [slots],
  );

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = HOUR_START; i <= HOUR_END; i++) h.push(i);
    return h;
  }, []);

  const [tooltip, setTooltip] = useState<{ day: string; hour: number; slot: PeakHourSlot; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tooltip) return;
    const handler = () => setTooltip(null);
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [tooltip]);

  return (
    <div data-heatmap-container style={{ position: 'relative', overflowX: 'auto' }} onMouseLeave={() => setTooltip(null)}>
      {/* Hour header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `3.5rem repeat(${hours.length}, 1fr)`,
          gap: '2px',
          marginBottom: '2px',
        }}
      >
        <div />
        {hours.map((h) => (
          <div
            key={h}
            className="text-center tabular-nums"
            style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}
          >
            {h % 12 || 12}{h < 12 ? 'a' : 'p'}
          </div>
        ))}
      </div>

      {/* Day rows */}
      {DAY_LABELS.map((day, dow) => (
        <div
          key={day}
          style={{
            display: 'grid',
            gridTemplateColumns: `3.5rem repeat(${hours.length}, 1fr)`,
            gap: '2px',
            marginBottom: '2px',
          }}
        >
          <div
            className="flex items-center justify-end"
            style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', paddingRight: '0.5rem' }}
          >
            {day}
          </div>
          {hours.map((hour) => {
            const slot = lookup.get(`${dow}-${hour}`);
            const count = slot?.sessions ?? 0;
            const revenue = slot?.revenue ?? 0;
            const value = mode === 'sessions' ? count : revenue;
            const max = mode === 'sessions' ? maxSessions : maxRevenue;
            const intensity = value / max;
            const display = mode === 'sessions'
              ? (count > 0 ? count : '')
              : (revenue > 0 ? `${(revenue / 1000).toFixed(0)}k` : '');
            return (
              <div
                key={hour}
                onMouseEnter={(e) => {
                  if (count === 0 && revenue === 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    day,
                    hour,
                    slot: slot!,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  height: '28px',
                  borderRadius: '3px',
                  backgroundColor:
                    value === 0
                      ? 'rgba(255,255,255,0.03)'
                      : mode === 'sessions'
                        ? `rgba(34,197,94,${0.15 + intensity * 0.75})`
                        : `rgba(139,92,246,${0.15 + intensity * 0.75})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: intensity > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                  cursor: (count > 0 || revenue > 0) ? 'pointer' : 'default',
                  transition: 'background-color 0.15s',
                }}
              >
                {display}
              </div>
            );
          })}
        </div>
      ))}

      {/* Hover tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15,15,20,0.95)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            fontSize: '12px',
            color: 'white',
            pointerEvents: 'none',
            zIndex: 9999,
            whiteSpace: 'nowrap',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            {tooltip.day} {tooltip.hour}:00
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>
            {tooltip.slot.sessions} session{tooltip.slot.sessions !== 1 ? 's' : ''}
            {tooltip.slot.revenue > 0 && ` · ${formatIDR(tooltip.slot.revenue)}`}
          </p>
          <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.75rem' }}>
            <span style={{ color: COLORS.completed }}>Vibe Check: {tooltip.slot.vibe_check_sessions}</span>
            <span style={{ color: COLORS.payment }}>Photobooth: {tooltip.slot.photobooth_sessions}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Delta({ current, previous, invert = false, rangeLabel }: { current: number; previous: number; invert?: boolean; rangeLabel: string }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (pct === 0) return null;
  const positive = pct > 0;
  const good = invert ? !positive : positive;
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: good ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
        marginLeft: '0.5rem',
      }}
    >
      {positive ? '+' : ''}{pct.toFixed(0)}% <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>vs prev. {rangeLabel}</span>
    </span>
  );
}

interface Props {
  mode?: 'summary' | 'full';
}

export default function AnalyticsDashboard({ mode = 'full' }: Props) {
  const [range, setRange] = useState<Range>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [heatmapMode, setHeatmapMode] = useState<'sessions' | 'revenue'>('sessions');
  const params = useMemo(() => getRangeParams(range, customStart, customEnd), [range, customStart, customEnd]);
  const rangeLabel = range === 'custom' ? 'period' : RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? 'period';

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['analytics-sessions', params],
    queryFn: () => adminApi.getSessionAnalytics(params).then((r) => r.data),
  });

  const { data: revenue, isLoading: revenueLoading } = useQuery({
    queryKey: ['analytics-revenue', params],
    queryFn: () => adminApi.getRevenueAnalytics(params).then((r) => r.data),
  });

  const { data: features } = useQuery({
    queryKey: ['analytics-features', params],
    queryFn: () => adminApi.getFeatureBreakdown(params).then((r) => r.data),
  });

  const { data: peakHours } = useQuery({
    queryKey: ['analytics-peak-hours', params],
    queryFn: () => adminApi.getPeakHours(params).then((r) => r.data),
  });

  const { data: dropoff } = useQuery({
    queryKey: ['analytics-dropoff', params],
    queryFn: () => adminApi.getDropoffFunnel(params).then((r) => r.data),
  });

  const { data: printStats } = useQuery({
    queryKey: ['analytics-print-stats', params],
    queryFn: () => adminApi.getPrintStats(params).then((r) => r.data),
  });

  if (sessionsLoading || revenueLoading) {
    return <p className="text-white/40">Loading analytics...</p>;
  }

  const hasData = (sessions?.summary.total_sessions ?? 0) > 0;
  const sessionRows = sessions?.timeseries ?? [];
  const chartSessionRows = sessionRows.slice(-MAX_CHART_POINTS);
  const revenueRows = revenue?.timeseries ?? [];
  const chartRevenueRows = revenueRows.slice(-MAX_CHART_POINTS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">
          {mode === 'summary' ? 'Dashboard' : 'Analytics'}
        </h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Session activity and revenue performance for your kiosk.
          {mode === 'summary' && (
            <> Last 30 days.</>
          )}
        </p>
      </div>

      {/* Range filter */}
      {mode === 'full' && (
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              variant="ghost"
              size="sm"
              onClick={() => setRange(r.key)}
              className={`text-sm border-0 ${
                range === r.key
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]'
              }`}
              style={{ padding: '0.5rem 1rem' }}
            >
              {r.label}
            </Button>
          ))}
        </div>
      )}

      {/* Custom date range inputs */}
      {mode === 'full' && range === 'custom' && (
        <div
          className="flex items-center gap-3"
          style={{ colorScheme: 'dark' }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/30">From</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.375rem',
                padding: '0.5rem 0.75rem',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '0.875rem',
                outline: 'none',
                minWidth: '150px',
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/30">To</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.375rem',
                padding: '0.5rem 0.75rem',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '0.875rem',
                outline: 'none',
                minWidth: '150px',
              }}
            />
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Total Sessions</p>
          <div className="flex items-baseline">
            <p className="text-2xl font-bold font-display text-white tabular-nums">
              {sessions?.summary.total_sessions ?? 0}
            </p>
            <Delta current={sessions?.summary.total_sessions ?? 0} previous={sessions?.previous_summary?.total_sessions ?? 0} rangeLabel={rangeLabel} />
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            All photo sessions started, including abandoned ones.
            {mode === 'summary' && ' (last 30 days)'}
          </p>
        </Card>

        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Completion Rate</p>
          <div className="flex items-baseline">
            <p className="text-2xl font-bold font-display text-white">
              {formatPercent(sessions?.summary.completion_rate ?? 0)}
            </p>
            <Delta current={sessions?.summary.completion_rate ?? 0} previous={sessions?.previous_summary?.completion_rate ?? 0} rangeLabel={rangeLabel} />
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            <span style={{ color: 'rgba(34,197,94,0.7)' }}>{sessions?.summary.completed_sessions ?? 0} completed</span>
            {' / '}
            <span style={{ color: 'rgba(239,68,68,0.7)' }}>{sessions?.summary.abandoned_sessions ?? 0} abandoned</span>
          </p>
        </Card>

        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Avg Duration</p>
          <div className="flex items-baseline">
            <p className="text-2xl font-bold font-display text-white">
              {formatDuration(sessions?.summary.avg_duration_seconds ?? 0)}
            </p>
            <Delta current={sessions?.summary.avg_duration_seconds ?? 0} previous={sessions?.previous_summary?.avg_duration_seconds ?? 0} invert rangeLabel={rangeLabel} />
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>Average time from session start to completion.</p>
        </Card>

        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Revenue</p>
          <div className="flex items-baseline">
            <p className="text-2xl font-bold font-display text-white">
              {formatIDR(revenue?.summary.total_revenue ?? 0)}
            </p>
            <Delta current={revenue?.summary.total_revenue ?? 0} previous={revenue?.previous_summary?.total_revenue ?? 0} rangeLabel={rangeLabel} />
          </div>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            Avg per paid session: <span className="text-white/50">{formatIDR(revenue?.summary.avg_transaction_amount ?? 0)}</span>
          </p>
          <p className="text-xs text-white/20" style={{ marginTop: '0.15rem' }}>
            Average revenue from each session that had a payment or priced access code.
          </p>
          <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span className="text-xs text-white/30">
              <span style={{ color: COLORS.payment }}>Payment:</span>{' '}
              {formatIDR(revenue?.summary.payment_revenue ?? 0)}
            </span>
            <span className="text-xs text-white/30">
              <span style={{ color: COLORS.access_code }}>Access Code:</span>{' '}
              {formatIDR(revenue?.summary.access_code_revenue ?? 0)}
            </span>
          </div>
        </Card>
      </div>

      {/* Feature Breakdown */}
      {features && features.features.length > 0 && (
        <Card className="card-surface border-0">
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Feature Breakdown</h3>
            <p className="text-xs text-white/25" style={{ marginBottom: '1.25rem' }}>
              Performance comparison between Vibe Check and Photobooth sessions.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {features.features.map((f) => (
                <div
                  key={f.feature}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02]"
                  style={{ padding: '1rem 1.25rem' }}
                >
                  <p className="text-sm font-medium text-white/70" style={{ marginBottom: '0.75rem' }}>
                    {FEATURE_LABELS[f.feature] ?? f.feature}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-xs text-white/30">Sessions</p>
                      <p className="text-lg font-display font-bold text-white tabular-nums">{f.total_sessions}</p>
                    </div>
                    <div>
                      <p className="text-xs text-white/30">Completion</p>
                      <p className="text-lg font-display font-bold text-white">{formatPercent(f.completion_rate)}</p>
                      <p className="text-xs text-white/25" style={{ marginTop: '0.15rem' }}>
                        <span style={{ color: 'rgba(34,197,94,0.7)' }}>{f.completed_sessions}</span>
                        {' / '}
                        <span style={{ color: 'rgba(239,68,68,0.7)' }}>{f.abandoned_sessions}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-white/30">Avg Duration</p>
                      <p className="text-sm font-display font-semibold text-white/80">{formatDuration(f.avg_duration_seconds)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-white/30">Avg / Paid Session</p>
                      <p className="text-sm font-display font-semibold text-white/80">
                        {formatIDR(f.paid_sessions > 0 ? Math.round(f.revenue / f.paid_sessions) : 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-white/30">Revenue</p>
                      <p className="text-sm font-display font-semibold text-white/80">{formatIDR(f.revenue)}</p>
                      <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem' }}>
                        <span className="text-xs" style={{ color: COLORS.payment }}>{formatIDR(f.payment_revenue)}</span>
                        <span className="text-xs" style={{ color: COLORS.access_code }}>{formatIDR(f.access_code_revenue)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {mode === 'full' && (
        <>
          {/* Empty state */}
          {!hasData && (
            <Card className="card-surface border-0" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <p className="text-white/40 text-sm">No session data for this period.</p>
              <p className="text-white/25 text-xs" style={{ marginTop: '0.5rem' }}>
                Try selecting a wider range, or analytics will appear after your first kiosk session.
              </p>
            </Card>
          )}

          {/* Session History Chart */}
          {chartSessionRows.length > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Session History</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1rem' }}>
                  Completed vs abandoned sessions per period.
                </p>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartSessionRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="period"
                        tickFormatter={(p: string) => formatPeriod(p)}
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelFormatter={(p: string) => formatPeriod(p)}
                      />
                      <Legend />
                      <Bar dataKey="completed" name="Completed" stackId="sessions" fill={COLORS.completed} />
                      <Bar dataKey="abandoned" name="Abandoned" stackId="sessions" fill={COLORS.abandoned} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          )}

          {/* Revenue History Chart */}
          {chartRevenueRows.length > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Revenue History</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1rem' }}>
                  Revenue breakdown by entry method (payment vs access code).
                </p>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartRevenueRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="period"
                        tickFormatter={(p: string) => formatPeriod(p)}
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                        tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelFormatter={(p: string) => formatPeriod(p)}
                        formatter={(value: number) => formatIDR(value)}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="payment_revenue"
                        name="Payment"
                        stroke={COLORS.payment}
                        fill={COLORS.payment}
                        fillOpacity={0.3}
                        stackId="revenue"
                      />
                      <Area
                        type="monotone"
                        dataKey="access_code_revenue"
                        name="Access Code"
                        stroke={COLORS.access_code}
                        fill={COLORS.access_code}
                        fillOpacity={0.3}
                        stackId="revenue"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          )}

          {/* State Distribution */}
          {sessions && Object.keys(sessions.state_distribution).length > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>State Distribution</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1rem' }}>
                  Number of sessions currently sitting in each stage. Idle sessions may have timed out.
                </p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(sessions.state_distribution).map(([state, count]) => (
                    <Badge key={state} variant="secondary" className="bg-white/[0.06] text-white/60 border-0" style={{ padding: '0.5rem 0.75rem' }}>
                      {STATE_LABELS[state] ?? state}: <span className="font-display tabular-nums ml-1">{count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Peak Hours Heatmap */}
          {peakHours && peakHours.slots.length > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: '0.25rem' }}>
                  <h3 className="text-lg font-display text-white">Peak Hours</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setHeatmapMode('sessions')}
                      style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '11px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: heatmapMode === 'sessions' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
                        color: heatmapMode === 'sessions' ? 'rgba(34,197,94,0.9)' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      Sessions
                    </button>
                    <button
                      onClick={() => setHeatmapMode('revenue')}
                      style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '11px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: heatmapMode === 'revenue' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                        color: heatmapMode === 'revenue' ? 'rgba(139,92,246,0.9)' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      Revenue
                    </button>
                  </div>
                </div>
                <p className="text-xs text-white/25" style={{ marginBottom: '1.25rem' }}>
                  {heatmapMode === 'sessions'
                    ? 'When your kiosk gets the most traffic. Brighter cells = more sessions.'
                    : 'When your kiosk earns the most revenue. Brighter cells = more revenue.'}
                </p>
                <PeakHoursHeatmap slots={peakHours.slots} mode={heatmapMode} />
              </div>
            </Card>
          )}

          {/* Drop-off Funnel */}
          {dropoff && dropoff.total_abandoned > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Drop-off Funnel</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1.25rem' }}>
                  Where {dropoff.total_abandoned} abandoned session{dropoff.total_abandoned !== 1 ? 's' : ''} got stuck before completing.
                </p>
                <div className="flex flex-col gap-2">
                  {dropoff.stages.map((stage) => (
                    <div key={stage.state} className="flex items-center gap-3">
                      <span
                        className="text-xs text-white/50"
                        style={{ width: '7rem', textAlign: 'right', flexShrink: 0 }}
                      >
                        {STATE_LABELS[stage.state] ?? stage.state}
                      </span>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '4px', height: '24px', position: 'relative', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${stage.percentage * 100}%`,
                            background: `rgba(239,68,68,${0.3 + stage.percentage * 0.5})`,
                            borderRadius: '4px',
                            minWidth: stage.count > 0 ? '2px' : '0',
                          }}
                        />
                      </div>
                      <span className="text-xs tabular-nums" style={{ width: '4rem', color: 'rgba(255,255,255,0.6)' }}>
                        {stage.count} ({(stage.percentage * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Print Stats */}
          {printStats && printStats.total_prints > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Print Reliability</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1rem' }}>
                  Print job success rate across all sessions.
                </p>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-2xl font-bold font-display text-white tabular-nums">
                      {formatPercent(printStats.success_rate)}
                    </p>
                    <p className="text-xs text-white/25" style={{ marginTop: '0.25rem' }}>Success rate</p>
                  </div>
                  <div style={{ width: '1px', height: '2.5rem', background: 'rgba(255,255,255,0.08)' }} />
                  <div>
                    <p className="text-lg font-display font-semibold text-white tabular-nums">
                      {printStats.total_prints}
                    </p>
                    <p className="text-xs text-white/25">Total prints</p>
                  </div>
                  <div>
                    <p className="text-lg font-display font-semibold tabular-nums" style={{ color: 'rgba(34,197,94,0.8)' }}>
                      {printStats.successful}
                    </p>
                    <p className="text-xs text-white/25">Successful</p>
                  </div>
                  <div>
                    <p className="text-lg font-display font-semibold tabular-nums" style={{ color: 'rgba(239,68,68,0.8)' }}>
                      {printStats.failed}
                    </p>
                    <p className="text-xs text-white/25">Failed</p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
