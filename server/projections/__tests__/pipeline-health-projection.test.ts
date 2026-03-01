/**
 * PipelineHealthProjection Tests (OMN-3192)
 *
 * Exercises the PipelineHealthProjection class to verify:
 * 1. Empty state returns empty pipelines
 * 2. Events update pipeline state correctly
 * 3. Pipeline detected as stuck after 30 minutes with no update
 * 4. Gate failure sets blocked: true and halts progression
 * 5. Multiple pipelines tracked independently
 * 6. Most recent event wins for state transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipelineHealthProjection } from '../pipeline-health-projection';
import type { PipelineEvent } from '../pipeline-health-projection';

// ============================================================================
// Helpers
// ============================================================================

function makeTs(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

// ============================================================================
// Tests
// ============================================================================

describe('PipelineHealthProjection', () => {
  let projection: PipelineHealthProjection;

  beforeEach(() => {
    projection = new PipelineHealthProjection();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // 1. Empty state
  // --------------------------------------------------------------------------

  it('should return empty pipelines when no events have been handled', () => {
    const pipelines = projection.getAllPipelines();
    expect(pipelines).toEqual([]);
  });

  it('should return null for an unknown ticket', () => {
    const result = projection.getPipelineForTicket('OMN-9999');
    expect(result).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2. Events update projection state correctly
  // --------------------------------------------------------------------------

  it('should create a pipeline entry from the first event', () => {
    const event: PipelineEvent = {
      ticket_id: 'OMN-1234',
      repo: 'OmniNode-ai/omnidash',
      phase: 'implement',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
    projection.handle(event);

    const pipeline = projection.getPipelineForTicket('OMN-1234');
    expect(pipeline).not.toBeNull();
    expect(pipeline!.ticket_id).toBe('OMN-1234');
    expect(pipeline!.phase).toBe('implement');
    expect(pipeline!.status).toBe('running');
  });

  it('should update pipeline state on subsequent events', () => {
    const ts1 = makeTs(-5);
    const ts2 = makeTs(-1);

    projection.handle({
      ticket_id: 'OMN-1234',
      repo: 'OmniNode-ai/omnidash',
      phase: 'implement',
      status: 'running',
      timestamp: ts1,
    });
    projection.handle({
      ticket_id: 'OMN-1234',
      repo: 'OmniNode-ai/omnidash',
      phase: 'local_review',
      status: 'running',
      timestamp: ts2,
    });

    const pipeline = projection.getPipelineForTicket('OMN-1234');
    expect(pipeline!.phase).toBe('local_review');
    expect(pipeline!.lastUpdated).toBe(ts2);
  });

  it('should record the first-seen timestamp as startedAt', () => {
    const ts1 = makeTs(-10);
    const ts2 = makeTs(-2);

    projection.handle({
      ticket_id: 'OMN-1234',
      repo: 'OmniNode-ai/omnidash',
      phase: 'pre_flight',
      status: 'running',
      timestamp: ts1,
    });
    projection.handle({
      ticket_id: 'OMN-1234',
      repo: 'OmniNode-ai/omnidash',
      phase: 'implement',
      status: 'running',
      timestamp: ts2,
    });

    const pipeline = projection.getPipelineForTicket('OMN-1234');
    expect(pipeline!.startedAt).toBe(ts1);
  });

  // --------------------------------------------------------------------------
  // 3. Pipeline stuck after 30 min with no update
  // --------------------------------------------------------------------------

  it('should mark pipeline as stuck when last update > 30 minutes ago', () => {
    vi.useFakeTimers();

    projection.handle({
      ticket_id: 'OMN-1234',
      repo: 'OmniNode-ai/omnidash',
      phase: 'ci_watch',
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    // Advance time by 31 minutes
    vi.advanceTimersByTime(31 * 60_000);

    const pipeline = projection.getPipelineForTicket('OMN-1234');
    expect(pipeline!.stuck).toBe(true);

    vi.useRealTimers();
  });

  it('should not mark pipeline as stuck when last update is recent', () => {
    projection.handle({
      ticket_id: 'OMN-1234',
      repo: 'OmniNode-ai/omnidash',
      phase: 'ci_watch',
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    const pipeline = projection.getPipelineForTicket('OMN-1234');
    expect(pipeline!.stuck).toBe(false);
  });

  it('should not mark completed pipelines as stuck', () => {
    vi.useFakeTimers();

    projection.handle({
      ticket_id: 'OMN-5678',
      repo: 'OmniNode-ai/omnidash',
      phase: 'auto_merge',
      status: 'done',
      timestamp: new Date().toISOString(),
    });

    // Advance time by 60 minutes
    vi.advanceTimersByTime(60 * 60_000);

    const pipeline = projection.getPipelineForTicket('OMN-5678');
    expect(pipeline!.stuck).toBe(false);

    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // 4. Gate failure sets blocked: true and halts progression
  // --------------------------------------------------------------------------

  it('should set blocked: true when a gate failure event is received', () => {
    projection.handle({
      ticket_id: 'OMN-2222',
      repo: 'OmniNode-ai/omnidash',
      phase: 'conflict_gate',
      status: 'blocked',
      timestamp: new Date().toISOString(),
      blockedReason: 'HIGH conflict detected',
    });

    const pipeline = projection.getPipelineForTicket('OMN-2222');
    expect(pipeline!.blocked).toBe(true);
    expect(pipeline!.blockedReason).toBe('HIGH conflict detected');
  });

  it('should clear blocked state when a subsequent running event is received', () => {
    const ts1 = makeTs(-5);
    const ts2 = makeTs(-1);

    projection.handle({
      ticket_id: 'OMN-2222',
      repo: 'OmniNode-ai/omnidash',
      phase: 'conflict_gate',
      status: 'blocked',
      timestamp: ts1,
      blockedReason: 'HIGH conflict detected',
    });
    projection.handle({
      ticket_id: 'OMN-2222',
      repo: 'OmniNode-ai/omnidash',
      phase: 'implement',
      status: 'running',
      timestamp: ts2,
    });

    const pipeline = projection.getPipelineForTicket('OMN-2222');
    expect(pipeline!.blocked).toBe(false);
    expect(pipeline!.blockedReason).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // 5. Multiple pipelines tracked independently
  // --------------------------------------------------------------------------

  it('should track multiple ticket pipelines independently', () => {
    projection.handle({
      ticket_id: 'OMN-1111',
      repo: 'OmniNode-ai/omniclaude',
      phase: 'implement',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
    projection.handle({
      ticket_id: 'OMN-2222',
      repo: 'OmniNode-ai/omnidash',
      phase: 'create_pr',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
    projection.handle({
      ticket_id: 'OMN-3333',
      repo: 'OmniNode-ai/omnibase_core',
      phase: 'auto_merge',
      status: 'done',
      timestamp: new Date().toISOString(),
    });

    const all = projection.getAllPipelines();
    expect(all).toHaveLength(3);

    const phases = all.map((p) => p.phase).sort();
    expect(phases).toEqual(['auto_merge', 'create_pr', 'implement']);
  });

  // --------------------------------------------------------------------------
  // 6. CDQA gate pass/fail recording
  // --------------------------------------------------------------------------

  it('should record CDQA gate results on the pipeline', () => {
    projection.handle({
      ticket_id: 'OMN-4444',
      repo: 'OmniNode-ai/omnidash',
      phase: 'implement',
      status: 'running',
      timestamp: makeTs(-10),
    });
    projection.handle({
      ticket_id: 'OMN-4444',
      repo: 'OmniNode-ai/omnidash',
      phase: 'local_review',
      status: 'running',
      timestamp: makeTs(-5),
      cdqaGate: { gate: 'contract-compliance', result: 'PASS' },
    });
    projection.handle({
      ticket_id: 'OMN-4444',
      repo: 'OmniNode-ai/omnidash',
      phase: 'local_review',
      status: 'blocked',
      timestamp: makeTs(-3),
      blockedReason: 'CDQA gate failed: arch-invariants',
      cdqaGate: { gate: 'arch-invariants', result: 'BLOCK' },
    });

    const pipeline = projection.getPipelineForTicket('OMN-4444');
    expect(pipeline!.cdqaGates).toHaveLength(2);
    expect(pipeline!.cdqaGates[0].result).toBe('PASS');
    expect(pipeline!.cdqaGates[1].result).toBe('BLOCK');
    expect(pipeline!.blocked).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 7. getAllPipelines sorted by lastUpdated descending
  // --------------------------------------------------------------------------

  it('should sort pipelines by lastUpdated descending (most recently updated first)', () => {
    const ts1 = makeTs(-30);
    const ts2 = makeTs(-10);
    const ts3 = makeTs(-5);

    projection.handle({
      ticket_id: 'OMN-OLDEST',
      repo: 'r',
      phase: 'implement',
      status: 'running',
      timestamp: ts1,
    });
    projection.handle({
      ticket_id: 'OMN-NEWEST',
      repo: 'r',
      phase: 'implement',
      status: 'running',
      timestamp: ts3,
    });
    projection.handle({
      ticket_id: 'OMN-MIDDLE',
      repo: 'r',
      phase: 'implement',
      status: 'running',
      timestamp: ts2,
    });

    const all = projection.getAllPipelines();
    expect(all[0].ticket_id).toBe('OMN-NEWEST');
    expect(all[1].ticket_id).toBe('OMN-MIDDLE');
    expect(all[2].ticket_id).toBe('OMN-OLDEST');
  });
});
