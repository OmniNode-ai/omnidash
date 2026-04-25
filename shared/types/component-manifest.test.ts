import { describe, it, expect } from 'vitest';
import { validateComponentManifest, type ComponentManifest } from './component-manifest';

describe('ComponentManifest validation', () => {
  const validManifest: ComponentManifest = {
    name: 'cost-trend-panel',
    displayName: 'Cost Trend',
    description: 'LLM cost trends over time',
    category: 'quality',
    version: '1.0.0',
    implementationKey: 'cost-trend/CostTrendPanel',
    configSchema: { type: 'object', properties: {}, additionalProperties: false },
    dataSources: [],
    events: { emits: [], consumes: [] },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 12, h: 8 },
    emptyState: { message: 'No cost data', hint: 'Check data pipeline' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true },
  };

  it('accepts a valid manifest', () => {
    const result = validateComponentManifest(validManifest);
    expect(result.valid).toBe(true);
  });

  it('rejects manifest with empty name', () => {
    const result = validateComponentManifest({ ...validManifest, name: '' });
    expect(result.valid).toBe(false);
  });

  it('rejects manifest with invalid category', () => {
    const result = validateComponentManifest({ ...validManifest, category: 'invalid' as any });
    expect(result.valid).toBe(false);
  });

  it('rejects manifest where minSize exceeds maxSize', () => {
    const result = validateComponentManifest({
      ...validManifest,
      minSize: { w: 10, h: 10 },
      maxSize: { w: 4, h: 4 },
    });
    expect(result.valid).toBe(false);
  });

  // T16 (OMN-157): generator-time discipline.
  it('rejects a websocket dataSource without a topic', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'websocket', required: false, purpose: 'live_updates' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/websocket/);
    expect(result.errors[0]).toMatch(/topic/);
  });

  it('rejects an api dataSource without an endpoint', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'api', required: true, purpose: 'initial_fetch' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/api/);
    expect(result.errors[0]).toMatch(/endpoint/);
  });

  it('accepts a websocket dataSource with topic and an api dataSource with endpoint', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'websocket', topic: 'onex.snapshot.projection.test.v1', required: true, purpose: 'live_updates' },
        { type: 'api', endpoint: '/api/test', required: true, purpose: 'initial_fetch' },
      ],
    });
    expect(result.valid).toBe(true);
  });
});
