// Shared helpers for consuming the dashboard-level `globalFilters.timeRange`.
// Widgets that participate (have capabilities.supports_time_range === true)
// should:
//   1. Read the range from the store: useFrameStore(s => s.globalFilters.timeRange)
//   2. Resolve it to Date objects with resolveTimeRange()
//   3. Filter their data with applyTimeRange() or an equivalent predicate
// The helpers live here (rather than on each widget) so the semantics are
// centralized and the selector + filter stay in sync.

import type { TimeRange } from '@/store/types';

export interface ResolvedRange {
  start: Date;
  end: Date;
}

/** Turns the store's string ISO range into Date objects. null = no filter. */
export function resolveTimeRange(range: TimeRange | undefined): ResolvedRange | null {
  if (!range) return null;
  const start = new Date(range.start);
  const end = new Date(range.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/**
 * Filter a list of records whose timestamps live on a single string-valued
 * field. `getTimestamp` pulls the field; items with unparseable values are
 * dropped. When `range` is null, returns `items` unchanged.
 */
export function applyTimeRange<T>(
  items: T[] | undefined,
  getTimestamp: (item: T) => string,
  range: ResolvedRange | null,
): T[] {
  if (!items) return [];
  if (!range) return items;
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return items.filter((item) => {
    const raw = getTimestamp(item);
    if (!raw) return false;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) return false;
    return t >= startMs && t <= endMs;
  });
}

// ---------- Preset helpers ----------

export interface TimeRangePreset {
  /** Short label shown in the selector, e.g. "Last 24h". */
  label: string;
  /** Window width in milliseconds. */
  ms: number;
}

export const TIME_RANGE_PRESETS: TimeRangePreset[] = [
  { label: 'Last 1h', ms: 60 * 60 * 1000 },
  { label: 'Last 6h', ms: 6 * 60 * 60 * 1000 },
  { label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

/** Turn a preset into a concrete range pinned to now. */
export function rangeFromPreset(preset: TimeRangePreset): TimeRange {
  const now = Date.now();
  return {
    start: new Date(now - preset.ms).toISOString(),
    end: new Date(now).toISOString(),
    label: preset.label,
  };
}

/** The default preset selected on first dashboard load. */
export const DEFAULT_TIME_RANGE_PRESET: TimeRangePreset = TIME_RANGE_PRESETS[2]; // Last 24h
