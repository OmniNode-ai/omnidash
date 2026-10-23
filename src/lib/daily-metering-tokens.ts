import { latestAllRow } from '@/pages/local/insight-aggregates';
import { wholeCount } from './dashboard-count';

export interface DailyMeteringTokenRow {
  day: string;
  input: string | null;
  output: string | null;
  unknownTokenRuns: string | null;
  asOf: string | null;
}

export interface DailyMeteringTokenData {
  days: DailyMeteringTokenRow[];
  baseline: string | null;
  reason: string | null;
}

/** Use one served context, with exact values and dates. Never sum across baselines or fill absent days. */
export function dailyMeteringTokens(rows: readonly unknown[]): DailyMeteringTokenData {
  const unavailable = (reason: string): DailyMeteringTokenData => ({ days: [], baseline: null, reason });
  const context = latestAllRow(rows);
  if (context === 'none') return unavailable('Daily metering totals unavailable: no all-time context.');
  if (context === 'ambiguous') return unavailable('Daily metering totals unavailable: ambiguous context.');
  const selected = rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null
    && !Array.isArray(row) && (row as Record<string, unknown>).window_kind === 'day'
    && (row as Record<string, unknown>).baseline_model === context.baseline_model);
  if (selected.length === 0) return unavailable('Daily metering totals unavailable: no served day rows.');
  const dates = new Set<string>();
  const days: DailyMeteringTokenRow[] = [];
  for (const row of selected) {
    const day = row.window_start;
    const time = typeof day === 'string' ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
      || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) {
      return unavailable('Daily metering totals unavailable: invalid date.');
    }
    if (dates.has(day)) return unavailable(`Daily metering totals unavailable: duplicate date ${day}.`);
    dates.add(day);
    const runs = wholeCount(row.runs_total);
    const missing = wholeCount(row.runs_unknown_tokens);
    const allUnknown = runs !== null && missing !== null && runs <= missing;
    days.push({ day,
      input: allUnknown ? null : wholeCount(row.tokens_in)?.toString() ?? null,
      output: allUnknown ? null : wholeCount(row.tokens_out)?.toString() ?? null,
      unknownTokenRuns: missing?.toString() ?? null,
      asOf: typeof row.as_of === 'string' && Number.isFinite(Date.parse(row.as_of)) ? row.as_of : null,
    });
  }
  return { days: days.sort((a, b) => a.day.localeCompare(b.day)),
    baseline: typeof context.baseline_model === 'string' ? context.baseline_model : null, reason: null };
}
