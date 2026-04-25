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
});
