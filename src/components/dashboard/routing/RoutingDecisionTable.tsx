import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useTimezone } from '@/hooks/useTimezone';
import { useFrameStore } from '@/store/store';
import { DataTableThreeJs } from '@/components/charts/threejs/DataTable';
import type { DataTableColumnConfig } from '@shared/types/chart-config';

/**
 * RoutingDecision row shape from the `delegationDecisions` projection.
 *
 * Existing fields (`llm_agent`, `fuzzy_agent`, `agreement`, `llm_confidence`,
 * `fuzzy_confidence`, `cost_usd`) are live in migration 065_create_llm_routing_decisions.sql.
 *
 * SOW G2 enrichment fields (`provider`, `model`, `reason`, `selection_mode`, `fallback`)
 * are optional — upstream emitter (omnimarket node_projection_delegation) and the
 * projection table (omnibase_infra) do not yet emit these columns.
 * UI renders column headers; cells show empty state per `upstreamBlocked` config.
 * Follow-up: omnimarket node_projection_delegation must add these fields.
 */
export interface RoutingDecision {
  id: string;
  created_at: string;
  llm_agent: string;
  fuzzy_agent: string;
  agreement: boolean;
  llm_confidence: number;
  fuzzy_confidence: number;
  cost_usd: number;
  /** SOW G2 — upstream-blocked: not yet emitted by omnimarket. */
  provider?: string;
  /** SOW G2 — upstream-blocked: not yet emitted by omnimarket. */
  model?: string;
  /** SOW G2 — upstream-blocked: not yet emitted by omnimarket. */
  reason?: string;
  /** SOW G2 — upstream-blocked: not yet emitted by omnimarket. */
  selection_mode?: string;
  /** SOW G2 — upstream-blocked: not yet emitted by omnimarket. */
  fallback?: string;
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * Columns for the routing decisions table.
 *
 * SOW G2 enrichment columns (`provider`, `model`, `reason`, `selection_mode`, `fallback`)
 * are included with `upstreamBlocked: true` — the DataTable renders headers but shows
 * empty cells per the `missing-field` EmptyStateReason. These fields are absent from
 * the upstream projection table (omnibase_infra migration 065) and emitter
 * (omnimarket node_projection_delegation). A follow-up ticket is required against
 * omnimarket to add these fields to the event payload and projection table.
 */
const COLUMNS: DataTableColumnConfig[] = [
  { field: 'created_at',       header: 'Timestamp',      sortable: true,  searchable: false, width: 160 },
  { field: 'provider',         header: 'Provider',       sortable: true,  searchable: true,  upstreamBlocked: true },
  { field: 'model',            header: 'Model',          sortable: true,  searchable: true,  upstreamBlocked: true },
  { field: 'reason',           header: 'Reason',         sortable: false, searchable: true,  upstreamBlocked: true },
  { field: 'selection_mode',   header: 'Selection Mode', sortable: true,  searchable: true,  upstreamBlocked: true },
  { field: 'fallback',         header: 'Fallback',       sortable: true,  searchable: true,  upstreamBlocked: true },
  { field: 'llm_agent',        header: 'LLM Agent',      sortable: true,  searchable: true  },
  { field: 'fuzzy_agent',      header: 'Fuzzy Agent',    sortable: true,  searchable: true  },
  { field: 'agreement',        header: 'Agreement',      sortable: true,  searchable: false },
  { field: 'llm_confidence',   header: 'LLM Conf.',      sortable: true,  searchable: false },
  { field: 'fuzzy_confidence', header: 'Fuzzy Conf.',    sortable: true,  searchable: false },
  { field: 'cost_usd',         header: 'Cost',           sortable: true,  searchable: false },
];

function formatTimestamp(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value;
  const time = `${get('hour')}:${get('minute')}${dayPeriod ? ` ${dayPeriod}` : ''}`;
  return `${get('month')}/${get('day')} ${time}`;
}

function toDisplayRow(row: RoutingDecision, tz: string): Record<string, unknown> {
  return {
    ...row,
    created_at: formatTimestamp(row.created_at, tz),
    agreement: row.agreement ? 'Agree' : 'Disagree',
    llm_confidence: `${(row.llm_confidence * 100).toFixed(0)}%`,
    fuzzy_confidence: `${(row.fuzzy_confidence * 100).toFixed(0)}%`,
    cost_usd: `$${row.cost_usd.toFixed(4)}`,
  };
}

export default function RoutingDecisionTable({ config }: { config: Record<string, unknown> }) {
  const rawPageSize = config.pageSize;
  const parsedPageSize =
    typeof rawPageSize === 'number'
      ? rawPageSize
      : typeof rawPageSize === 'string'
        ? Number(rawPageSize)
        : NaN;
  const pageSize =
    Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : DEFAULT_PAGE_SIZE;

  const { data, isLoading, error } = useProjectionQuery<RoutingDecision>({
    topic: TOPICS.delegationDecisions,
    queryKey: ['routing-decisions'],
    refetchInterval: 60_000,
  });

  const tz = useTimezone();
  const timeRange = useFrameStore((s) => s.globalFilters.timeRange);
  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const inRange = useMemo(
    () => applyTimeRange(data, (d) => d.created_at, resolved),
    [data, resolved],
  );

  const displayRows = useMemo(() => inRange.map((row) => toDisplayRow(row, tz)), [inRange, tz]);

  const isEmpty = !data || data.length === 0;

  return (
    <ComponentWrapper
      title="Routing Decisions"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No routing decisions"
      emptyHint="Decisions appear after LLM routing events are recorded"
    >
      {data && !isEmpty && (
        <DataTableThreeJs
          projectionData={displayRows}
          columns={COLUMNS}
          pageSize={pageSize}
          emptyState={{
            defaultMessage: 'No routing decisions',
            reasons: {
              'no-data': { message: 'No routing decisions recorded yet' },
              'missing-field': { message: '' },
              'upstream-blocked': { message: '' },
            },
          }}
        />
      )}
    </ComponentWrapper>
  );
}
