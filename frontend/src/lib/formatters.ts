/**
 * Display formatters.
 * currency, date, duration.
 */

/** Format duration in seconds to human-readable string. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

/** Format IDR currency amount. */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Format ISO date string to locale string. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Format ISO date string to time-only string. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

/** Format percentage (0-1 range to display string). */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Format bytes to human readable. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Format an analytics period string for display. */
export function formatPeriod(period: string): string {
  // Daily: "2026-04-14" → "Apr 14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const d = new Date(period + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // Weekly: "2026-W15" → "Apr 7 – Apr 13"
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    // Calculate the Monday of that ISO week
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7; // Mon=1..Sun=7
    const monday = new Date(year, 0, 4 - dayOfWeek + (week - 1) * 7 + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(monday)} – ${fmt(sunday)}`;
  }
  // Monthly: "2026-04" → "Apr 2026"
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const d = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return period;
}
