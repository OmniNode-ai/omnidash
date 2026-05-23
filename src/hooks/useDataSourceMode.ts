import { DATA_SOURCE_DEFAULT_MODE, type DataSourceMode } from '@/config/generated/data-source-defaults';

export function useDataSourceMode(): DataSourceMode {
  return (import.meta.env.VITE_DATA_SOURCE ?? DATA_SOURCE_DEFAULT_MODE) as DataSourceMode;
}

export function isLiveDataSource(mode: DataSourceMode): boolean {
  return mode === 'http' || mode === 'postgres';
}
