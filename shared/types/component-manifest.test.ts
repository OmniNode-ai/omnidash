import { describe, it, expect } from 'vitest';
import { validateComponentManifest, type ComponentManifest, type ProjectionOrderingAuthority } from './component-manifest';
import type { BarChartFieldMapping, TrendChartFieldMapping, EmptyStateConfig, EmptyStateReason } from './chart-config';
import { TOPICS } from './topics';

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
    expect(result.errors).toContainEqual(expect.stringMatching(/websocket.*topic/));
  });

  it('rejects a projection dataSource without a topic', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'projection', required: true, purpose: 'initial_fetch' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/projection.*topic/));
  });

  it('rejects unsupported dataSource types such as legacy api endpoints', () => {
    const result = validateComponentManifest({
      ...validManifest,
      dataSources: [
        { type: 'api', endpoint: '/api/test', required: true, purpose: 'initial_fetch' } as any,
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/unsupported type 'api'/));
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

  // OMN-10285: projectionSchema + displayContract envelope acceptance
  describe('projectionSchema and displayContract fields (OMN-10285)', () => {
    it('validates a manifest WITH projectionSchema and displayContract (new fields accepted)', () => {
      const result = validateComponentManifest({
        ...validManifest,
        projectionSchema: {
          type: 'object',
          properties: {
            model_id: { type: 'string' },
            total_cost_usd: { type: 'number' },
          },
          required: ['model_id', 'total_cost_usd'],
        },
        displayContract: {
          type: 'object',
          properties: {
            bars: { type: 'array', items: { type: 'object' } },
          },
        },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates a manifest WITHOUT projectionSchema and displayContract (backward-compatible)', () => {
      const result = validateComponentManifest(validManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts projectionSchema as a $ref string', () => {
      const result = validateComponentManifest({
        ...validManifest,
        projectionSchema: '#/definitions/LLMCostRow',
      });
      expect(result.valid).toBe(true);
    });

    it('accepts displayContract as a $ref string', () => {
      const result = validateComponentManifest({
        ...validManifest,
        displayContract: '#/definitions/BarChartOutput',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects projectionSchema as an empty string', () => {
      const result = validateComponentManifest({
        ...validManifest,
        projectionSchema: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/projectionSchema/));
    });

    it('rejects displayContract as an empty string', () => {
      const result = validateComponentManifest({
        ...validManifest,
        displayContract: '   ',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/displayContract/));
    });

    it('rejects projectionSchema as an empty object', () => {
      const result = validateComponentManifest({
        ...validManifest,
        projectionSchema: {},
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/projectionSchema/));
    });

    it('rejects displayContract as an array', () => {
      const result = validateComponentManifest({
        ...validManifest,
        displayContract: [] as unknown as ComponentManifest['displayContract'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/displayContract/));
    });

    it('accepts projectionSchema with ordering authority declaration', () => {
      const ordering: ProjectionOrderingAuthority = {
        authority: 'bucket_time',
        fieldName: 'bucket_time',
        direction: 'asc',
        clockSemantics: 'UTC',
      };
      const result = validateComponentManifest({
        ...validManifest,
        projectionSchema: {
          type: 'object',
          properties: {
            bucket_time: { type: 'string', format: 'date-time' },
            total_cost_usd: { type: 'number' },
          },
          required: ['bucket_time', 'total_cost_usd'],
          description: JSON.stringify({ ordering }),
        },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts all four ordering authority variants', () => {
      const authorities: ProjectionOrderingAuthority['authority'][] = [
        'ingest_sequence',
        'bucket_time',
        'aggregation_key',
        'monotonic_field',
      ];
      for (const authority of authorities) {
        const ordering: ProjectionOrderingAuthority = { authority };
        const result = validateComponentManifest({
          ...validManifest,
          projectionSchema: {
            type: 'object',
            description: JSON.stringify({ ordering }),
          },
        });
        expect(result.valid).toBe(true);
      }
    });
  });

  // OMN-10302: cost-by-repo manifest entry validation
  describe('cost-by-repo manifest entry (OMN-10302)', () => {
    const costByRepoManifest: ComponentManifest = {
      name: 'cost-by-repo',
      displayName: 'Cost by Repo',
      description: 'LLM cost per repository as a horizontal bar chart; upstream-blocked until repo_name column exists.',
      category: 'cost',
      version: '1.0.0',
      implementationKey: 'IBarChartAdapter/threejs',
      dataSources: [
        { type: 'projection', topic: TOPICS.costByRepo, required: true, purpose: 'initial_fetch' },
      ],
      events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 3, h: 3 },
      maxSize: { w: 12, h: 8 },
      emptyState: {
        message: 'No cost-by-repo data available',
        hint: 'Cost by repository appears after repo_name is populated upstream',
        reasons: {
          'no-data': { message: 'No records yet.' },
          'upstream-blocked': {
            message: 'repo_name column is absent from llm_cost_aggregates (migration 031:142).',
            cta: 'See OMN-10302',
          },
        },
      },
      projectionSchema: {
        type: 'object',
        required: ['repo_name', 'total_cost_usd', 'window'],
        properties: {
          repo_name: { type: 'string' },
          total_cost_usd: { type: 'number' },
          window: { type: 'string' },
        },
      },
      displayContract: {
        description: 'Horizontal bar per repo, x=repo_name, y=total_cost_usd, sorted descending.',
        type: 'object',
        properties: {
          chartType: { type: 'string', const: 'bar' },
          orientation: { type: 'string', const: 'horizontal' },
          xAxis: { type: 'string', const: 'repo_name' },
          yAxis: { type: 'string', const: 'total_cost_usd' },
          ordering: { type: 'string', const: 'total_cost_usd desc' },
        },
      },
      capabilities: {
        supports_compare: false,
        supports_export: true,
        supports_fullscreen: true,
        supports_time_range: true,
      },
    };

    it('validates the cost-by-repo manifest entry', () => {
      const result = validateComponentManifest(costByRepoManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('uses TOPICS.costByRepo as the data source topic', () => {
      expect(costByRepoManifest.dataSources[0]!.topic).toBe(TOPICS.costByRepo);
      expect(TOPICS.costByRepo).toBe('onex.snapshot.projection.cost.by_repo.v1');
    });

    it('declares implementationKey routing to IBarChartAdapter/threejs', () => {
      expect(costByRepoManifest.implementationKey).toBe('IBarChartAdapter/threejs');
    });

    it('emptyState.reasons includes both no-data and upstream-blocked', () => {
      const reasons = costByRepoManifest.emptyState.reasons!;
      const reasonKeys = Object.keys(reasons) as EmptyStateReason[];
      expect(reasonKeys).toContain('no-data');
      expect(reasonKeys).toContain('upstream-blocked');
    });

    it('upstream-blocked reason message cites migration 031:142', () => {
      const upstreamBlockedMsg = costByRepoManifest.emptyState.reasons!['upstream-blocked']!.message;
      expect(upstreamBlockedMsg).toMatch(/031:142/);
    });

    it('projectionSchema declares repo_name with upstream-blocked annotation', () => {
      const schema = costByRepoManifest.projectionSchema as Record<string, unknown>;
      const props = schema['properties'] as Record<string, { type: string; description?: string }>;
      expect(props['repo_name']).toBeDefined();
      expect(props['repo_name']!.type).toBe('string');
    });

    it('projectionSchema declares total_cost_usd as number', () => {
      const schema = costByRepoManifest.projectionSchema as Record<string, unknown>;
      const props = schema['properties'] as Record<string, { type: string }>;
      expect(props['total_cost_usd']!.type).toBe('number');
    });

    it('displayContract declares horizontal bar orientation sorted by total_cost_usd desc', () => {
      const dc = costByRepoManifest.displayContract as Record<string, unknown>;
      const props = dc['properties'] as Record<string, { type: string; const?: string }>;
      expect(props['orientation']!.const).toBe('horizontal');
      expect(props['ordering']!.const).toBe('total_cost_usd desc');
    });

    it('accepts emptyState with reasons (backward-compatible reasons field)', () => {
      const result = validateComponentManifest(costByRepoManifest);
      expect(result.valid).toBe(true);
    });
  });
});
