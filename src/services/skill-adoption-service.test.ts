import { describe, it, expect } from 'vitest';
import {
  aggregateSkillAdoption,
  receiptCoverage,
  type SkillExecutionRow,
} from './skill-adoption-service';

function makeRow(overrides: Partial<SkillExecutionRow> = {}): SkillExecutionRow {
  return {
    event_id: crypto.randomUUID(),
    run_id: 'run-001',
    event_type: 'started',
    skill_name: 'pr-review',
    repo_id: 'omniclaude',
    correlation_id: 'corr-001',
    emitted_at: '2026-06-30T12:00:00+00:00',
    ...overrides,
  };
}

describe('receiptCoverage', () => {
  it('returns 0 when there are no started events (divide-by-zero guard)', () => {
    expect(receiptCoverage(0, 0)).toBe(0);
    expect(receiptCoverage(0, 3)).toBe(0);
  });

  it('returns completed/started ratio', () => {
    expect(receiptCoverage(4, 2)).toBe(0.5);
    expect(receiptCoverage(2, 2)).toBe(1);
  });

  it('does not clamp orphaned completed rows above 1', () => {
    expect(receiptCoverage(1, 2)).toBe(2);
  });
});

describe('aggregateSkillAdoption', () => {
  it('returns an empty summary for no rows', () => {
    const summary = aggregateSkillAdoption([]);
    expect(summary.skills).toEqual([]);
    expect(summary.totalStarted).toBe(0);
    expect(summary.totalCompleted).toBe(0);
    expect(summary.overallReceiptCoverage).toBe(0);
  });

  it('counts started vs completed per skill', () => {
    const summary = aggregateSkillAdoption([
      makeRow({ run_id: 'r1', event_type: 'started' }),
      makeRow({ run_id: 'r1', event_type: 'completed', status: 'success' }),
      makeRow({ run_id: 'r2', event_type: 'started' }),
    ]);
    expect(summary.skills).toHaveLength(1);
    const row = summary.skills[0];
    expect(row.skill_name).toBe('pr-review');
    expect(row.started).toBe(2);
    expect(row.completed).toBe(1);
    expect(row.success).toBe(1);
    expect(row.receiptCoverage).toBe(0.5);
  });

  it('breaks down completed status into success/failed/partial', () => {
    const summary = aggregateSkillAdoption([
      makeRow({ event_type: 'completed', status: 'success' }),
      makeRow({ event_type: 'completed', status: 'failed' }),
      makeRow({ event_type: 'completed', status: 'partial' }),
      makeRow({ event_type: 'completed', status: 'failed' }),
    ]);
    const row = summary.skills[0];
    expect(row.completed).toBe(4);
    expect(row.success).toBe(1);
    expect(row.failed).toBe(2);
    expect(row.partial).toBe(1);
    expect(summary.totalFailed).toBe(2);
  });

  it('groups distinct skills and sorts by started desc then name asc', () => {
    const summary = aggregateSkillAdoption([
      makeRow({ skill_name: 'merge-sweep', event_type: 'started' }),
      makeRow({ skill_name: 'pr-review', event_type: 'started' }),
      makeRow({ skill_name: 'pr-review', event_type: 'started' }),
      makeRow({ skill_name: 'dod-sweep', event_type: 'started' }),
    ]);
    expect(summary.skills.map((s) => s.skill_name)).toEqual([
      'pr-review',
      'dod-sweep',
      'merge-sweep',
    ]);
  });

  it('collects the set of repos that emitted a skill, sorted', () => {
    const summary = aggregateSkillAdoption([
      makeRow({ repo_id: 'omnimarket' }),
      makeRow({ repo_id: 'omniclaude' }),
      makeRow({ repo_id: 'omniclaude' }),
    ]);
    expect(summary.skills[0].repos).toEqual(['omniclaude', 'omnimarket']);
  });

  it('is order-independent (deterministic)', () => {
    const rows: SkillExecutionRow[] = [
      makeRow({ run_id: 'a', event_type: 'started' }),
      makeRow({ run_id: 'a', event_type: 'completed', status: 'success' }),
      makeRow({ run_id: 'b', event_type: 'started' }),
    ];
    const forward = aggregateSkillAdoption(rows);
    const reversed = aggregateSkillAdoption([...rows].reverse());
    expect(forward).toEqual(reversed);
  });

  it('ignores rows with a missing or empty skill_name', () => {
    const summary = aggregateSkillAdoption([
      makeRow({ skill_name: '' }),
      makeRow({ skill_name: 'pr-review' }),
    ]);
    expect(summary.skills).toHaveLength(1);
    expect(summary.skills[0].skill_name).toBe('pr-review');
  });

  it('computes overall receipt coverage across all skills', () => {
    const summary = aggregateSkillAdoption([
      makeRow({ skill_name: 'a', event_type: 'started' }),
      makeRow({ skill_name: 'a', event_type: 'completed', status: 'success' }),
      makeRow({ skill_name: 'b', event_type: 'started' }),
      makeRow({ skill_name: 'b', event_type: 'started' }),
    ]);
    // 1 completed / 3 started
    expect(summary.totalStarted).toBe(3);
    expect(summary.totalCompleted).toBe(1);
    expect(summary.overallReceiptCoverage).toBeCloseTo(1 / 3);
  });
});
