import { describe, it, expect } from 'vitest';
import { aggregateAbCompareByModel } from './ab-compare-aggregate';
import type { AbCompareRow } from '@/services/event-dash-api';

function row(p: Partial<AbCompareRow>): AbCompareRow {
  return {
    correlation_id: p.correlation_id ?? 'corr',
    model_id: p.model_id ?? 'qwen3-coder-30b',
    prompt_tokens: p.prompt_tokens ?? 0,
    completion_tokens: p.completion_tokens ?? 0,
    total_tokens: p.total_tokens ?? 0,
    estimated_cost_usd: p.estimated_cost_usd ?? null,
    latency_ms: p.latency_ms ?? null,
    usage_source: p.usage_source ?? null,
    created_at: p.created_at ?? '2026-06-11T00:00:00Z',
    task_description: p.task_description,
  };
}

describe('aggregateAbCompareByModel', () => {
  it('rolls up per-call rows into one entry per model with run counts', () => {
    const rows = [
      row({ model_id: 'Qwen3.6-35B-A3B', correlation_id: 'c1' }),
      row({ model_id: 'Qwen3.6-35B-A3B', correlation_id: 'c2' }),
      row({ model_id: 'gemini-2.5-flash', correlation_id: 'c3' }),
    ];
    const out = aggregateAbCompareByModel(rows);
    expect(out).toHaveLength(2);
    const qwen = out.find((m) => m.modelId === 'Qwen3.6-35B-A3B');
    const gemini = out.find((m) => m.modelId === 'gemini-2.5-flash');
    expect(qwen?.runs).toBe(2);
    expect(gemini?.runs).toBe(1);
  });

  it('does NOT collapse the ~100 raw exp0 rows into ~100 entries', () => {
    // The live defect: 100 per-call rows for 2 models rendered 100 list items.
    const rows: AbCompareRow[] = [];
    for (let i = 0; i < 98; i++) {
      rows.push(row({ model_id: 'Qwen3.6-35B-A3B', correlation_id: `q-${i}`, latency_ms: 800 + i }));
    }
    rows.push(row({ model_id: 'gemini-2.5-flash', correlation_id: 'g-0', latency_ms: 1200 }));
    rows.push(row({ model_id: '', correlation_id: 'empty-0', latency_ms: 500 }));
    const out = aggregateAbCompareByModel(rows);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out.find((m) => m.modelId === 'Qwen3.6-35B-A3B')?.runs).toBe(98);
  });

  it('aggregates latency where present (averages observed latencies)', () => {
    const rows = [
      row({ model_id: 'm1', correlation_id: 'a', latency_ms: 1000 }),
      row({ model_id: 'm1', correlation_id: 'b', latency_ms: 2000 }),
    ];
    const out = aggregateAbCompareByModel(rows);
    expect(out[0].avgLatencyMs).toBe(1500);
  });

  it('treats usage_source=MISSING as absent usage — no measured tokens/cost', () => {
    const rows = [
      row({ model_id: 'm1', correlation_id: 'a', prompt_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, usage_source: 'MISSING' }),
      row({ model_id: 'm1', correlation_id: 'b', prompt_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, usage_source: 'MISSING' }),
    ];
    const out = aggregateAbCompareByModel(rows);
    expect(out[0].hasUsage).toBe(false);
    // Absent — NEVER 0 masquerading as measured.
    expect(out[0].totalTokens).toBeNull();
    expect(out[0].totalCostUsd).toBeNull();
    expect(out[0].avgTokens).toBeNull();
  });

  it('aggregates tokens/cost only from rows with real usage; mixed usage_source', () => {
    const rows = [
      row({ model_id: 'm1', correlation_id: 'a', prompt_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, usage_source: 'MISSING' }),
      row({ model_id: 'm1', correlation_id: 'b', prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, estimated_cost_usd: 0.002, usage_source: 'router' }),
      row({ model_id: 'm1', correlation_id: 'c', prompt_tokens: 200, completion_tokens: 50, total_tokens: 250, estimated_cost_usd: 0.004, usage_source: 'gateway' }),
    ];
    const out = aggregateAbCompareByModel(rows);
    expect(out[0].runs).toBe(3);
    expect(out[0].hasUsage).toBe(true);
    // Only the two real-usage rows contribute.
    expect(out[0].totalTokens).toBe(400);
    expect(out[0].avgTokens).toBe(200);
    expect(out[0].totalCostUsd).toBeCloseTo(0.006, 6);
  });

  it('labels a blank model_id honestly rather than dropping it', () => {
    const out = aggregateAbCompareByModel([row({ model_id: '', correlation_id: 'a' })]);
    expect(out).toHaveLength(1);
    expect(out[0].modelId).toBe('');
    expect(out[0].label).toBe('unknown model');
  });

  it('sorts models by run count descending so the busiest model is first', () => {
    const rows = [
      row({ model_id: 'rare', correlation_id: 'a' }),
      row({ model_id: 'busy', correlation_id: 'b' }),
      row({ model_id: 'busy', correlation_id: 'c' }),
      row({ model_id: 'busy', correlation_id: 'd' }),
    ];
    const out = aggregateAbCompareByModel(rows);
    expect(out.map((m) => m.modelId)).toEqual(['busy', 'rare']);
  });

  it('returns an empty list for no rows', () => {
    expect(aggregateAbCompareByModel([])).toEqual([]);
  });

  it('reports no latency aggregate when every row lacks latency', () => {
    const out = aggregateAbCompareByModel([row({ model_id: 'm1', correlation_id: 'a', latency_ms: null })]);
    expect(out[0].avgLatencyMs).toBeNull();
  });
});
