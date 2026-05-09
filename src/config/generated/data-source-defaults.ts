// GENERATED — do not edit. Source: contract.yaml
// Regenerate with: npm run generate:config
//
// OMN-10756: data-source defaults are owned by contract.yaml.
// Env vars (VITE_DATA_SOURCE, VITE_SQLITE_DATA_SOURCE_URL, VITE_HTTP_DATA_SOURCE_URL)
// are optional overrides; these values are the canonical defaults.

export type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

export const DATA_SOURCE_DEFAULT_MODE: DataSourceMode = "sqlite";
export const DATA_SOURCE_DEFAULT_URL: string = "http://localhost:3002";
export const DATA_SOURCE_DEFAULT_WS_URL: string = "ws://localhost:3002/ws";
export const DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: string = "~/.omninode/delegation/delegation.sqlite";
