import { describe, it, expect } from 'vitest';
import type {
  BarChartFieldMapping,
  TrendChartFieldMapping,
  KPITileMetricConfig,
  DataTableColumnConfig,
  EmptyStateConfig,
  EmptyStateReason,
} from './chart-config';

// ---------------------------------------------------------------------------
// Valid instance checks — these must compile and pass at runtime.
// Invalid instance checks use @ts-expect-error to prove the type-checker
// rejects structurally invalid shapes.
// ---------------------------------------------------------------------------

describe('BarChartFieldMapping', () => {
  it('accepts a minimal valid instance', () => {
    const mapping: BarChartFieldMapping = { x: 'model_id', y: 'total_cost_usd' };
    expect(mapping.x).toBe('model_id');
    expect(mapping.y).toBe('total_cost_usd');
  });

  it('accepts a fully-specified instance', () => {
    const mapping: BarChartFieldMapping = {
      x: 'model_id',
      y: 'total_cost_usd',
      group: 'repo_name',
      format: '$,.2f',
    };
    expect(mapping.group).toBe('repo_name');
    expect(mapping.format).toBe('$,.2f');
  });

  it('rejects missing required x field', () => {
    // @ts-expect-error — x is required
    const _invalid: BarChartFieldMapping = { y: 'total_cost_usd' };
    void _invalid;
    // If TypeScript compiles, this assertion is the runtime proof the test ran
    expect(true).toBe(true);
  });

  it('rejects missing required y field', () => {
    // @ts-expect-error — y is required
    const _invalid: BarChartFieldMapping = { x: 'model_id' };
    void _invalid;
    expect(true).toBe(true);
  });
});

describe('TrendChartFieldMapping', () => {
  it('accepts a valid instance with required granularity', () => {
    const mapping: TrendChartFieldMapping = {
      x: 'bucket_time',
      y: 'total_cost_usd',
      granularity: 'day',
    };
    expect(mapping.granularity).toBe('day');
  });

  it('accepts all granularity values', () => {
    const hour: TrendChartFieldMapping = { x: 'bucket_time', y: 'total_cost_usd', granularity: 'hour' };
    const day: TrendChartFieldMapping = { x: 'bucket_time', y: 'total_cost_usd', granularity: 'day' };
    const week: TrendChartFieldMapping = { x: 'bucket_time', y: 'total_cost_usd', granularity: 'week' };
    expect(hour.granularity).toBe('hour');
    expect(day.granularity).toBe('day');
    expect(week.granularity).toBe('week');
  });

  it('rejects missing granularity', () => {
    // @ts-expect-error — granularity is required
    const _invalid: TrendChartFieldMapping = { x: 'bucket_time', y: 'total_cost_usd' };
    void _invalid;
    expect(true).toBe(true);
  });

  it('rejects invalid granularity value', () => {
    // @ts-expect-error — 'month' is not a valid granularity
    const _invalid: TrendChartFieldMapping = { x: 'bucket_time', y: 'total_cost_usd', granularity: 'month' };
    void _invalid;
    expect(true).toBe(true);
  });

  it('confirms x is the bucket field with no separate bucketField', () => {
    // The normalization: x IS the bucket field. No separate bucketField property exists.
    const mapping: TrendChartFieldMapping = { x: 'bucket_time', y: 'total_cost_usd', granularity: 'day' };
    // @ts-expect-error — bucketField does not exist on TrendChartFieldMapping
    const _noBucketField = mapping.bucketField;
    void _noBucketField;
    expect(mapping.x).toBe('bucket_time');
  });
});

describe('KPITileMetricConfig', () => {
  it('accepts a minimal valid instance', () => {
    const tile: KPITileMetricConfig = { field: 'total_cost_usd', label: 'Total Cost' };
    expect(tile.field).toBe('total_cost_usd');
    expect(tile.label).toBe('Total Cost');
  });

  it('accepts a fully-specified instance', () => {
    const tile: KPITileMetricConfig = {
      field: 'total_cost_usd',
      label: 'Total Cost',
      format: '$,.2f',
      emptyState: { defaultMessage: 'No cost data' },
    };
    expect(tile.emptyState?.defaultMessage).toBe('No cost data');
  });

  it('rejects missing required field', () => {
    // @ts-expect-error — field is required
    const _invalid: KPITileMetricConfig = { label: 'Total Cost' };
    void _invalid;
    expect(true).toBe(true);
  });

  it('rejects missing required label', () => {
    // @ts-expect-error — label is required
    const _invalid: KPITileMetricConfig = { field: 'total_cost_usd' };
    void _invalid;
    expect(true).toBe(true);
  });
});

describe('DataTableColumnConfig', () => {
  it('accepts a minimal valid instance', () => {
    const col: DataTableColumnConfig = { field: 'model_id', header: 'Model' };
    expect(col.field).toBe('model_id');
    expect(col.header).toBe('Model');
  });

  it('accepts a fully-specified instance', () => {
    const col: DataTableColumnConfig = {
      field: 'total_cost_usd',
      header: 'Total Cost',
      sortable: true,
      searchable: false,
      format: '$,.2f',
      width: 120,
    };
    expect(col.sortable).toBe(true);
    expect(col.width).toBe(120);
  });

  it('rejects missing required field', () => {
    // @ts-expect-error — field is required
    const _invalid: DataTableColumnConfig = { header: 'Model' };
    void _invalid;
    expect(true).toBe(true);
  });

  it('rejects missing required header', () => {
    // @ts-expect-error — header is required
    const _invalid: DataTableColumnConfig = { field: 'model_id' };
    void _invalid;
    expect(true).toBe(true);
  });
});

describe('EmptyStateConfig', () => {
  it('accepts an empty config (all optional)', () => {
    const cfg: EmptyStateConfig = {};
    expect(cfg).toBeDefined();
  });

  it('accepts a fully-specified config with all reason codes', () => {
    const cfg: EmptyStateConfig = {
      defaultMessage: 'No data available',
      reasons: {
        'no-data': { message: 'No records found', cta: 'Refresh' },
        'missing-field': { message: 'Required projection field absent' },
        'upstream-blocked': { message: 'Upstream node not publishing', cta: 'Check pipeline' },
        'schema-invalid': { message: 'Projection schema mismatch — contact platform team' },
      },
    };
    expect(cfg.reasons?.['no-data']?.message).toBe('No records found');
    expect(cfg.reasons?.['schema-invalid']?.message).toBeDefined();
  });

  it('accepts partial reason config', () => {
    const cfg: EmptyStateConfig = {
      reasons: {
        'no-data': { message: 'No data yet' },
      },
    };
    expect(cfg.reasons?.['no-data']?.message).toBe('No data yet');
    expect(cfg.reasons?.['schema-invalid']).toBeUndefined();
  });

  it('rejects unknown reason keys', () => {
    const cfg: EmptyStateConfig = {
      reasons: {
        // @ts-expect-error — 'not-found' is not a valid EmptyStateReason
        'not-found': { message: 'Not found' },
      },
    };
    void cfg;
    expect(true).toBe(true);
  });
});

describe('EmptyStateReason union', () => {
  it('covers all four required reason codes', () => {
    const reasons: EmptyStateReason[] = [
      'no-data',
      'missing-field',
      'upstream-blocked',
      'schema-invalid',
    ];
    expect(reasons).toHaveLength(4);
  });

  it('rejects values outside the union', () => {
    // @ts-expect-error — 'error' is not a valid EmptyStateReason
    const _invalid: EmptyStateReason = 'error';
    void _invalid;
    expect(true).toBe(true);
  });
});
