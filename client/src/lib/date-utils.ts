/**
 * Date Utility Functions
 *
 * Shared date formatting utilities for consistent display across the application.
 */

export interface FormatRelativeTimeOptions {
  /**
   * When true, uses short suffixes ("5s ago", "2m ago", "3h ago", "2d ago").
   * When false (default), uses verbose format ("5 seconds ago", "2 minutes ago").
   */
  compact?: boolean;
}

/**
 * Formats a timestamp as a relative time string.
 *
 * Verbose (default): "just now", "5 seconds ago", "2 minutes ago", "3 hours ago", "1 day ago"
 * Compact:           "just now", "5s ago", "2 min ago", "3h ago", "2d ago"
 *
 * In compact mode, timestamps older than 1 hour fall back to an absolute HH:MM:SS string.
 *
 * @param timestamp - Date object or ISO string to format
 * @param options   - Formatting options
 * @returns Human-readable relative time string
 *
 * @example
 * ```ts
 * formatRelativeTime(new Date(Date.now() - 5000));                  // "just now"
 * formatRelativeTime('2024-01-15T10:30:00Z');                       // "5 minutes ago"
 * formatRelativeTime(new Date(Date.now() - 86400000));              // "1 day ago"
 * formatRelativeTime(new Date(Date.now() - 30000), { compact: true }); // "30s ago"
 * ```
 */
export function formatRelativeTime(
  timestamp: string | Date,
  options?: FormatRelativeTimeOptions
): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  // Validate the date to prevent NaN output
  if (isNaN(date.getTime())) {
    return 'unknown';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  const compact = options?.compact ?? false;

  if (diffSeconds < 10) {
    return 'just now';
  }

  if (compact) {
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    // Older than 1 hour in compact mode — show absolute time
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  // Verbose (default)
  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}
