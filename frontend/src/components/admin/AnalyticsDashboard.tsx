import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDuration, formatIDR, formatPercent, formatPeriod } from '@/lib/formatters';

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  payment: 'Payment',
  capture: 'Capture',
  review: 'Review',
  processing: 'Processing',
  reveal: 'Reveal',
  reset: 'Reset',
};

const MAX_TABLE_ROWS = 14;

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

  if (sessionsLoading || revenueLoading) {
    return <p className="text-white/40">Loading analytics...</p>;
  }

  const hasData = (sessions?.summary.total_sessions ?? 0) > 0;
  const sessionRows = sessions?.timeseries ?? [];
  const displayRows = sessionRows.slice(-MAX_TABLE_ROWS);
  const revenueRows = revenue?.timeseries ?? [];
  const displayRevenueRows = revenueRows.slice(-MAX_TABLE_ROWS);

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
        {[
          {
            title: 'Total Sessions',
            value: sessions?.summary.total_sessions ?? 0,
            raw: true,
            description: 'All photo sessions started, including abandoned ones.',
          },
          {
            title: 'Completion Rate',
            value: formatPercent(sessions?.summary.completion_rate ?? 0),
            raw: false,
            description: 'Sessions that reached the reveal/print stage.',
          },
          {
            title: 'Avg Duration',
            value: formatDuration(sessions?.summary.avg_duration_seconds ?? 0),
            raw: false,
            description: 'Average time from session start to completion.',
          },
          {
            title: 'Revenue',
            value: formatIDR(revenue?.summary.total_revenue ?? 0),
            raw: false,
            description: 'Total confirmed payments received.',
          },
        ].map((card) => (
          <Card key={card.title} className="card-surface border-0" style={{ padding: '1.25rem' }}>
            <p className="text-sm font-medium text-white/40" style={{ marginBottom: '0.75rem' }}>{card.title}</p>
            <p className={`text-2xl font-bold font-display text-white ${card.raw ? 'tabular-nums' : ''}`}>
              {card.value}
            </p>
            <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>{card.description}</p>
          </Card>
        ))}
      </div>

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

          {/* Session History */}
          {displayRows.length > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Session History</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1rem' }}>
                  Breakdown of sessions over time. A session counts as abandoned if the user leaves before reaching the reveal stage.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="text-white/35">Date</TableHead>
                      <TableHead className="text-white/35 text-right">Sessions</TableHead>
                      <TableHead className="text-white/35 text-right">Completed</TableHead>
                      <TableHead className="text-white/35 text-right">Abandoned</TableHead>
                      <TableHead className="text-white/35 text-right">Avg Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.map((point) => (
                      <TableRow key={point.period} className="border-white/[0.04] hover:bg-white/[0.02]">
                        <TableCell className="font-medium text-white/70">{formatPeriod(point.period)}</TableCell>
                        <TableCell className="text-white/50 text-right tabular-nums">{point.sessions}</TableCell>
                        <TableCell className="text-white/50 text-right tabular-nums">{point.completed}</TableCell>
                        <TableCell className="text-white/50 text-right tabular-nums">{point.abandoned}</TableCell>
                        <TableCell className="text-white/50 text-right">{formatDuration(point.avg_duration_seconds)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {sessionRows.length > MAX_TABLE_ROWS && (
                  <p className="text-xs text-white/20" style={{ marginTop: '0.75rem' }}>
                    Showing last {MAX_TABLE_ROWS} of {sessionRows.length} periods.
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Revenue History */}
          {displayRevenueRows.length > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Revenue History</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1rem' }}>
                  Confirmed payment transactions over time. Only completed payments are counted.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="text-white/35">Date</TableHead>
                      <TableHead className="text-white/35 text-right">Revenue</TableHead>
                      <TableHead className="text-white/35 text-right">Transactions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRevenueRows.map((point) => (
                      <TableRow key={point.period} className="border-white/[0.04] hover:bg-white/[0.02]">
                        <TableCell className="font-medium text-white/70">{formatPeriod(point.period)}</TableCell>
                        <TableCell className="text-white/50 text-right tabular-nums">{formatIDR(point.revenue)}</TableCell>
                        <TableCell className="text-white/50 text-right tabular-nums">{point.transactions}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
