import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    return <p className="text-muted-foreground">Loading analytics...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics</h2>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sessions?.summary.total_sessions ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatPercent(sessions?.summary.completion_rate ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatDuration(sessions?.summary.avg_duration_seconds ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatIDR(revenue?.summary.total_revenue ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {mode === 'full' && (
        <>
          {/* Session Timeseries */}
          {sessions && sessions.timeseries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Sessions</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Abandoned</TableHead>
                      <TableHead>Avg Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.timeseries.map((point) => (
                      <TableRow key={point.period}>
                        <TableCell>{point.period}</TableCell>
                        <TableCell>{point.sessions}</TableCell>
                        <TableCell>{point.completed}</TableCell>
                        <TableCell>{point.abandoned}</TableCell>
                        <TableCell>{formatDuration(point.avg_duration_seconds)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* State Distribution */}
          {sessions && Object.keys(sessions.state_distribution).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">State Distribution</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {Object.entries(sessions.state_distribution).map(([state, count]) => (
                  <Badge key={state} variant="secondary">
                    {state}: {count}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
