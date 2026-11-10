/**
 * OMN-23330 AC9, AC10, AC19: a share and a UTC day, formatted once for every page.
 */

/** A served share (a fraction, 0.25 = 25%) to one decimal. A nonzero share under 0.05% reads "<0.1%", never a rounded
 * "0.0%" that hides it (live 2026-11-10: a model with 1 of 2,893 calls read 0.0% on Runs); zero stays "0.0%" and a share
 * that is not served reads "Not recorded", never 0. */
export function formatShare(value: unknown): string {
  const share = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(share)) return 'Not recorded';
  const text = (share * 100).toFixed(1);
  if (share > 0 && Number(text) === 0) return '<0.1%';
  // A share short of the whole never reads as all of it (OMN-21166 TierMix rule, kept here for every share).
  if (share < 1 && text === '100.0') return '>99.9%';
  return `${text}%`;
}

/** A UTC calendar day ("2026-11-10") as the pages write a day: "Nov 10". */
export function formatShortDay(day: string): string {
  // A served day that is not a calendar date reads as served, never as "Invalid Date".
  if (!/^\d{4}-\d{2}-\d{2}/.test(day)) return day;
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
