import { describe, it, expect } from 'vitest';
import {
  timestampValue,
  sessionKey,
  mergeDelegationSessions,
  buildCostSavingsOverview,
  sessionTokens,
  type Row,
} from './projection-utils.js';

describe('timestampValue', () => {
  it('returns 0 for null-like values', () => {
    expect(timestampValue(null)).toBe(0);
    expect(timestampValue(undefined)).toBe(0);
    expect(timestampValue('')).toBe(0);
  });

  it('converts unix-second timestamps to milliseconds', () => {
    expect(timestampValue('1000000000')).toBe(1_000_000_000_000);
  });

  it('passes unix-millisecond timestamps through', () => {
    expect(timestampValue('1700000000000')).toBe(1_700_000_000_000);
  });

  it('parses ISO strings', () => {
    const ts = timestampValue('2026-05-20T12:00:00.000Z');
    expect(ts).toBeGreaterThan(0);
    expect(new Date(ts).getFullYear()).toBe(2026);
  });

  it('returns 0 for unparseable strings', () => {
    expect(timestampValue('not-a-date')).toBe(0);
  });
});

describe('sessionKey', () => {
  it('uses session_id when present', () => {
    const row: Row = { session_id: 'sess-abc', created_at: '1000', model_name: 'qwen3' };
    expect(sessionKey(row, 0, 'src')).toBe('sess-abc');
  });

  it('falls back to composite key when session_id is absent', () => {
    const row: Row = { created_at: '1000', model_name: 'qwen3' };
    const key = sessionKey(row, 3, 'my-source');
    expect(key).toBe('my-source-row-3-1000-qwen3');
  });

  it('falls back when session_id is empty string', () => {
    const row: Row = { session_id: '', created_at: '2000', model_name: 'local' };
    const key = sessionKey(row, 0, 'src');
    expect(key).toBe('src-row-0-2000-local');
  });
});

describe('mergeDelegationSessions', () => {
  it('produces union when there is no overlap', () => {
    const savings: Row[] = [{ session_id: 'sess-a', savings_usd: 0.01 }];
    const events: Row[] = [{ session_id: 'sess-b', prompt_tokens: 100 }];
    const result = mergeDelegationSessions(savings, events, 'savings', 'events');
    expect(result).toHaveLength(2);
  });

  it('merges token fields from event row when sessions overlap', () => {
    const savings: Row[] = [{ session_id: 'sess-1', savings_usd: 0.01, prompt_tokens: 0 }];
    const events: Row[] = [{ session_id: 'sess-1', prompt_tokens: 144, completion_tokens: 593 }];
    const [merged] = mergeDelegationSessions(savings, events, 'savings', 'events');
    expect(merged.prompt_tokens).toBe(144);
    expect(merged.completion_tokens).toBe(593);
    expect(merged.savings_usd).toBe(0.01);
  });

  it('picks the newer created_at when sessions overlap', () => {
    const savings: Row[] = [{ session_id: 's', created_at: '2026-05-20T10:00:00.000Z' }];
    const events: Row[] = [{ session_id: 's', created_at: '2026-05-20T12:00:00.000Z', prompt_tokens: 1 }];
    const [merged] = mergeDelegationSessions(savings, events, 'savings', 'events');
    expect(merged.created_at).toBe('2026-05-20T12:00:00.000Z');
  });
});

describe('sessionTokens', () => {
  it('sums prompt and completion tokens', () => {
    const row: Row = { prompt_tokens: 100, completion_tokens: 50 };
    expect(sessionTokens(row)).toBe(150);
  });

  it('returns 0 for missing token fields', () => {
    expect(sessionTokens({})).toBe(0);
  });
});

describe('buildCostSavingsOverview', () => {
  it('returns provisioned:false for empty sessions', () => {
    const result = buildCostSavingsOverview([]);
    expect(result.provisioned).toBe(false);
    expect(result.total_savings_usd).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('omits zero-token sessions and records them in warnings', () => {
    const sessions: Row[] = [
      { session_id: 'a', prompt_tokens: 0, completion_tokens: 0, savings_usd: 0.01 },
      { session_id: 'b', prompt_tokens: 100, completion_tokens: 50, savings_usd: 0.02,
        model_name: 'qwen3', cloud_cost_usd: 0.02 },
    ];
    const result = buildCostSavingsOverview(sessions);
    expect(result.measured_run_count).toBe(1);
    expect(result.zero_token_run_count).toBe(1);
    expect((result.warnings as string[])[0]).toContain('Omitted 1 delegation row');
    expect(result.provisioned).toBe(true);
  });

  it('groups sessions by model and computes savings correctly', () => {
    const sessions: Row[] = [
      { session_id: 'x', prompt_tokens: 100, completion_tokens: 50,
        model_name: 'qwen3', cloud_cost_usd: 0.01, savings_usd: 0.01 },
      { session_id: 'y', prompt_tokens: 200, completion_tokens: 80,
        model_name: 'qwen3', cloud_cost_usd: 0.02, savings_usd: 0.02 },
    ];
    const result = buildCostSavingsOverview(sessions);
    expect(result.measured_run_count).toBe(2);
    const rows = result.rows as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ display_name: 'qwen3', task_count: 2 });
    expect(Number(result.total_savings_usd)).toBeCloseTo(0.03, 5);
  });

  it('includes tokens_to_compliance in envelope when any session has it', () => {
    const sessions: Row[] = [
      { session_id: 'z', prompt_tokens: 100, completion_tokens: 50,
        model_name: 'qwen3', cloud_cost_usd: 0.01, savings_usd: 0.01,
        tokens_to_compliance: 737 },
    ];
    const result = buildCostSavingsOverview(sessions);
    expect(result.tokens_to_compliance).toBe(737);
  });
});
