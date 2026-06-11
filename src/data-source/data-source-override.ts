// OMN-13007 — runtime data-source override seam.
//
// The dashboard's data source (file fixtures vs live projection backend) was
// previously env-only (VITE_DATA_SOURCE / VITE_PROJECTION_API_URL), resolved in
// `projection-base-url.ts`. It was invisible and unswitchable at runtime, so an
// operator could silently run in file mode while every panel showed fixture
// empty-states and the SEA generate widget failed with "Missing data source
// base URL".
//
// This module is the SINGLE override seam. It holds an optional, persisted
// `{ mode, baseUrl }` choice that takes precedence over the env-resolved
// default. Resolution code (`projection-base-url.ts`, `index.ts`,
// `useDataSourceMode`) consults `resolveEffectiveDataSource()` here instead of
// reading `import.meta.env` directly, so there is exactly one place that decides
// the effective source — no per-widget resolution fork.
//
// Persistence: localStorage, keyed per browser instance. "This browser is
// pointed at this backend" is browser-local state, so localStorage (not the
// server-side `/_layouts` layout store) is the correct home. A bad/blocked
// localStorage read degrades to env defaults rather than throwing.

import {
  DATA_SOURCE_DEFAULT_MODE,
  DATA_SOURCE_DEFAULT_URL,
  type DataSourceMode,
} from '@/config/generated/data-source-defaults';

const STORAGE_KEY = 'omnidash.dataSourceOverride.v1';

/** A user-chosen data source that overrides the env-resolved default. */
export interface DataSourceOverride {
  /** Effective mode. 'live' is a UI alias resolved to the live HTTP path. */
  mode: 'live' | 'file';
  /**
   * Absolute backend base URL for live mode (e.g. 'http://100.109.203.94:13002').
   * Ignored in file mode. Empty/undefined means "use the env-resolved base".
   */
  baseUrl?: string;
}

/** Effective data source after merging the override over env defaults. */
export interface EffectiveDataSource {
  /** Concrete snapshot-source mode key used by `createSnapshotSource`. */
  mode: DataSourceMode;
  /**
   * Absolute backend base URL when an override pins one, else null (callers
   * fall back to the env-resolved base). Always null in file mode.
   */
  baseUrl: string | null;
  /** True when a user override is active (drives the chrome's honest labels). */
  isOverridden: boolean;
}

type Listener = () => void;

let current: DataSourceOverride | null = readPersisted();
const listeners = new Set<Listener>();

// Cached effective snapshot with stable identity. `useSyncExternalStore`
// requires getSnapshot to return the SAME reference until the store changes,
// otherwise it loops. We recompute this only on mutation (setter/clear), so the
// React hook gets a referentially-stable value between changes.
let effectiveSnapshot: EffectiveDataSource = computeEffective();

/**
 * Resolve a usable localStorage, or null. Guards both "no window" (SSR-ish) and
 * environments where `window.localStorage` exists but its methods are absent
 * (some jsdom configs) — in those cases we degrade to in-memory-only state.
 */
function getStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  const store = window.localStorage;
  if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') {
    return null;
  }
  return store;
}

function readPersisted(): DataSourceOverride | null {
  const store = getStore();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    // localStorage can throw (privacy mode, disabled). Degrade to env default.
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.mode !== 'live' && obj.mode !== 'file') return null;
  const baseUrl = typeof obj.baseUrl === 'string' ? obj.baseUrl : undefined;
  return { mode: obj.mode, baseUrl };
}

