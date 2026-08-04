import { useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { KPI, SortableTable } from '@/components/primitives';
import type { ColumnDef } from '@/components/primitives';
import { Text } from '@/components/ui/typography';

// ── Projection row shape ─────────────────────────────────────────────
//
// Row shape from onex.snapshot.projection.cost.summary.v1, which is a
// direct passthrough of llm_cost_aggregates (omnimarket
// node_projection_cost_summary contract.yaml `projection_api.columns`):
// aggregation_key, window, total_cost_usd, total_tokens, call_count,
// updated_at. There is no discrete model_name/bucket_time/request_count
// column — `window` (an enum of '24h' | '7d' | '30d' rolling snapshots,
// not a per-request timestamp) is the only time dimension the table
// carries, and `aggregation_key` is an opaque composite string (the
// dimension — e.g. a specific model, repo, or session — is encoded inside
// it upstream, not decoded server-side for this topic). This widget
// renders exactly those fields; it does not invent a model_name field
// client-side.
export interface CostAggregateRow {
  aggregation_key: string;
  window: CostAggregationWindow;
  total_cost_usd: number | string;
  total_tokens: number;
  call_count: number;
  updated_at?: string;
}

export type CostAggregationWindow = '24h' | '7d' | '30d';

const WINDOWS: CostAggregationWindow[] = ['24h', '7d', '30d'];

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationCostBreakdownConfig {
  defaultWindow?: CostAggregationWindow;
}

// ── Formatters ────────────────────────────────────────────────────────

function fmtUsd(v: number): string {
  return `$${v.toFixed(v < 1 ? 4 : 2)}`;
}

function fmtTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function toNumber(v: number | string): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Purely presentational: aggregation_key is an opaque server-authored
// string. Known prefixes ("model:", "repo:", "session:...;model:") are
// stripped for readability only — the full raw key is always available
// via the row's title attribute. Unrecognized formats render unchanged.
function formatAggregationKey(key: string): string {
  const modelMatch = /(?:^|;)model:([^;]+)/.exec(key);
  if (modelMatch) return modelMatch[1];
  const repoMatch = /^repo:(.+)$/.exec(key);
  if (repoMatch) return repoMatch[1];
  return key;
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationCostBreakdownWidget(props: { config: DelegationCostBreakdownConfig }) {
  const { config } = props;
  const [selectedWindow, setSelectedWindow] = useState<CostAggregationWindow>(
    config.defaultWindow ?? '24h',
  );

  const { data, isLoading, error } = useProjectionQuery<CostAggregateRow>({
    queryKey: ['delegation-cost-breakdown', TOPICS.costSummary],
    topic: TOPICS.costSummary,
    refetchInterval: 5_000,
  });

  const rows = useMemo(() => data ?? [], [data]);

  const windowRows = useMemo(
    () => rows.filter((r) => r.window === selectedWindow),
    [rows, selectedWindow],
  );

  const totals = useMemo(() => {
    let cost = 0;
    let tokens = 0;
    let calls = 0;
    for (const r of windowRows) {
      cost += toNumber(r.total_cost_usd);
      tokens += r.total_tokens ?? 0;
      calls += r.call_count ?? 0;
    }
    return { cost, tokens, calls };
  }, [windowRows]);

  const columns: ColumnDef<CostAggregateRow>[] = [
    {
      key: 'aggregation_key',
      label: 'Key',
      width: 'minmax(140px, 2fr)',
      sortValue: (r) => r.aggregation_key,
      render: (r) => (
        <span title={r.aggregation_key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {formatAggregationKey(r.aggregation_key)}
        </span>
      ),
    },
    {
      key: 'total_cost_usd',
      label: 'Cost',
      width: '1fr',
      align: 'right',
      mono: true,
      sortValue: (r) => toNumber(r.total_cost_usd),
      render: (r) => fmtUsd(toNumber(r.total_cost_usd)),
    },
    {
      key: 'total_tokens',
      label: 'Tokens',
      width: '1fr',
      align: 'right',
      mono: true,
      sortValue: (r) => r.total_tokens ?? 0,
      render: (r) => fmtTokens(r.total_tokens ?? 0),
    },
    {
      key: 'call_count',
      label: 'Calls',
      width: '1fr',
      align: 'right',
      mono: true,
      sortValue: (r) => r.call_count ?? 0,
      render: (r) => (r.call_count ?? 0).toLocaleString(),
    },
  ];

  const isEmpty = !isLoading && !error && windowRows.length === 0;

  return (
    <ComponentWrapper
      title="Cost Breakdown"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No cost data for this window"
      emptyHint="Cost breakdown appears once llm_cost_aggregates is populated for the selected window (OMN-14896)."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Window selector — the only time-period dimension llm_cost_aggregates carries */}
        <div className="seg" role="tablist" aria-label="Aggregation window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={selectedWindow === w}
              className={`seg-btn${selectedWindow === w ? ' is-on' : ''}`}
              onClick={() => setSelectedWindow(w)}
            >
              {w}
            </button>
          ))}
        </div>

        {!isEmpty && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
                paddingBottom: 12,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <KPI label="Total cost" value={totals.cost} prefix="$" decimals={2} tone="default" />
              <KPI label="Total tokens" value={totals.tokens} tone="accent" />
              <KPI label="Calls" value={totals.calls} tone="default" />
            </div>

            <SortableTable
              rows={windowRows}
              columns={columns}
              initialSort={{ key: 'total_cost_usd', dir: 'desc' }}
              rowKey="aggregation_key"
            />
          </>
        )}

        <Text as="span" size="xs" color="tertiary">
          Source: llm_cost_aggregates {'·'} window: {selectedWindow}
        </Text>
      </div>
    </ComponentWrapper>
  );
}
