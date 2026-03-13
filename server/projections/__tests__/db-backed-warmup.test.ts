/**
 * DbBackedProjectionView warm-up tests (OMN-4958)
 *
 * Verifies:
 * 1. warmAll() calls forceRefresh() on all registered instances
 * 2. Warm-up failures are logged but don't crash
 * 3. resetInstances() clears the registry for test isolation
 * 4. After warmAll(), getSnapshot() returns real data (not emptyPayload)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage before importing the class under test
const mockTryGet = vi.fn(() => null);

vi.mock('../../storage', () => ({
  tryGetIntelligenceDb: (...args: unknown[]) => mockTryGet(...args),
  getIntelligenceDb: vi.fn(() => {
    throw new Error('not configured');
  }),
  isDatabaseConfigured: vi.fn(() => false),
  getDatabaseError: vi.fn(() => 'mocked'),
}));

import { DbBackedProjectionView } from '../db-backed-projection-view';

// Concrete test subclass
class TestProjection extends DbBackedProjectionView<{ count: number }> {
  readonly viewId = 'test-warmup';
  private queryResult = { count: 0 };

  setQueryResult(result: { count: number }): void {
    this.queryResult = result;
  }

  protected async querySnapshot(): Promise<{ count: number }> {
    return this.queryResult;
  }

  protected emptyPayload(): { count: number } {
    return { count: -1 };
  }
}

// Concrete subclass that throws on querySnapshot
class FailingProjection extends DbBackedProjectionView<{ value: string }> {
  readonly viewId = 'test-failing';

  protected async querySnapshot(): Promise<{ value: string }> {
    throw new Error('DB connection failed');
  }

  protected emptyPayload(): { value: string } {
    return { value: 'empty' };
  }
}

describe('DbBackedProjectionView.warmAll()', () => {
  beforeEach(() => {
    DbBackedProjectionView.resetInstances();
    mockTryGet.mockReturnValue({
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
    });
  });

  it('warms all registered instances', async () => {
    const p1 = new TestProjection();
    p1.setQueryResult({ count: 42 });
    const p2 = new TestProjection();
    p2.setQueryResult({ count: 99 });

    await DbBackedProjectionView.warmAll();

    // After warm-up, getSnapshot should return real data, not emptyPayload
    const snap1 = p1.getSnapshot();
    expect(snap1.payload.count).toBe(42);

    const snap2 = p2.getSnapshot();
    expect(snap2.payload.count).toBe(99);
  });

  it('does not throw when a view fails to warm', async () => {
    new TestProjection();
    new FailingProjection(); // This one will fail

    // Should not throw
    await expect(DbBackedProjectionView.warmAll()).resolves.toBeUndefined();
  });

  it('resetInstances clears the registry', async () => {
    new TestProjection();
    DbBackedProjectionView.resetInstances();

    // warmAll should be a no-op with no instances
    const consoleSpy = vi.spyOn(console, 'log');
    await DbBackedProjectionView.warmAll();
    // Should not log "Warming N views" because there are none
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Warming'));
    consoleSpy.mockRestore();
  });

  it('returns emptyPayload before warmAll is called', () => {
    const p = new TestProjection();
    p.setQueryResult({ count: 42 });

    // Before warm-up, no cache exists -> returns emptyPayload
    const snap = p.getSnapshot();
    expect(snap.payload.count).toBe(-1);
  });
});
