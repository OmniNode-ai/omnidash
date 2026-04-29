import { describe, it, expect } from 'vitest';
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
