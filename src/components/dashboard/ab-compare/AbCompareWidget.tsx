// AB Model Cost Comparison Widget — OMN-10490
//
// Reads from onex.snapshot.projection.ab-compare.v1 via useProjectionQuery
// and renders a cost comparison table grouped by correlation_id (run).
// Rows are sorted by cost_usd ascending so the cheapest model anchors top.
// Local models ($0.00) are highlighted green; cloud models amber/red by cost.
// A savings summary ("You could save $X vs most expensive") anchors the bottom.
//
// Auto-refreshes every 10 s. Shows a prompt to run ab-compare CLI when empty.
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';

export interface AbCompareRow {
  correlation_id: string;
  model_key: string;
  display_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  quality: string;
  error: string;
  created_at: string;
}

// ---- formatting helpers ----

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTokens(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---- cost colour logic ----

type CostTier = 'free' | 'low' | 'mid' | 'high';

function costTier(usd: number): CostTier {
  if (usd === 0) return 'free';
  if (usd < 0.002) return 'low';
  if (usd < 0.01) return 'mid';
  return 'high';
}

const TIER_COLORS: Record<CostTier, string> = {
  free: 'var(--color-good, #22c55e)',
  low: 'var(--color-warn, #f59e0b)',
  mid: 'var(--color-warn, #f97316)',
  high: 'var(--color-bad, #ef4444)',
};

// ---- main component ----

export default function AbCompareWidget({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<AbCompareRow>({
    topic: TOPICS.abCompare,
    queryKey: ['ab-compare'],
    refetchInterval: 10_000,
  });

  // Group rows by correlation_id, take the most-recent run
  const latestRows = useMemo<AbCompareRow[]>(() => {
    if (!data || data.length === 0) return [];

    // Find the most recent correlation_id by created_at
    const latestCorrelation = [...data].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0].correlation_id;

    // All rows for that correlation_id, sorted by cost ascending
    return data
      .filter((r) => r.correlation_id === latestCorrelation)
      .sort((a, b) => a.cost_usd - b.cost_usd);
  }, [data]);

  const savings = useMemo(() => {
    if (latestRows.length < 2) return null;
    const costs = latestRows.map((r) => r.cost_usd);
    const max = Math.max(...costs);
    const min = Math.min(...costs);
    const diff = max - min;
    if (diff <= 0) return null;
    const pct = max > 0 ? ((diff / max) * 100).toFixed(0) : '0';
    return { diff, pct };
  }, [latestRows]);

  const hasData = latestRows.length > 0;

  return (
    <ComponentWrapper
      title="AB Model Cost Compare"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!hasData}
      emptyMessage="No comparison data yet — run `ab-compare` CLI"
      emptyHint="Results appear after the first ab-compare run completes"
    >
      {hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
          {/* Table */}
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    'Model',
                    'Tokens',
                    'Cost',
                    'Latency',
                    'Quality',
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: h === 'Model' ? 'left' : 'right',
                        padding: '6px 10px',
                        borderBottom: '1px solid var(--line-2)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Text
                        size="xs"
                        family="mono"
                        color="tertiary"
                        transform="uppercase"
                      >
                        {h}
                      </Text>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latestRows.map((row, idx) => {
                  const tier = costTier(row.cost_usd);
                  const isError = Boolean(row.error);
                  const isCheapest = idx === 0;

                  return (
                    <tr
                      key={row.model_key}
                      style={{
                        background:
                          isCheapest
                            ? 'var(--panel-highlight, rgba(34,197,94,0.05))'
                            : 'transparent',
                        borderBottom: '1px solid var(--line-2)',
                      }}
                    >
                      {/* Model name */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Cheapest crown indicator */}
                          {isCheapest && (
                            <Text
                              as="span"
                              size="md"
                              title="Lowest cost"
                              aria-label="lowest cost"
                              style={{ color: TIER_COLORS.free, flexShrink: 0 }}
                            >
                              ★
                            </Text>
                          )}
                          <Text size="sm" family="mono" truncate>
                            {row.display_name || row.model_key}
                          </Text>
                        </div>
                      </td>

                      {/* Total tokens */}
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <Text size="sm" family="mono" tabularNums color="secondary">
                          {formatTokens(row.total_tokens)}
                        </Text>
                      </td>

                      {/* Cost — coloured by tier */}
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <Text
                          size="sm"
                          family="mono"
                          tabularNums
                          weight={tier === 'free' ? 'semibold' : 'regular'}
                          style={{ color: TIER_COLORS[tier] }}
                        >
                          {formatCost(row.cost_usd)}
                        </Text>
                      </td>

                      {/* Latency */}
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <Text size="sm" family="mono" tabularNums color="secondary">
                          {row.latency_ms > 0 ? formatLatency(row.latency_ms) : '—'}
                        </Text>
                      </td>

                      {/* Quality / error */}
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {isError ? (
                          <Text size="sm" family="mono" color="bad">
                            {row.error.length > 20 ? `${row.error.slice(0, 20)}…` : row.error}
                          </Text>
                        ) : (
                          <Text
                            size="sm"
                            family="mono"
                            color={row.quality === 'pass' ? 'ok' : row.quality ? 'secondary' : 'tertiary'}
                          >
                            {row.quality || '—'}
                          </Text>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Savings summary footer */}
          {savings && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 6,
                border: '1px solid var(--line-2)',
                background: 'var(--panel-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Text as="span" size="lg" style={{ color: TIER_COLORS.free }}>💰</Text>
              <div>
                <Text size="sm" family="mono" weight="semibold" style={{ color: TIER_COLORS.free }}>
                  Save {savings.pct}% ({formatCost(savings.diff)})
                </Text>
                <Text
                  as="div"
                  size="xs"
                  family="mono"
                  color="tertiary"
                >
                  choosing{' '}
                  <Text as="span" size="xs" family="mono" weight="semibold" color="secondary">
                    {latestRows[0].display_name || latestRows[0].model_key}
                  </Text>
                  {' '}vs most expensive
                </Text>
              </div>
            </div>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
