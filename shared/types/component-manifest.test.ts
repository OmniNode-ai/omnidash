import { describe, it, expect } from 'vitest';
import { validateComponentManifest, type ComponentManifest } from './component-manifest';
import type { BarChartFieldMapping, TrendChartFieldMapping, EmptyStateConfig } from './chart-config';

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

  it('rejects a projection dataSource without a topic', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'projection', required: true, purpose: 'initial_fetch' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/projection/);
    expect(result.errors[0]).toMatch(/topic/);
  });

  it('rejects unsupported dataSource types such as legacy api endpoints', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'api', endpoint: '/api/test', required: true, purpose: 'initial_fetch' } as any,
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/unsupported type 'api'/);
  });

  it('accepts projection and websocket dataSources with topics', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'projection', topic: 'onex.snapshot.projection.test.v1', required: true, purpose: 'initial_fetch' },
        { type: 'websocket', topic: 'onex.snapshot.projection.test.v1', required: false, purpose: 'live_updates' },
      ],
    });
    expect(result.valid).toBe(true);
  });

  // Manifest envelope acceptance: proves configSchema can carry chart-config types.
  // Task 2 (OMN-10284): no changes to component-manifest.ts — only proving the existing
  // JSONSchema7-typed configSchema field is flexible enough to carry chart field-mapping
  // types as a reference object. Chart-specific validation is NOT added here.
  describe('chart-config type envelope acceptance', () => {
    it('accepts a manifest whose configSchema references BarChartFieldMapping shape', () => {
      const barFieldMapping: BarChartFieldMapping = { x: 'model_id', y: 'total_cost_usd' };
      const result = validateComponentManifest({
        ...validManifest,
        configSchema: {
          type: 'object',
          description: 'BarChart field mapping config',
          properties: {
            x: { type: 'string', description: barFieldMapping.x },
            y: { type: 'string', description: barFieldMapping.y },
            group: { type: 'string' },
            format: { type: 'string' },
          },
          required: ['x', 'y'],
        },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a manifest whose configSchema references TrendChartFieldMapping shape', () => {
      const trendFieldMapping: TrendChartFieldMapping = {
        x: 'bucket_time',
        y: 'total_cost_usd',
        granularity: 'day',
      };
      const result = validateComponentManifest({
        ...validManifest,
        configSchema: {
          type: 'object',
          description: 'TrendChart field mapping config',
          properties: {
            x: { type: 'string', description: trendFieldMapping.x },
            y: { type: 'string', description: trendFieldMapping.y },
            granularity: { type: 'string', enum: ['hour', 'day', 'week'], description: trendFieldMapping.granularity },
            group: { type: 'string' },
            format: { type: 'string' },
          },
          required: ['x', 'y', 'granularity'],
        },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a manifest whose configSchema references EmptyStateConfig shape', () => {
      const emptyStateCfg: EmptyStateConfig = {
        defaultMessage: 'No data available',
        reasons: {
          'no-data': { message: 'No records', cta: 'Refresh' },
          'upstream-blocked': { message: 'Upstream blocked' },
        },
      };
      const result = validateComponentManifest({
        ...validManifest,
        configSchema: {
          type: 'object',
          description: 'EmptyStateConfig reference',
          properties: {
            defaultMessage: { type: 'string', description: emptyStateCfg.defaultMessage },
            reasons: { type: 'object' },
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a manifest with no configSchema (chart types are opt-in)', () => {
      const { configSchema: _, ...manifestWithoutConfig } = validManifest;
      const result = validateComponentManifest(manifestWithoutConfig as ComponentManifest);
      expect(result.valid).toBe(true);
    });
  });
});
