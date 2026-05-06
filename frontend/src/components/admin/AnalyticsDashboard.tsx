import { useState, useMemo } from 'react';
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

type Range = '7d' | '30d' | '90d' | 'all';

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
];

function getRangeParams(range: Range) {
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

interface Props {
  mode?: 'summary' | 'full';
}

export default function AnalyticsDashboard({ mode = 'full' }: Props) {
  const [range, setRange] = useState<Range>('30d');
  const params = useMemo(() => getRangeParams(range), [range]);

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
        <h2 className="text-2xl font-display font-bold text-white">Analytics</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Session activity and revenue performance for your kiosk.
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

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Total Sessions</p>
          <p className="text-2xl font-bold font-display text-white tabular-nums">
            {sessions?.summary.total_sessions ?? 0}
          </p>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>All photo sessions started, including abandoned ones.</p>
        </Card>

        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Completion Rate</p>
          <p className="text-2xl font-bold font-display text-white">
            {formatPercent(sessions?.summary.completion_rate ?? 0)}
          </p>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
            <span style={{ color: 'rgba(34,197,94,0.7)' }}>{sessions?.summary.completed_sessions ?? 0} completed</span>
            {' / '}
            <span style={{ color: 'rgba(239,68,68,0.7)' }}>{sessions?.summary.abandoned_sessions ?? 0} abandoned</span>
          </p>
        </Card>

        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Avg Duration</p>
          <p className="text-2xl font-bold font-display text-white">
            {formatDuration(sessions?.summary.avg_duration_seconds ?? 0)}
          </p>
          <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>Average time from session start to completion.</p>
        </Card>

        <Card className="card-surface border-0" style={{ padding: '1.25rem' }}>
          <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>Revenue</p>
          <p className="text-2xl font-bold font-display text-white">
            {formatIDR(revenue?.summary.total_revenue ?? 0)}
          </p>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
        </>
      )}
    </div>
  );
}
