/**
 * Date Utility Functions
 *
 * Shared date formatting utilities for consistent display across the application.
 */

/**
 * Formats a timestamp as a relative time string (e.g., "5 minutes ago", "2 days ago")
 *
 * @param timestamp - Date object or ISO string to format
 * @returns Human-readable relative time string
 *
 * @example
 * ```ts
 * formatRelativeTime(new Date(Date.now() - 5000)); // "just now"
 * formatRelativeTime('2024-01-15T10:30:00Z'); // "5 minutes ago"
 * formatRelativeTime(new Date(Date.now() - 86400000)); // "1 day ago"
 * ```
 */
export function formatRelativeTime(timestamp: string | Date): string {
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

  if (diffSeconds < 10) {
    return 'just now';
  }
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
