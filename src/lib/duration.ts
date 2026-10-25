/**
 * OMN-21166 AC55: one duration formatter for every page; the exact milliseconds stay in the element's title.
 * A missing or malformed duration reads "Not recorded", never "0 s".
 */

/** A served duration in milliseconds: a finite, non-negative number or plain decimal text; anything else is null. */
function servedMs(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value)) n = Number(value);
  else return null;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "999 ms", "12.2 s", "1 min 4 s", "1 h 0 min"; rounding never crosses a unit boundary unannounced. */
export function formatDuration(value: unknown): string {
  const ms = servedMs(value);
  if (ms === null) return 'Not recorded';
  if (Math.round(ms) < 1000) return `${Math.round(ms)} ms`;
  const tenths = Math.round(ms / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`;
  return `${Math.floor(totalSeconds / 3600)} h ${Math.floor((totalSeconds % 3600) / 60)} min`;
}

/** The exact served value for a title attribute ("12,181 ms"), or undefined when there is none. */
export function exactMs(value: unknown): string | undefined {
  const ms = servedMs(value);
  return ms === null ? undefined : `${ms.toLocaleString('en-US')} ms`;
}
