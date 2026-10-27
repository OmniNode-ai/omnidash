// OMN-21166 part 14 (AC75, AC76): sort the Runs list by time, duration or cost, and export exactly the rows the search
// and filters show. Both read the served rows only; nothing here adds, rounds or fills a value.

type Row = Record<string, unknown>;
export type RunSortKey = 'created' | 'duration' | 'cost';
export type RunSortDirection = 'asc' | 'desc';

/** A served value as a number, or null when it was not recorded (null, blank or not a finite number). */
function recordedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordedTime(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The rows in the chosen order. A run with no recorded value for the column is last in both directions, and runs that
 * tie keep the order they came in. Cost is the run's session cost when served, else its own cost_usd: the same value
 * the Local cost column shows.
 */
export function sortRuns<T extends Row>(rows: readonly T[], key: RunSortKey, direction: RunSortDirection,
  sessionFor: (runId: string) => Row | undefined): T[] {
  const valueOf = (run: T): number | null => {
    if (key === 'created') return recordedTime(run.created_at);
    if (key === 'duration') return recordedNumber(run.latency_ms);
    const session = sessionFor(String(run.correlation_id));
    const sessionCost = recordedNumber(session?.local_cost_usd);
    return sessionCost ?? recordedNumber(run.cost_usd);
  };
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((run, index) => ({ run, index, value: valueOf(run) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1;
      return a.value === b.value ? a.index - b.index : (a.value - b.value) * sign;
    })
    .map(entry => entry.run);
}

/** The served rows as JSON, values and nulls exactly as served. */
export function runsToJson(rows: readonly Row[]): string {
  return JSON.stringify(rows, null, 2);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The served rows as CSV: one column per served field, in the order first seen; a missing value is an empty cell. */
export function runsToCsv(rows: readonly Row[]): string {
  if (rows.length === 0) return '';
  const fields: string[] = [];
  for (const row of rows) for (const field of Object.keys(row)) if (!fields.includes(field)) fields.push(field);
  return [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\r\n');
}
