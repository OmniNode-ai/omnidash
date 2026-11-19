// GENERATED — do not edit. Source: contract.yaml
// Regenerate with: npm run generate:config
//
// OMN-10756: data-source defaults are owned by contract.yaml.
// Env vars (VITE_DATA_SOURCE, VITE_SQLITE_DATA_SOURCE_URL, VITE_HTTP_DATA_SOURCE_URL)
// are optional overrides; these values are the canonical defaults.

export type DataSourceMode = 'sqlite' | 'postgres' | 'file' | 'http';

export const DATA_SOURCE_DEFAULT_MODE: DataSourceMode = "http";
export const DATA_SOURCE_DEFAULT_URL: string = "";
export const DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: string = "~/.omninode/delegation/delegation.sqlite";

// OMN-18159: the tenant tenant-scoped exposures are read as. Empty means none
// is configured, and every tenant-scoped exposure then refuses rather than
// being read unscoped.
export const PROJECTION_TENANT_ID_DEFAULT: string = "";

// OMN-26056: the one refresh interval in seconds (src/theme/refresh.ts reads it) and the decisions record window, the
// number of runs one decisions page asks for (0 = no limit sent, the server's own page of 500). Both are declared in
// contract.yaml's refresh section and may be named by a deployment overlay (contract.local.yaml).
export const REFRESH_INTERVAL_SECONDS_DEFAULT: number = 30;
export const DECISIONS_PAGE_LIMIT_DEFAULT: number = 0;
