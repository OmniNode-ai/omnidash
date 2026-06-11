import { describe, it, expect } from 'vitest';
import { aggregateByArm, buildSegmentModelMatrix } from './context-roi-experiment';
import type { ContextExperimentScoreRow } from '@/services/event-dash-api';

function row(p: Partial<ContextExperimentScoreRow>): ContextExperimentScoreRow {
  return {
    id: p.id ?? 'id',
    run_id: p.run_id ?? 'run-1',
    correlation_id: p.correlation_id ?? 'corr',
    task_id: p.task_id ?? 'task-A',
    run_order: p.run_order ?? 0,
    context_factor_subset: p.context_factor_subset ?? 'off',
    context_pack_hash: p.context_pack_hash ?? '',
    attempt_count: p.attempt_count ?? 1,
    first_pass_success: p.first_pass_success ?? false,
    final_success: p.final_success ?? false,
    failure_stage: p.failure_stage ?? 'none',
    prompt_tokens: p.prompt_tokens ?? 0,
    completion_tokens: p.completion_tokens ?? 0,
    tokens_used: p.tokens_used ?? 0,
    estimated_cost: p.estimated_cost ?? 0,
    model_id: p.model_id ?? 'qwen3-coder-30b',
    provider: p.provider ?? 'local',
    endpoint_ref: p.endpoint_ref ?? 'local-coder',
    proof_class: p.proof_class ?? 'runtime-observed-only',
    created_at: p.created_at ?? '2026-06-11T00:00:00Z',
    updated_at: p.updated_at ?? '2026-06-11T00:00:00Z',
  };
}

describe('aggregateByArm', () => {
  it('rolls up trials / first-pass / final-success / tokens per arm', () => {
    const rows = [
      row({ context_factor_subset: 'off', first_pass_success: false, final_success: false, tokens_used: 100 }),
      row({ context_factor_subset: 'off', first_pass_success: false, final_success: true, tokens_used: 200 }),
      row({ context_factor_subset: 'golden_exemplar', first_pass_success: true, final_success: true, tokens_used: 150 }),
    ];
    const arms = aggregateByArm(rows);
    const off = arms.find((a) => a.subset === 'off');
    const golden = arms.find((a) => a.subset === 'golden_exemplar');
    expect(off).toMatchObject({ trials: 2, firstPass: 0, finalSuccess: 1, tokens: 300 });
    expect(golden).toMatchObject({ trials: 1, firstPass: 1, finalSuccess: 1, tokens: 150 });
  });

  it("sorts the 'off' baseline first, then arms by first-pass rate descending", () => {
    const rows = [
      row({ context_factor_subset: 'low', first_pass_success: false }),
      row({ context_factor_subset: 'high', first_pass_success: true }),
      row({ context_factor_subset: 'off', first_pass_success: true }),
    ];
    const arms = aggregateByArm(rows);
    expect(arms.map((a) => a.subset)).toEqual(['off', 'high', 'low']);
  });

  it('returns an empty list for no rows', () => {
    expect(aggregateByArm([])).toEqual([]);
  });
});

describe('buildSegmentModelMatrix', () => {
  it('builds a segment × model final-success pass-rate matrix', () => {
    const rows = [
      row({ context_factor_subset: 'off', model_id: 'm1', final_success: false }),
      row({ context_factor_subset: 'off', model_id: 'm1', final_success: true }),
      row({ context_factor_subset: 'golden', model_id: 'm1', final_success: true }),
      row({ context_factor_subset: 'golden', model_id: 'm2', final_success: false }),
    ];
    const matrix = buildSegmentModelMatrix(rows);
    expect(matrix.segments).toEqual(['off', 'golden']);
    expect(matrix.models).toEqual(['m1', 'm2']);
    expect(matrix.cell('off', 'm1')).toBe(0.5);
    expect(matrix.cell('golden', 'm1')).toBe(1);
    expect(matrix.cell('golden', 'm2')).toBe(0);
  });

  it('returns null for a cell with no trials', () => {
    const matrix = buildSegmentModelMatrix([
      row({ context_factor_subset: 'off', model_id: 'm1', final_success: true }),
    ]);
    expect(matrix.cell('off', 'm2')).toBeNull();
    expect(matrix.cell('missing', 'm1')).toBeNull();
  });

  it('preserves first-seen insertion order on both axes', () => {
    const matrix = buildSegmentModelMatrix([
      row({ context_factor_subset: 'b', model_id: 'z' }),
      row({ context_factor_subset: 'a', model_id: 'y' }),
    ]);
    expect(matrix.segments).toEqual(['b', 'a']);
    expect(matrix.models).toEqual(['z', 'y']);
  });
});
