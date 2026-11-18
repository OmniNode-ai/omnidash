// OMN-25104 AC3, OMN-25103 AC2/AC3: a headline figure that is a count of the rows one served projection holds.
// The figure comes from the served rows alone; the card keeps no list or count of its own. A read that failed, or
// served no rows, shows Not measured with the reason, never 0: an unread or empty store is not a measured zero.
import { Figure } from '@/theme/design-system/components';

export type ServedRows = readonly Record<string, unknown>[];

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Done items served by done-items.v1: one row per ticket, so the figure is the row count (null if a row is unkeyed). */
export function doneItemsCount(rows: ServedRows): number | null {
  return rows.every(row => hasText(row.ticket)) ? rows.length : null;
}

export function ServedCountCard({ label, rows, failure, count, emptyCaption = 'The read returned no rows.' }: {
  label: string;
  rows: ServedRows;
  failure: { reason: string } | null;
  count: number | null;
  emptyCaption?: string;
}) {
  const reason = failure
    ? `The read failed: ${failure.reason}.`
    : rows.length === 0
      ? emptyCaption
      : count === null
        ? 'A served row is missing the field the count needs.'
        : null;
  if (reason !== null) {
    return (
      <>
        <Figure measured={false}>Not measured</Figure>
        <p className="local-dashboard-caption" aria-label={`${label}: not measured`}>{reason}</p>
      </>
    );
  }
  return <Figure measured title={`${label}: ${count}`}>{String(count)}</Figure>;
}
