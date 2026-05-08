import type { ExportDataBundle } from './types';
import { formatPercent, formatDuration } from '@/lib/formatters';

const CRLF = '\r\n';

function csvVal(v: string | number | undefined): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: (string | number | undefined)[]): string {
  return cells.map(csvVal).join(',');
}

function delta(current: number | undefined, previous: number | undefined): string {
  if (current == null || previous == null || previous === 0) return 'N/A';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function generateAnalyticsCsv(data: ExportDataBundle): string {
  const lines: string[] = [];
  const { sessions, revenue, features, peakHours, dropoff, printStats } = data;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Header
  lines.push('VibePrint OS Analytics Report');
  lines.push(`Date Range: ${data.startDate} to ${data.endDate} (${data.rangeLabel})`);
  lines.push(`Generated: ${now}`);
  lines.push('');

  // Summary metrics
  lines.push('--- SUMMARY METRICS ---');
  lines.push(row('Metric', 'Value', 'Previous Period', 'Change'));
  const s = sessions?.summary;
  const ps = sessions?.previous_summary;
  const r = revenue?.summary;
  const pr = revenue?.previous_summary;
  lines.push(row('Total Sessions', s?.total_sessions, ps?.total_sessions, delta(s?.total_sessions, ps?.total_sessions)));
  lines.push(row('Completed Sessions', s?.completed_sessions, ps?.completed_sessions, delta(s?.completed_sessions, ps?.completed_sessions)));
  lines.push(row('Abandoned Sessions', s?.abandoned_sessions, ps?.abandoned_sessions, delta(s?.abandoned_sessions, ps?.abandoned_sessions)));
  lines.push(row('Completion Rate', s ? formatPercent(s.completion_rate) : undefined, ps ? formatPercent(ps.completion_rate) : undefined, delta(s?.completion_rate, ps?.completion_rate)));
  lines.push(row('Avg Duration', s ? formatDuration(s.avg_duration_seconds) : undefined, ps ? formatDuration(ps.avg_duration_seconds) : undefined, delta(s?.avg_duration_seconds, ps?.avg_duration_seconds)));
  lines.push(row('Total Revenue (IDR)', r?.total_revenue, pr?.total_revenue, delta(r?.total_revenue, pr?.total_revenue)));
  lines.push(row('Avg Transaction Amount (IDR)', r?.avg_transaction_amount, pr?.avg_transaction_amount, delta(r?.avg_transaction_amount, pr?.avg_transaction_amount)));
  lines.push(row('Payment Revenue (IDR)', r?.payment_revenue));
  lines.push(row('Access Code Revenue (IDR)', r?.access_code_revenue));
  lines.push(row('Total Transactions', r?.total_transactions));
  lines.push('');

  // Session timeseries
  if (sessions?.timeseries?.length) {
    lines.push('--- SESSION TIMESERIES ---');
    lines.push(row('Period', 'Sessions', 'Completed', 'Abandoned', 'Avg Duration (s)'));
    for (const t of sessions.timeseries) {
      lines.push(row(t.period, t.sessions, t.completed, t.abandoned, t.avg_duration_seconds));
    }
    lines.push('');
  }

  // Revenue timeseries
  if (revenue?.timeseries?.length) {
    lines.push('--- REVENUE TIMESERIES ---');
    lines.push(row('Period', 'Revenue (IDR)', 'Transactions', 'Payment Revenue (IDR)', 'Access Code Revenue (IDR)'));
    for (const t of revenue.timeseries) {
      lines.push(row(t.period, t.revenue, t.transactions, t.payment_revenue, t.access_code_revenue));
    }
    lines.push('');
  }

  // Feature breakdown
  if (features?.features?.length) {
    lines.push('--- FEATURE BREAKDOWN ---');
    lines.push(row('Feature', 'Sessions', 'Completed', 'Abandoned', 'Completion Rate', 'Avg Duration (s)', 'Revenue (IDR)', 'Paid Sessions', 'Payment Revenue (IDR)', 'Access Code Revenue (IDR)'));
    for (const f of features.features) {
      lines.push(row(
        f.feature,
        f.total_sessions,
        f.completed_sessions,
        f.abandoned_sessions,
        formatPercent(f.completion_rate),
        f.avg_duration_seconds,
        f.revenue,
        f.paid_sessions,
        f.payment_revenue,
        f.access_code_revenue,
      ));
    }
    lines.push('');
  }

  // Peak hours
  if (peakHours?.slots?.length) {
    lines.push('--- PEAK HOURS ---');
    lines.push(row('Day', 'Hour', 'Sessions', 'Vibe Check', 'Photobooth', 'Revenue (IDR)'));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sorted = [...peakHours.slots].sort((a, b) => a.day_of_week - b.day_of_week || a.hour - b.hour);
    for (const slot of sorted) {
      lines.push(row(dayNames[slot.day_of_week] ?? slot.day_of_week, `${slot.hour}:00`, slot.sessions, slot.vibe_check_sessions, slot.photobooth_sessions, slot.revenue));
    }
    lines.push('');
  }

  // Dropoff funnel
  if (dropoff?.stages?.length) {
    lines.push('--- DROPOFF FUNNEL ---');
    lines.push(row('State', 'Count', 'Percentage'));
    for (const stage of dropoff.stages) {
      lines.push(row(stage.state, stage.count, formatPercent(stage.percentage)));
    }
    lines.push('');
  }

  // Print reliability
  if (printStats) {
    lines.push('--- PRINT RELIABILITY ---');
    lines.push(row('Metric', 'Value'));
    lines.push(row('Total Prints', printStats.total_prints));
    lines.push(row('Successful', printStats.successful));
    lines.push(row('Failed', printStats.failed));
    lines.push(row('Success Rate', formatPercent(printStats.success_rate)));
    lines.push('');
  }

  return lines.join(CRLF);
}
