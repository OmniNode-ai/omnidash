/**
 * CdqaGateProjection Tests (OMN-3190)
 *
 * Exercises the CdqaGateProjection class with mocked gate records to verify:
 * 1. Empty state returns empty summaries
 * 2. BLOCK result if any gate blocked
 * 3. WARN result if any gate warned (but none blocked)
 * 4. PASS result if all gates passed
 * 5. Groups gate results by PR number
 * 6. Multiple PRs are tracked independently
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CdqaGateProjection } from '../cdqa-gate-projection';
import type { CdqaGateRecord } from '../cdqa-gate-projection';

// ============================================================================
// Tests
// ============================================================================

describe('CdqaGateProjection', () => {
  let projection: CdqaGateProjection;

  beforeEach(() => {
    projection = new CdqaGateProjection();
  });

  // --------------------------------------------------------------------------
  // 1. Empty state
  // --------------------------------------------------------------------------

  it('should return empty summaries when no records have been handled', () => {
    const summaries = projection.getAllSummaries();
    expect(summaries).toEqual([]);
  });

  it('should return null for an unknown PR', () => {
    const summary = projection.getSummaryForPr('OmniNode-ai/omnidash', 42);
    expect(summary).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2. BLOCK result — any gate blocked
  // --------------------------------------------------------------------------

  it('should mark overall result BLOCK if any gate result is BLOCK', () => {
    const records: CdqaGateRecord[] = [
      {
        gate: 'contract-compliance',
        pr_number: 100,
        repo: 'OmniNode-ai/omnidash',
        result: 'PASS',
        timestamp: '2026-03-01T00:00:00Z',
      },
      {
        gate: 'arch-invariants',
        pr_number: 100,
        repo: 'OmniNode-ai/omnidash',
        result: 'BLOCK',
        timestamp: '2026-03-01T00:01:00Z',
      },
      {
        gate: 'test-coverage',
        pr_number: 100,
        repo: 'OmniNode-ai/omnidash',
        result: 'PASS',
        timestamp: '2026-03-01T00:02:00Z',
      },
    ];

    for (const record of records) {
      projection.handle(record);
    }

    const summary = projection.getSummaryForPr('OmniNode-ai/omnidash', 100);
    expect(summary).not.toBeNull();
    expect(summary!.overallResult).toBe('BLOCK');
    expect(summary!.blocked).toBe(true);
    expect(summary!.gates).toHaveLength(3);
  });

  // --------------------------------------------------------------------------
  // 3. WARN result — any gate warned, none blocked
  // --------------------------------------------------------------------------

  it('should mark overall result WARN if any gate warned but none blocked', () => {
    const records: CdqaGateRecord[] = [
      {
        gate: 'contract-compliance',
        pr_number: 200,
        repo: 'OmniNode-ai/omniclaude',
        result: 'PASS',
        timestamp: '2026-03-01T00:00:00Z',
      },
      {
        gate: 'arch-invariants',
        pr_number: 200,
        repo: 'OmniNode-ai/omniclaude',
        result: 'WARN',
        timestamp: '2026-03-01T00:01:00Z',
      },
    ];

    for (const record of records) {
      projection.handle(record);
    }

    const summary = projection.getSummaryForPr('OmniNode-ai/omniclaude', 200);
    expect(summary).not.toBeNull();
    expect(summary!.overallResult).toBe('WARN');
    expect(summary!.blocked).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 4. PASS result — all gates passed
  // --------------------------------------------------------------------------

  it('should mark overall result PASS if all gates passed', () => {
    const records: CdqaGateRecord[] = [
      {
        gate: 'contract-compliance',
        pr_number: 300,
        repo: 'OmniNode-ai/omnibase_core',
        result: 'PASS',
        timestamp: '2026-03-01T00:00:00Z',
      },
      {
        gate: 'arch-invariants',
        pr_number: 300,
        repo: 'OmniNode-ai/omnibase_core',
        result: 'PASS',
        timestamp: '2026-03-01T00:01:00Z',
      },
      {
        gate: 'test-coverage',
        pr_number: 300,
        repo: 'OmniNode-ai/omnibase_core',
        result: 'PASS',
        timestamp: '2026-03-01T00:02:00Z',
      },
    ];

    for (const record of records) {
      projection.handle(record);
    }

    const summary = projection.getSummaryForPr('OmniNode-ai/omnibase_core', 300);
    expect(summary).not.toBeNull();
    expect(summary!.overallResult).toBe('PASS');
    expect(summary!.blocked).toBe(false);
    expect(summary!.gates).toHaveLength(3);
  });

  // --------------------------------------------------------------------------
  // 5. Groups gate results by PR number
  // --------------------------------------------------------------------------

  it('should group gate results by pr_number within the same repo', () => {
    const records: CdqaGateRecord[] = [
      {
        gate: 'contract-compliance',
        pr_number: 10,
        repo: 'OmniNode-ai/omnidash',
        result: 'PASS',
        timestamp: '2026-03-01T00:00:00Z',
      },
      {
        gate: 'contract-compliance',
        pr_number: 11,
        repo: 'OmniNode-ai/omnidash',
        result: 'BLOCK',
        timestamp: '2026-03-01T00:00:00Z',
      },
    ];

    for (const record of records) {
      projection.handle(record);
    }

    const summary10 = projection.getSummaryForPr('OmniNode-ai/omnidash', 10);
    const summary11 = projection.getSummaryForPr('OmniNode-ai/omnidash', 11);

    expect(summary10!.overallResult).toBe('PASS');
    expect(summary11!.overallResult).toBe('BLOCK');
  });

  // --------------------------------------------------------------------------
  // 6. Multiple PRs tracked independently
  // --------------------------------------------------------------------------

  it('should track multiple PRs and return all summaries', () => {
    const records: CdqaGateRecord[] = [
      {
        gate: 'contract-compliance',
        pr_number: 1,
        repo: 'OmniNode-ai/omnidash',
        result: 'PASS',
        timestamp: '2026-03-01T00:00:00Z',
      },
      {
        gate: 'contract-compliance',
        pr_number: 2,
        repo: 'OmniNode-ai/omnidash',
        result: 'BLOCK',
        timestamp: '2026-03-01T00:00:00Z',
      },
      {
        gate: 'contract-compliance',
        pr_number: 3,
        repo: 'OmniNode-ai/omniclaude',
        result: 'WARN',
        timestamp: '2026-03-01T00:00:00Z',
      },
    ];

    for (const record of records) {
      projection.handle(record);
    }

    const summaries = projection.getAllSummaries();
    expect(summaries).toHaveLength(3);

    const results = summaries.map((s) => s.overallResult).sort();
    expect(results).toEqual(['BLOCK', 'PASS', 'WARN']);
  });

  // --------------------------------------------------------------------------
  // 7. lastEvaluated is updated to most recent gate timestamp
  // --------------------------------------------------------------------------

  it('should set lastEvaluated to the most recent gate timestamp', () => {
    projection.handle({
      gate: 'contract-compliance',
      pr_number: 50,
      repo: 'OmniNode-ai/omnidash',
      result: 'PASS',
      timestamp: '2026-03-01T00:00:00Z',
    });
    projection.handle({
      gate: 'arch-invariants',
      pr_number: 50,
      repo: 'OmniNode-ai/omnidash',
      result: 'PASS',
      timestamp: '2026-03-01T01:00:00Z',
    });

    const summary = projection.getSummaryForPr('OmniNode-ai/omnidash', 50);
    expect(summary!.lastEvaluated).toBe('2026-03-01T01:00:00Z');
  });

  // --------------------------------------------------------------------------
  // 8. BLOCK supersedes WARN in priority
  // --------------------------------------------------------------------------

  it('should use BLOCK as overall result when both WARN and BLOCK gates exist', () => {
    projection.handle({
      gate: 'contract-compliance',
      pr_number: 99,
      repo: 'OmniNode-ai/omnidash',
      result: 'WARN',
      timestamp: '2026-03-01T00:00:00Z',
    });
    projection.handle({
      gate: 'arch-invariants',
      pr_number: 99,
      repo: 'OmniNode-ai/omnidash',
      result: 'BLOCK',
      timestamp: '2026-03-01T00:01:00Z',
    });
    projection.handle({
      gate: 'test-coverage',
      pr_number: 99,
      repo: 'OmniNode-ai/omnidash',
      result: 'PASS',
      timestamp: '2026-03-01T00:02:00Z',
    });

    const summary = projection.getSummaryForPr('OmniNode-ai/omnidash', 99);
    expect(summary!.overallResult).toBe('BLOCK');
    expect(summary!.blocked).toBe(true);
  });
});
