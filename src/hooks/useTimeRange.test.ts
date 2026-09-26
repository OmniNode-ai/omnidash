import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTimeRange,
  rangeFromPreset,
  resolveTimeRange,
  TIME_RANGE_PRESETS,
} from './useTimeRange';

describe('time range helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps rows newer than the original preset end as the window rolls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const range = rangeFromPreset(TIME_RANGE_PRESETS[0]);

    vi.advanceTimersByTime(30 * 60 * 1000);
    const rows = [{ created_at: '2026-09-26T10:15:00Z' }];

    expect(applyTimeRange(rows, (row) => row.created_at, resolveTimeRange(range))).toEqual(rows);
  });

  it('uses a matching preset label as a rolling fallback for persisted ranges', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:30:00Z'));

    expect(resolveTimeRange({
      start: '2026-09-26T09:00:00Z',
      end: '2026-09-26T10:00:00Z',
      label: 'Last 1h',
    })).toEqual({
      start: new Date('2026-09-26T09:30:00Z'),
      end: new Date('2026-09-26T10:30:00Z'),
    });
  });

  it('keeps an explicit range fixed and drops rows after its end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const range = {
      start: '2026-09-26T09:00:00Z',
      end: '2026-09-26T10:00:00Z',
    };

    vi.advanceTimersByTime(30 * 60 * 1000);
    const rows = [{ created_at: '2026-09-26T10:15:00Z' }];

    expect(applyTimeRange(rows, (row) => row.created_at, resolveTimeRange(range))).toEqual([]);
    expect(resolveTimeRange(range)?.end).toEqual(new Date('2026-09-26T10:00:00Z'));
  });
});
