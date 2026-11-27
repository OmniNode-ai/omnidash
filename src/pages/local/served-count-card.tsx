// OMN-25104 AC3, OMN-25103 AC2/AC3: a headline figure that is a count of the rows one served projection holds.
// The figure comes from the served rows alone; the card keeps no list or count of its own. A read that failed, or
// served no rows, shows Not measured with the reason, never 0: an unread or empty store is not a measured zero.
import { Figure } from '@/theme/design-system/components';

export type ServedRows = readonly Record<string, unknown>[];

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Done items served by done-items.v1: one row per ticket, so the figure is the row count (null if none or a row is unkeyed). */
export function doneItemsCount(rows: ServedRows): number | null {
  return rows.length > 0 && rows.every(row => hasText(row.ticket)) ? rows.length : null;
}

/**
 * Changes running, from floor-integration-rows.v1: one row per merged change, so the figure is the number of rows
 * whose state is running (null if none were served or a row has no state). Served rows with none running are a measured 0.
 */
export function runningRowsCount(rows: ServedRows): number | null {
  return rows.length > 0 && rows.every(row => hasText(row.state)) ? rows.filter(row => row.state === 'running').length : null;
}

export function ServedCountCard({ label, rows, failure, count, emptyCaption = 'The read returned no rows.', truncated = false }: {
  label: string;
  rows: ServedRows;
  failure: { reason: string } | null;
  count: number | null;
  emptyCaption?: string;
  /** The exposure said this read is one page of a longer list: a count of its rows would be short, so none is shown. */
  truncated?: boolean;
}) {
  const reason = failure
    ? `The read failed: ${failure.reason.replace(/\.+$/, '')}.`
    : truncated
      ? 'The read returned one page of a longer list, so a count of it would be short.'
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