function writePersisted(value: DataSourceOverride | null): void {
  const store = getStore();
  if (!store) return;
  try {
    if (value === null) {
      store.removeItem?.(STORAGE_KEY);
    } else {
      store.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // Best-effort persistence; the in-memory value still drives this session.
  }
}

function notify(): void {
  // Refresh the cached snapshot so the React hook below sees a new reference
  // when (and only when) the effective value actually changed.
  refreshEffectiveSnapshot();
  for (const l of listeners) l();
}

/**
 * Recompute the effective snapshot and swap the cached reference ONLY when the
 * value changed structurally. This keeps `useSyncExternalStore`'s getSnapshot
 * referentially stable between equal reads (no render loop) while still picking
 * up changes from an override mutation OR an `import.meta.env` change (tests).
 */
function refreshEffectiveSnapshot(): EffectiveDataSource {
  const next = computeEffective();
  const prev = effectiveSnapshot;
  if (
    prev.mode === next.mode &&
    prev.baseUrl === next.baseUrl &&
    prev.isOverridden === next.isOverridden
  ) {
    return prev;
  }
  effectiveSnapshot = next;
  return next;
}

/** Current raw override, or null when none is set (env defaults apply). */
export function getDataSourceOverride(): DataSourceOverride | null {
  return current;
}

/**
 * Set the override and persist it. `baseUrl` is trimmed of a trailing slash so
 * it composes cleanly with `/projection/...` paths. Notifies subscribers so the
 * snapshot-source provider can recreate its source.
 */
export function setDataSourceOverride(value: DataSourceOverride): void {
  const normalized: DataSourceOverride =
    value.mode === 'file'
      ? { mode: 'file' }
      : { mode: 'live', baseUrl: value.baseUrl?.replace(/\/$/, '') || undefined };
  current = normalized;
  writePersisted(normalized);
  notify();
}

/** Clear the override, reverting to env-resolved defaults. */
export function clearDataSourceOverride(): void {
  current = null;
  writePersisted(null);
  notify();
}

/** Subscribe to override changes. Returns an unsubscribe function. */
export function subscribeDataSourceOverride(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The env-resolved mode, before any override. */
function envMode(): DataSourceMode {
  return (import.meta.env.VITE_DATA_SOURCE ?? DATA_SOURCE_DEFAULT_MODE) as DataSourceMode;
}

/**
 * Compute the EFFECTIVE data source: override first, then env.
 *
 * - File override -> `{ mode: 'file', baseUrl: null }`.
 * - Live override -> the env http mode (or 'http' if env is file/unset) with the
 *   override's `baseUrl` when provided, else null (env base applies).
 * - No override  -> env mode, baseUrl null (env base applies).
 */
function computeEffective(): EffectiveDataSource {
  const override = current;
  if (!override) {
    return { mode: envMode(), baseUrl: null, isOverridden: false };
  }
  if (override.mode === 'file') {
    return { mode: 'file', baseUrl: null, isOverridden: true };
  }
  // Live override. Keep the env's concrete live mode key when it already is a
  // live mode (http/postgres/sqlite all read via the HTTP projection path);
  // otherwise force 'http'.
  const env = envMode();
  const liveMode: DataSourceMode = env === 'file' ? 'http' : env;
  return { mode: liveMode, baseUrl: override.baseUrl ?? null, isOverridden: true };
}

/**
 * Resolve the EFFECTIVE data source fresh. This is the one function the
 * non-React resolution code (projection-base-url, index, useDataSourceMode)
 * consults so the override is honored everywhere without a per-widget fork.
 * Always recomputes, so callers reading after an `import.meta.env` change in
 * tests see the latest value.
 */
export function resolveEffectiveDataSource(): EffectiveDataSource {
  return computeEffective();
}

/**
 * Referentially-stable effective snapshot for `useSyncExternalStore`. Returns
 * the SAME object identity while the effective value is unchanged (the store
 * contract), but a NEW reference once the value changes — whether from an
 * override mutation or an `import.meta.env` change. React components read this;
 * imperative resolvers use `resolveEffectiveDataSource()`.
 */
export function getEffectiveDataSourceSnapshot(): EffectiveDataSource {
  return refreshEffectiveSnapshot();
}

export { DATA_SOURCE_DEFAULT_URL };
