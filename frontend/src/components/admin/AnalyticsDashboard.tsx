import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDuration, formatIDR, formatPercent } from '@/lib/formatters';

interface Props {
  mode?: 'summary' | 'full';
}

export default function AnalyticsDashboard({ mode = 'full' }: Props) {
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['analytics-sessions'],
    queryFn: () => adminApi.getSessionAnalytics().then((r) => r.data),
  });

  const { data: revenue, isLoading: revenueLoading } = useQuery({
    queryKey: ['analytics-revenue'],
    queryFn: () => adminApi.getRevenueAnalytics().then((r) => r.data),
  });

  if (sessionsLoading || revenueLoading) {
    return <p className="text-white/40">Loading analytics...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Analytics</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Session activity and revenue performance for your kiosk.
        </p>
      </div>

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
          {/* Session Timeseries */}
          {sessions && sessions.timeseries.length > 0 && (
            <Card className="card-surface border-0">
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <h3 className="text-lg font-display text-white" style={{ marginBottom: '0.25rem' }}>Session History</h3>
                <p className="text-xs text-white/25" style={{ marginBottom: '1rem' }}>
                  Breakdown of sessions over time. A session counts as abandoned if the user leaves before reaching the reveal stage.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="text-white/35">Period</TableHead>
                      <TableHead className="text-white/35">Sessions</TableHead>
                      <TableHead className="text-white/35">Completed</TableHead>
                      <TableHead className="text-white/35">Abandoned</TableHead>
                      <TableHead className="text-white/35">Avg Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.timeseries.map((point) => (
                      <TableRow key={point.period} className="border-white/[0.04] hover:bg-white/[0.02]">
                        <TableCell className="font-medium text-white/70">{point.period}</TableCell>
                        <TableCell className="text-white/50">{point.sessions}</TableCell>
                        <TableCell className="text-white/50">{point.completed}</TableCell>
                        <TableCell className="text-white/50">{point.abandoned}</TableCell>
                        <TableCell className="text-white/50">{formatDuration(point.avg_duration_seconds)}</TableCell>
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
                      {state}: <span className="font-display tabular-nums ml-1">{count}</span>
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
