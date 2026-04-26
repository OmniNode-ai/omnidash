import { describe, it, expect } from 'vitest';

// Sanity tests for the build-time outputs. The earlier
// `fixtures/onex.snapshot.projection.llm_cost.v1` existence check was
// removed (M17 fix): it asserted only that a contributor had run
// `generate:fixtures` locally, never that the fixture pipeline itself
// worked, and was permanently `skipIf(inCI)` because CI doesn't run
// generate:fixtures. The actual fixture-rendering surface is covered
// by every widget's unit tests (which mock fetch against the same
// shape) and by the integration tests in src/integration.part*.test.tsx.

describe('Proof of Life', () => {
  it('component registry lists at least 7 components', async () => {
    const registry = await import('../src/registry/component-registry.json');
    // components is a record object; count keys
    expect(Object.keys(registry.components).length).toBeGreaterThanOrEqual(7);
  });

  it('generated TS enum matches Part 1 values', async () => {
    const mod = await import('../src/shared/types/generated/enum-dashboard-widget-type');
    expect(mod.EnumDashboardWidgetType.Chart).toBe('chart');
  });
});
