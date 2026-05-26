import { describe, it, expect } from 'vitest';
import { timestampValue, mergeDelegationSessions, buildCostSavingsOverviewResult } from './projection-reader-shared.js';

type Row = Record<string, unknown>;

describe('timestampValue', () => {
  it('returns 0 for null/undefined/empty', () => {
    expect(timestampValue(null)).toBe(0);
    expect(timestampValue(undefined)).toBe(0);
    expect(timestampValue('')).toBe(0);
  });

  it('returns epoch ms for unix timestamps (seconds range)', () => {
    expect(timestampValue(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it('returns epoch ms directly for large numeric timestamps', () => {
    expect(timestampValue(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('parses ISO date strings', () => {
    const iso = '2024-01-15T10:00:00.000Z';
    expect(timestampValue(iso)).toBe(Date.parse(iso));
  });
});

describe('mergeDelegationSessions', () => {
  const key = (row: Row, index: number, kind: 'savings' | 'events'): string => {
    const k = String(row.session_id ?? '').trim();
    return k || `${kind}-row-${index}`;
  };

  it('returns savings rows when no event rows overlap', () => {
    const savings: Row[] = [{ session_id: 'a', savings_usd: 1 }];
    const result = mergeDelegationSessions(savings, [], key);
    expect(result).toHaveLength(1);
    expect(result[0].savings_usd).toBe(1);
  });

  it('merges event row fields into existing savings row for same session_id', () => {
    const savings: Row[] = [{ session_id: 'a', savings_usd: 1, prompt_tokens: 0 }];
    const events: Row[] = [{ session_id: 'a', prompt_tokens: 100, created_at: '1700000001000' }];
    const result = mergeDelegationSessions(savings, events, key);
    expect(result).toHaveLength(1);
    expect(result[0].prompt_tokens).toBe(100);
  });

  it('appends event row when no savings row has matching key', () => {
    const savings: Row[] = [{ session_id: 'a', savings_usd: 1 }];
    const events: Row[] = [{ session_id: 'b', prompt_tokens: 50 }];
    const result = mergeDelegationSessions(savings, events, key);
    expect(result).toHaveLength(2);
  });

  it('picks newer created_at on merge', () => {
    const savings: Row[] = [{ session_id: 'a', created_at: '1000' }];
    const events: Row[] = [{ session_id: 'a', created_at: '1700000001000' }];
    const result = mergeDelegationSessions(savings, events, key);
    expect(result[0].created_at).toBe('1700000001000');
  });
});

describe('buildCostSavingsOverviewResult', () => {
  it('returns zero totals with empty sessions', () => {
    const result = buildCostSavingsOverviewResult([], [], 0);
    expect(result.total_cost_usd).toBe(0);
    expect(result.total_savings_usd).toBe(0);
    expect(result.provisioned).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('includes warning when telemetry rows were omitted', () => {
    const result = buildCostSavingsOverviewResult([], [], 3);
    expect((result.warnings as string[]).length).toBe(1);
    expect((result.warnings as string[])[0]).toContain('3 delegation rows');
  });

  it('aggregates by model_id across measured sessions', () => {
    const sessions: Row[] = [
      { session_id: 's1', model_name: 'qwen', prompt_tokens: 100, completion_tokens: 50, cloud_cost_usd: 0.01, savings_usd: 0.005 },
      { session_id: 's2', model_name: 'qwen', prompt_tokens: 200, completion_tokens: 100, cloud_cost_usd: 0.02, savings_usd: 0.01 },
    ];
    const result = buildCostSavingsOverviewResult(sessions, sessions, 0);
    expect((result.rows as Row[]).length).toBe(1);
    const row = (result.rows as Row[])[0] as Record<string, unknown>;
    expect(row.model_id).toBe('qwen');
    expect(row.task_count).toBe(2);
    expect(result.provisioned).toBe(true);
  });

  it('passes recentRuns when provided', () => {
    const recentRuns: Row[] = [{ session_id: 'x', total_tokens: 10 }];
    const result = buildCostSavingsOverviewResult([], [], 0, recentRuns);
    expect(result.recent_runs).toEqual(recentRuns);
    expect(result.measured_run_count).toBe(0);
    expect(result.zero_token_run_count).toBe(0);
  });

  it('omits recent_runs key when not provided', () => {
    const result = buildCostSavingsOverviewResult([], [], 0);
    expect('recent_runs' in result).toBe(false);
  });
});
