import { type DataSourceMode } from '@/config/generated/data-source-defaults';
import { useEffectiveDataSource } from '@/data-source/useDataSourceOverride';

// OMN-13007: the effective mode honors the runtime chrome override (file/live)
// layered over env, so the data-mode banner and any mode-dependent UI react to
// a runtime switch instead of only reflecting the env default.
export function useDataSourceMode(): DataSourceMode {
  return useEffectiveDataSource().mode;
}

export function isLiveDataSource(mode: DataSourceMode): boolean {
  return mode === 'http' || mode === 'postgres';
}
