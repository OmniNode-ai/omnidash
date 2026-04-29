/**
 * KPITileCluster — three.js-styled KPI tile grid implementing IKPITileClusterAdapter.
 *
 * Renders a responsive grid of metric tiles. Each tile shows a label and value.
 * Visual style (palette, spacing, font) is consistent with existing three.js widgets
 * via CSS tokens from globals.css.
 *
 * Per-tile honest-null: if a tile's `field` is absent or null on the first projection
 * row, that tile renders its configured empty state with the appropriate reason code.
 * The cluster does NOT collapse to a global empty state unless projectionData is empty.
 *
 * Adapter input contract: projectionData is pre-reduced, canonically ordered,
 * and contract-valid. This component maps fields and renders ONLY.
 */
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Text } from '@/components/ui/typography';
import type {
  IKPITileClusterAdapter,
  KPITileClusterAdapterProps,
} from '@/../../shared/types/chart-adapter-kpi';
import type { EmptyStateConfig, EmptyStateReason, KPITileMetricConfig } from '@/../../shared/types/chart-config';

const DEFAULT_EMPTY_MESSAGES: Record<EmptyStateReason, string> = {
  'no-data': 'No data available',
  'missing-field': 'Field not in projection',
  'upstream-blocked': 'Upstream pipeline blocked',
  'schema-invalid': 'Projection schema invalid',
};

interface TileState {
  config: KPITileMetricConfig;
  value: string | null;
  emptyReason: EmptyStateReason | null;
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatValue(raw: unknown, format?: string): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    if (format) {
      // Attempt d3-style format heuristics for common patterns.
      if (format.includes('$')) {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }).format(raw);
      }
      if (format.includes('%')) {
        return new Intl.NumberFormat('en-US', {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(raw);
      }
      return new Intl.NumberFormat('en-US').format(raw);
    }
    return new Intl.NumberFormat('en-US').format(raw);
  }
  return String(raw);
}

function resolveTileState(
  config: KPITileMetricConfig,
  row: Record<string, unknown> | null,
  clusterEmpty: EmptyStateReason | null,
): TileState {
  if (clusterEmpty !== null) {
    return { config, value: null, emptyReason: clusterEmpty };
  }
  if (row === null) {
    return { config, value: null, emptyReason: 'no-data' };
  }
  if (!(config.field in row)) {
    return { config, value: null, emptyReason: 'missing-field' };
  }
  const raw = row[config.field];
  if (raw === null || raw === undefined) {
    return { config, value: null, emptyReason: 'missing-field' };
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { config, value: null, emptyReason: 'schema-invalid' };
  }
  return { config, value: formatValue(raw, config.format), emptyReason: null };
}

function TileEmpty({
  config,
  reason,
  clusterEmptyState,
}: {
  config: KPITileMetricConfig;
  reason: EmptyStateReason;
  clusterEmptyState: EmptyStateConfig | undefined;
}): ReactElement {
  const tileEmpty = config.emptyState;
  const message =
    tileEmpty?.reasons?.[reason]?.message ??
    tileEmpty?.defaultMessage ??
    clusterEmptyState?.reasons?.[reason]?.message ??
    clusterEmptyState?.defaultMessage ??
    DEFAULT_EMPTY_MESSAGES[reason];
  const cta = tileEmpty?.reasons?.[reason]?.cta ?? clusterEmptyState?.reasons?.[reason]?.cta;

  return (
    <div
      data-testid={`kpi-tile-${slugify(config.label)}`}
      data-empty-reason={reason}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
      }}
    >
      <Text size="xs" color="tertiary" transform="uppercase" className="text-tracked">
        {config.label}
      </Text>
      <Text size="lg" color="tertiary">
        {message}
      </Text>
      {cta && (
        <Text size="sm" color="tertiary" style={{ opacity: 0.7 }}>
          {cta}
        </Text>
      )}
    </div>
  );
}

function TilePopulated({
  config,
  value,
}: {
  config: KPITileMetricConfig;
  value: string;
}): ReactElement {
  return (
    <div
      data-testid={`kpi-tile-${slugify(config.label)}`}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
      }}
    >
      <Text size="xs" color="tertiary" transform="uppercase" className="text-tracked">
        {config.label}
      </Text>
      <Text size="2xl" weight="semibold" color="primary" tabularNums>
        {value}
      </Text>
    </div>
  );
}

export function KPITileCluster<T extends Record<string, unknown> = Record<string, unknown>>(
  props: KPITileClusterAdapterProps<T>,
): ReactElement {
  const { projectionData, tiles, emptyState } = props;

  const rows = projectionData as Record<string, unknown>[];
  const firstRow = rows.length > 0 ? rows[0] : null;
  const clusterEmptyReason: EmptyStateReason | null = rows.length === 0 ? 'no-data' : null;

  const tileStates = useMemo(
    () => tiles.map((cfg) => resolveTileState(cfg, firstRow, clusterEmptyReason)),
    [tiles, firstRow, clusterEmptyReason],
  );

  // Show cluster-level empty state when projectionData is empty and no tiles configured.
  if (tiles.length === 0 || (clusterEmptyReason !== null && tiles.length === 0)) {
    const message = emptyState?.defaultMessage ?? DEFAULT_EMPTY_MESSAGES['no-data'];
    return (
      <div
        data-testid="kpi-tile-cluster"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text color="tertiary">{message}</Text>
      </div>
    );
  }

  return (
    <div
      data-testid="kpi-tile-cluster"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(160px, 1fr))`,
        gap: 'var(--row-gap)',
        width: '100%',
      }}
    >
      {tileStates.map((ts) =>
        ts.emptyReason !== null ? (
          <TileEmpty
            key={ts.config.field}
            config={ts.config}
            reason={ts.emptyReason}
            clusterEmptyState={emptyState}
          />
        ) : (
          <TilePopulated key={ts.config.field} config={ts.config} value={ts.value!} />
        ),
      )}
    </div>
  );
}

// Compile-time proof that KPITileCluster satisfies IKPITileClusterAdapter.
const _typeCheck: IKPITileClusterAdapter = KPITileCluster;
void _typeCheck;

/** Named alias used by the adapter resolver to identify the threejs implementation. */
export const KPITileClusterThreeJs: IKPITileClusterAdapter = KPITileCluster as IKPITileClusterAdapter;
