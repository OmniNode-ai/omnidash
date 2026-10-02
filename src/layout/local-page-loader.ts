import type { ProjectionSnapshot, ProtocolSnapshotSource } from '../data-source/protocol-snapshot-source';
import type { ModelComponentContract } from '../shared/types/generated/onex-models';

export type LocalPageName = 'overview' | 'runs';
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

export interface BoundProjectionSnapshot extends ProjectionSnapshot {
  topic: string;
}

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

/** Read the declared exposures through the HTTP projection source only. */
export async function loadLocalPageSnapshots(
  page: LocalPageDocument,
  source: ProtocolSnapshotSource,
  options: LocalPageLoadOptions,
): Promise<BoundProjectionSnapshot[]> {
  if (options.mode !== 'http') {
    throw new Error('Local dashboard pages require HTTP mode for runtime exposures');
  }
  if (!source.readSnapshot) throw new Error('HTTP snapshot source does not support snapshots');
  const topics = new Set(
    page.components.flatMap((component) =>
      (component.data_bindings ?? []).map((binding) => binding.projection_topic),
    ),
  );
  for (const topic of topics) {
    if (!options.availableTopics.has(topic)) {
      throw new Error(`Projection exposure is not served: ${topic}`);
    }
  }
  return Promise.all([...topics].map(async (topic) => ({
    topic,
    ...await source.readSnapshot!(topic),
  })));
}

/** Return display rows for a component, unpacking known projection envelopes. */
export function rowsForLocalComponent(
  component: LocalPageDocument['components'][number],
  snapshots: readonly BoundProjectionSnapshot[],
): unknown[] {
  const topic = component.data_bindings?.[0]?.projection_topic;
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
  if (rows.length === 0 && page.empty_state_reasons.includes('NO_RUNS_YET')) {
    return 'NO_RUNS_YET';
  }
  return null;
}
