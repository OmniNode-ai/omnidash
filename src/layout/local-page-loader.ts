import type { ProjectionSnapshot, ProtocolSnapshotSource } from '../data-source/protocol-snapshot-source';
import type { ModelComponentContract } from '../shared/types/generated/onex-models';

export type LocalPageName = 'overview' | 'runs' | 'workflow' | 'usage' | 'credentials' | 'api-keys';
export type LocalPageEmptyState = 'NO_RUNS_YET' | 'BASELINE_UNRESOLVED';

/** Narrow dashboard fields consumed by this renderer; the YAML itself is a core config. */
export interface LocalDashboardView {
  dashboard_id: string;
  name: string;
  description?: string | null;
  layout: { columns: number; row_height: number; gap: number; responsive: boolean };
  widgets: Array<Record<string, unknown>>;
  refresh_interval_seconds?: number | null;
  theme?: string;
}

export interface LocalPageDocument {
  dashboard: LocalDashboardView;
  components: ModelComponentContract[];
  empty_state_reasons: LocalPageEmptyState[];
}

export interface LocalPageLoadOptions {
  mode: 'http' | 'file';
  availableTopics: ReadonlySet<string>;
}

/** Why one exposure's read gave no rows: the census does not serve it, it answered an error, or it never answered. */
export interface ProjectionReadFailure {
  kind: 'not-served' | 'error' | 'timeout';
  message: string;
}

export interface BoundProjectionSnapshot extends ProjectionSnapshot {
  topic: string;
  /** Set when this read failed; its rows are then the last good rows, or none. */
  failure?: ProjectionReadFailure;
  /** When the rows shown were read, if a later read failed. */
  lastGoodAt?: string | null;
}

/** A read with no answer in this long is a typed timeout (requirements: loading turns into an error after 5 s). */
export const LOCAL_READ_TIMEOUT_MS = 5000;

export const DELEGATION_SAVINGS_TOPIC = 'onex.snapshot.projection.delegation.savings.v1';

const pageFiles = import.meta.glob('../pages/local/*.page.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
const contractFiles = import.meta.glob('../pages/local/*.contracts.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDashboardView(value: unknown): value is LocalDashboardView {
  return isRecord(value)
    && typeof value.dashboard_id === 'string'
    && typeof value.name === 'string'
    && isRecord(value.layout)
    && Array.isArray(value.widgets);
}

function isComponentContract(value: unknown): value is ModelComponentContract {
  if (!isRecord(value) || typeof value.component_id !== 'string' || typeof value.title !== 'string') return false;
  if (!['chart', 'table', 'metric_card', 'status_grid', 'event_feed'].includes(String(value.component_kind))) return false;
  if (!isRecord(value.contract_version) || !Array.isArray(value.data_bindings)) return false;
  return value.data_bindings.every((binding) => isRecord(binding)
    && typeof binding.binding_id === 'string'
    && typeof binding.projection_topic === 'string'
    && typeof binding.ordering_authority_field === 'string');
}

/** Load a dashboard and its component/binding contracts from JSON-compatible YAML. */
export function loadLocalPageConfig(page: LocalPageName): LocalPageDocument {
  const configPath = `../pages/local/${page}.page.yaml`;
  const contractsPath = `../pages/local/${page}.contracts.yaml`;
  const configSource = pageFiles[configPath];
  const contractsSource = contractFiles[contractsPath];
  if (typeof configSource !== 'string' || typeof contractsSource !== 'string') {
    throw new Error(`Local dashboard page or component contracts are missing: ${page}`);
  }
  const dashboard: unknown = JSON.parse(configSource);
  const contracts: unknown = JSON.parse(contractsSource);
  if (!isDashboardView(dashboard) || !isRecord(contracts) || !Array.isArray(contracts.components)) {
    throw new Error(`Local dashboard page is invalid: ${page}`);
  }
  const emptyStates = contracts.page_empty_state_reasons;
  if (!Array.isArray(emptyStates) || !emptyStates.every((reason) => reason === 'NO_RUNS_YET' || reason === 'BASELINE_UNRESOLVED')) {
    throw new Error(`Local dashboard page empty-state contract is invalid: ${page}`);
  }
  if (!contracts.components.every(isComponentContract)) {
    throw new Error(`Local dashboard component contract is invalid: ${page}`);
  }
  return {
    dashboard,
    components: contracts.components,
    empty_state_reasons: emptyStates,
  };
}

/**
 * Read the declared exposures through the HTTP projection source only. One exposure that is not served, answers an
 * error or never answers fails only its own snapshot (the widgets bound to it say why); the page still loads.
 */
export async function loadLocalPageSnapshots(
  page: LocalPageDocument,
  source: ProtocolSnapshotSource,
  options: LocalPageLoadOptions,
): Promise<BoundProjectionSnapshot[]> {
  if (options.mode !== 'http') {
    throw new Error('Local dashboard pages require HTTP mode for runtime exposures');
  }
  if (!source.readSnapshot) throw new Error('HTTP snapshot source does not support snapshots');
  const read = source.readSnapshot.bind(source);
  const topics = new Set(
    page.components.flatMap((component) =>
      (component.data_bindings ?? []).map((binding) => binding.projection_topic),
    ),
  );
  return Promise.all([...topics].map(async (topic): Promise<BoundProjectionSnapshot> => {
    if (!options.availableTopics.has(topic)) {
      return failedSnapshot(topic, { kind: 'not-served', message: `Not served: ${topic}` });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), LOCAL_READ_TIMEOUT_MS); });
    try {
      const answer = await Promise.race([read(topic), timeout]);
      if (answer === 'timeout') return failedSnapshot(topic, { kind: 'timeout', message: `${topic}: no answer in 5 s` });
      return { topic, ...answer };
    } catch (cause) {
      return failedSnapshot(topic, { kind: 'error', message: readErrorMessage(topic, cause) });
    } finally {
      clearTimeout(timer);
    }
  }));
}

