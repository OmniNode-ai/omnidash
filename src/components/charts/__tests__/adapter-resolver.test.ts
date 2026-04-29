import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  resolveChartAdapter,
  UnknownAdapterError,
  UnknownImplementationError,
} from '../adapter-resolver';
import { BarChartThreeJs } from '../threejs/BarChart';
import { TrendChartThreeJs } from '../threejs/TrendChart';
import { KPITileClusterThreeJs } from '../threejs/KPITileCluster';
import { DataTableThreeJs } from '../threejs/DataTable';
import type { IBarChartAdapter } from '@shared/types/chart-adapter-bar';
import type { ITrendChartAdapter } from '@shared/types/chart-adapter-trend';
import type { IKPITileClusterAdapter } from '@shared/types/chart-adapter-kpi';
import type { IDataTableAdapter } from '@shared/types/chart-adapter-table';
import type { RegistryManifest } from '@/registry/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryJson = readFileSync(
  resolve(__dirname, '../../../registry/component-registry.json'),
  'utf-8',
);
const registry: RegistryManifest = JSON.parse(registryJson);

describe('resolveChartAdapter', () => {
  describe('positive resolutions', () => {
    it('resolves IBarChartAdapter + threejs to BarChartThreeJs', () => {
      const result = resolveChartAdapter('IBarChartAdapter', 'threejs');
      expect(result).toBe(BarChartThreeJs);
      // Compile-time: resolved value satisfies IBarChartAdapter
      const _check: IBarChartAdapter = result as IBarChartAdapter;
      expect(typeof _check).toBe('function');
    });

    it('resolves ITrendChartAdapter + threejs to TrendChartThreeJs', () => {
      const result = resolveChartAdapter('ITrendChartAdapter', 'threejs');
      expect(result).toBe(TrendChartThreeJs);
      const _check: ITrendChartAdapter = result as ITrendChartAdapter;
      expect(typeof _check).toBe('function');
    });

    it('resolves IKPITileClusterAdapter + threejs to KPITileClusterThreeJs', () => {
      const result = resolveChartAdapter('IKPITileClusterAdapter', 'threejs');
      expect(result).toBe(KPITileClusterThreeJs);
      const _check: IKPITileClusterAdapter = result as IKPITileClusterAdapter;
      expect(typeof _check).toBe('function');
    });

    it('resolves IDataTableAdapter + threejs to DataTableThreeJs', () => {
      const result = resolveChartAdapter('IDataTableAdapter', 'threejs');
      expect(result).toBe(DataTableThreeJs);
      const _check: IDataTableAdapter = result as IDataTableAdapter;
      expect(typeof _check).toBe('function');
    });
  });

  describe('token-usage manifest entry (OMN-10303)', () => {
    it('token-usage entry is present in the generated registry', () => {
      expect(registry.components['token-usage']).toBeDefined();
    });

    it('token-usage implementationKey routes to ITrendChartAdapter/threejs', () => {
      const entry = registry.components['token-usage']!;
      expect(entry.implementationKey).toBe('ITrendChartAdapter/threejs');
    });

    it('resolveChartAdapter ITrendChartAdapter + threejs resolves to TrendChartThreeJs', () => {
      const result = resolveChartAdapter('ITrendChartAdapter', 'threejs');
      expect(result).toBe(TrendChartThreeJs);
    });

    it('token-usage projectionSchema declares x-orderingAuthority with bucket_time asc UTC', () => {
      const entry = registry.components['token-usage']!;
      const schema = entry.projectionSchema as Record<string, unknown> | undefined;
      expect(schema).toBeDefined();
      const authority = schema!['x-orderingAuthority'] as Record<string, string> | undefined;
      expect(authority).toBeDefined();
      expect(authority!['fieldName']).toBe('bucket_time');
      expect(authority!['direction']).toBe('asc');
      expect(authority!['clockSemantics']).toBe('UTC');
    });

    it('token-usage emptyState declares both no-data and upstream-blocked reasons', () => {
      const entry = registry.components['token-usage']!;
      const reasons = entry.emptyState.reasons;
      expect(reasons).toBeDefined();
      expect(Object.keys(reasons!)).toContain('no-data');
      expect(Object.keys(reasons!)).toContain('upstream-blocked');
    });

    it('token-usage dataSources references costTokenUsage topic', () => {
      const entry = registry.components['token-usage']!;
      const topics = entry.dataSources.map((ds: { topic?: string }) => ds.topic);
      expect(topics).toContain('onex.snapshot.projection.cost.token_usage.v1');
    });
  });

  describe('failure modes', () => {
    it('throws UnknownImplementationError for known adapter + unknown implementationKey', () => {
      expect(() => resolveChartAdapter('IBarChartAdapter', 'recharts')).toThrow(
        UnknownImplementationError,
      );
      expect(() => resolveChartAdapter('IBarChartAdapter', 'recharts')).toThrow(
        /IBarChartAdapter/,
      );
      expect(() => resolveChartAdapter('IBarChartAdapter', 'recharts')).toThrow(/recharts/);
    });

    it('throws UnknownAdapterError for unknown adapterKey', () => {
      expect(() =>
        resolveChartAdapter('IUnknownAdapter' as 'IBarChartAdapter', 'threejs'),
      ).toThrow(UnknownAdapterError);
      expect(() =>
        resolveChartAdapter('IUnknownAdapter' as 'IBarChartAdapter', 'threejs'),
      ).toThrow(/IUnknownAdapter/);
    });
  });
});
