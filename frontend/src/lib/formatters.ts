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