function failedSnapshot(topic: string, failure: ProjectionReadFailure): BoundProjectionSnapshot {
  return { topic, rows: [], rowCount: 0, dataFreshness: 'unknown', latestEventAt: null, readAt: new Date().toISOString(), failure };
}

/** "<exposure>: HTTP 503 ..." from the source's "Projection <exposure> failed: HTTP 503 ..." (never a bare message). */
function readErrorMessage(topic: string, cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  const status = /HTTP \d{3}.*$/.exec(text)?.[0];
  return `${topic}: ${status ?? text}`;
}

/**
 * The next snapshots, keeping a topic's last good rows on screen when its new read failed; the failure and the
 * time those rows were read stay on the snapshot so the widget can say so.
 */
export function withLastGood(
  previous: readonly BoundProjectionSnapshot[],
  next: readonly BoundProjectionSnapshot[],
): BoundProjectionSnapshot[] {
  return next.map((snapshot) => {
    if (!snapshot.failure) return snapshot;
    const prior = previous.find((candidate) => candidate.topic === snapshot.topic);
    if (!prior || (prior.failure && prior.lastGoodAt === undefined)) return snapshot;
    return { ...prior, failure: snapshot.failure, lastGoodAt: prior.failure ? prior.lastGoodAt : prior.readAt };
  });
}

/** Return display rows for a component, unpacking known projection envelopes. */
export function rowsForLocalComponent(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): unknown[] {
  return rowsForLocalBinding(component, snapshots, 0);
}

/**
 * Rows of one of a component's bindings, unpacking known projection envelopes. Binding 0 supplies the component's
 * rows; a later binding is a lookup the component joins by a served id (a run's cost, a session's decision).
 */
export function rowsForLocalBinding(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
  index: number,
): unknown[] {
  const topic = component.data_bindings?.[index]?.projection_topic;
  if (topic === undefined) return [];
  const rows = snapshots.find((snapshot) => snapshot.topic === topic)?.rows ?? [];
  if (topic !== DELEGATION_SAVINGS_TOPIC) return [...rows];
  return rows.flatMap((value) => {
    if (!isRecord(value) || !Array.isArray(value.sessions)) return [];
    return value.sessions.filter(isRecord);
  });
}

/** Keep the two domain-specific empty states explicit instead of substituting zero. */
export function resolveLocalPageEmptyState(
  page: LocalPageDocument,
  snapshots: readonly BoundProjectionSnapshot[],
): LocalPageEmptyState | null {
  const rows = page.components.flatMap((component) => rowsForLocalComponent(component, snapshots));
  // Only a component's first binding supplies its rows; a second binding is a caption (the savings card's baseline
  // line), so it must not switch a page into the Runs session-row rules.
  const rendersSessionRows = page.components.some((component) =>
    component.data_bindings?.[0]?.projection_topic === DELEGATION_SAVINGS_TOPIC,
  );
  if (!rendersSessionRows && rows.some((value) => {
    if (!isRecord(value)) return false;
    return value.baseline_state === 'BASELINE_UNRESOLVED'
      || value.savings_usd === null
      || (value.baseline_model === null && value.savings_usd === 0);
  }) && page.empty_state_reasons.includes('BASELINE_UNRESOLVED')) {
    return 'BASELINE_UNRESOLVED';
  }
  // A failed read is not an empty store: the widgets bound to it say why, and the page is not NO_RUNS_YET.
  if (snapshots.some((snapshot) => snapshot.failure)) return null;
  if (rows.length === 0 && page.empty_state_reasons.includes('NO_RUNS_YET')) {
    return 'NO_RUNS_YET';
  }
  return null;
}
