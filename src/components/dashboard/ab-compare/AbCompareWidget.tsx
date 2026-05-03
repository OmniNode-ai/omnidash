import { useState, useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';

// ── Data types ──────────────────────────────────────────────────────

export interface AbCompareRow {
  correlation_id: string;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  usage_source: string | null;
  created_at: string;
}

// ── Formatting helpers ──────────────────────────────────────────────

function shortModel(id: string): string {
  const parts = id.split('/');
  const name = parts[parts.length - 1];
  return name.replace(/-AWQ.*|-GGUF.*|-Instruct.*|-4bit.*/i, '').substring(0, 22);
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '--';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTokens(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatRunLabel(correlationId: string, iso: string): string {
  const hash = correlationId.slice(-5);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${hash} · ${iso}`;
  const ts = d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${hash} · ${ts}`;
}

// ── Color logic ─────────────────────────────────────────────────────

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
  mid: '#f97316',
  high: 'var(--color-bad, #ef4444)',
};

// ── Multi-metric comparison chart (SVG) ─────────────────────────────

function MultiMetricChart({ rows }: { rows: AbCompareRow[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.estimated_cost_usd ?? 0) - (b.estimated_cost_usd ?? 0)),
    [rows],
  );

  const maxCost = useMemo(() => Math.max(...sorted.map((r) => r.estimated_cost_usd ?? 0), 0.001), [sorted]);
  const maxLatency = useMemo(() => Math.max(...sorted.map((r) => r.latency_ms ?? 0), 1), [sorted]);

  const COL = { model: 150, cost: 160, latency: 160, tokens: 90 };
  const SVG_W = COL.model + COL.cost + COL.latency + COL.tokens + 20;
  const ROW_H = 26;
  const GAP = 4;
  const HEADER_H = 22;
  const SVG_H = HEADER_H + sorted.length * (ROW_H + GAP) + 8;

  const BAR_MAX_W = 90;
  const BAR_H = 10;

  const costX = COL.model;
  const latencyX = COL.model + COL.cost;
  const tokensX = COL.model + COL.cost + COL.latency;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Column headers */}
      <text x={4} y={14} fill="var(--text-tertiary)" fontSize={9} fontWeight={600} textAnchor="start">MODEL</text>
      <text x={costX + 4} y={14} fill="var(--text-tertiary)" fontSize={9} fontWeight={600} textAnchor="start">COST</text>
      <text x={latencyX + 4} y={14} fill="var(--text-tertiary)" fontSize={9} fontWeight={600} textAnchor="start">LATENCY</text>
      <text x={tokensX + 4} y={14} fill="var(--text-tertiary)" fontSize={9} fontWeight={600} textAnchor="start">TOKENS</text>

      {/* Header separator */}
      <line x1={0} y1={HEADER_H - 2} x2={SVG_W} y2={HEADER_H - 2} stroke="var(--line-2)" strokeWidth={0.5} />

      {sorted.map((row, i) => {
        const cost = row.estimated_cost_usd ?? 0;
        const latency = row.latency_ms ?? 0;
        const tier = costTier(cost);
        const color = TIER_COLORS[tier];
        const y = HEADER_H + i * (ROW_H + GAP) + 4;
        const barY = y + (ROW_H - BAR_H) / 2;

        const costBarW = Math.max((cost / maxCost) * BAR_MAX_W, cost === 0 ? 3 : 2);
        const latBarW = latency > 0 ? Math.max((latency / maxLatency) * BAR_MAX_W, 2) : 3;
        const latencyColor = latency > 60000 ? 'var(--color-bad, #ef4444)' : latency > 10000 ? 'var(--color-warn, #f59e0b)' : 'var(--color-good, #22c55e)';

        return (
          <g key={row.model_id}>
            {/* Row background on hover (subtle) */}
            <rect x={0} y={y - 2} width={SVG_W} height={ROW_H} rx={3} fill="transparent" />

            {/* Model name */}
            <text x={4} y={y + ROW_H / 2} dominantBaseline="middle" fill="var(--text-secondary)" fontSize={10.5} fontFamily="var(--font-mono)">
              {shortModel(row.model_id)}
            </text>

            {/* Cost bar + label */}
            <rect x={costX + 4} y={barY} width={BAR_MAX_W} height={BAR_H} rx={2} fill="var(--panel-2)" />
            <rect x={costX + 4} y={barY} width={costBarW} height={BAR_H} rx={2} fill={color} opacity={0.8} />
            <text x={costX + BAR_MAX_W + 10} y={y + ROW_H / 2} dominantBaseline="middle" fill={color} fontSize={10} fontFamily="var(--font-mono)" fontWeight={tier === 'free' ? 600 : 400}>
              {formatCost(cost)}
            </text>

            {/* Latency bar + label */}
            <rect x={latencyX + 4} y={barY} width={BAR_MAX_W} height={BAR_H} rx={2} fill="var(--panel-2)" />
            <rect x={latencyX + 4} y={barY} width={latBarW} height={BAR_H} rx={2} fill={latencyColor} opacity={0.8} />
            <text x={latencyX + BAR_MAX_W + 10} y={y + ROW_H / 2} dominantBaseline="middle" fill={latencyColor} fontSize={10} fontFamily="var(--font-mono)">
              {formatLatency(row.latency_ms)}
            </text>

            {/* Tokens (numeric only) */}
            <text x={tokensX + COL.tokens - 4} y={y + ROW_H / 2} dominantBaseline="middle" textAnchor="end" fill="var(--text-secondary)" fontSize={10} fontFamily="var(--font-mono)">
              {formatTokens(row.total_tokens)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Savings panel ───────────────────────────────────────────────────

function SavingsPanel({ rows }: { rows: AbCompareRow[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.estimated_cost_usd ?? 0) - (b.estimated_cost_usd ?? 0)),
    [rows],
  );

  const maxCost = useMemo(() => Math.max(...sorted.map((r) => r.estimated_cost_usd ?? 0), 0), [sorted]);
  const mostExpensive = useMemo(() => sorted.find((r) => (r.estimated_cost_usd ?? 0) === maxCost), [sorted, maxCost]);

  if (!mostExpensive || maxCost <= 0 || sorted.length < 2) return null;

  // All models except the most expensive
  const others = sorted.filter((r) => r.model_id !== mostExpensive.model_id);

  return (
    <div style={{ borderTop: '1px solid var(--line-2)', padding: '10px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <Text size="xs" family="mono" color="tertiary" transform="uppercase" weight="semibold">
          Savings vs most expensive
        </Text>
        <Text size="xs" family="mono" color="tertiary">
          ({shortModel(mostExpensive.model_id)} {formatCost(maxCost)})
        </Text>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {others.map((row) => {
          const cost = row.estimated_cost_usd ?? 0;
          const saved = maxCost - cost;
          const pct = maxCost > 0 ? ((saved / maxCost) * 100) : 0;
          const pctStr = pct >= 99.9 ? '100' : pct.toFixed(1);
          return (
            <div key={row.model_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text size="xs" family="mono" color="secondary" style={{ width: 150, flexShrink: 0 }} truncate>
                {shortModel(row.model_id)}
              </Text>
              {/* Savings bar */}
              <div style={{ flex: 1, maxWidth: 120, height: 6, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-good, #22c55e)', borderRadius: 3, opacity: 0.7 }} />
              </div>
              <Text size="xs" family="mono" tabularNums weight="semibold" style={{ color: 'var(--color-good, #22c55e)', width: 50, textAlign: 'right' as const }}>
                {pctStr}%
              </Text>
              <Text size="xs" family="mono" tabularNums color="tertiary" style={{ width: 80, textAlign: 'right' as const }}>
                ({formatCost(saved)}/task)
              </Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Table ────────────────────────────────────────────────────

function DetailTable({ rows }: { rows: AbCompareRow[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.estimated_cost_usd ?? 0) - (b.estimated_cost_usd ?? 0)),
    [rows],
  );

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Model', 'P. Tokens', 'C. Tokens', 'Total', 'Cost', 'Latency', 'Source'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: h === 'Model' ? 'left' : 'right',
                  padding: '6px 10px',
                  borderBottom: '1px solid var(--line-2)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Text size="xs" family="mono" color="tertiary" transform="uppercase">{h}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const cost = row.estimated_cost_usd ?? 0;
            const tier = costTier(cost);
            const isCheapest = row === sorted[0] && cost === 0;
            return (
              <tr
                key={row.model_id}
                style={{
                  background: isCheapest ? 'rgba(34,197,94,0.05)' : 'transparent',
                  borderBottom: '1px solid var(--line-2)',
                }}
              >
                <td style={{ padding: '8px 10px' }}>
                  <Text size="sm" family="mono" truncate>{shortModel(row.model_id)}</Text>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <Text size="sm" family="mono" tabularNums color="secondary">{row.prompt_tokens != null ? formatTokens(row.prompt_tokens) : '--'}</Text>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <Text size="sm" family="mono" tabularNums color="secondary">{row.completion_tokens != null ? formatTokens(row.completion_tokens) : '--'}</Text>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <Text size="sm" family="mono" tabularNums color="secondary">{formatTokens(row.total_tokens)}</Text>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <Text size="sm" family="mono" tabularNums weight={tier === 'free' ? 'semibold' : 'regular'} style={{ color: TIER_COLORS[tier] }}>
                    {formatCost(cost)}
                  </Text>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <Text size="sm" family="mono" tabularNums color="secondary">{formatLatency(row.latency_ms)}</Text>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <Text size="sm" family="mono" color={row.usage_source ? 'secondary' : 'tertiary'}>{row.usage_source || '--'}</Text>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Widget ─────────────────────────────────────────────────────

type ViewMode = 'chart' | 'table';

export default function AbCompareWidget({ config: _config }: { config: Record<string, unknown> }) {
  const [mode, setMode] = useState<ViewMode>('chart');
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const { data, isLoading, error } = useProjectionQuery<AbCompareRow>({
    topic: TOPICS.abCompare,
    queryKey: ['ab-compare'],
    refetchInterval: 10_000,
  });

  // Group rows by correlation_id into runs
  const runs = useMemo(() => {
    if (!data || data.length === 0) return [];
    const counted = new Map<string, { id: string; time: string; count: number }>();
    for (const row of data) {
      const entry = counted.get(row.correlation_id);
      if (entry) {
        entry.count++;
        if (row.created_at > entry.time) entry.time = row.created_at;
      } else {
        counted.set(row.correlation_id, { id: row.correlation_id, time: row.created_at, count: 1 });
      }
    }
    return [...counted.values()].sort((a, b) => b.time.localeCompare(a.time));
  }, [data]);

  const activeRunId = selectedRun ?? runs[0]?.id ?? null;

  const runRows = useMemo(() => {
    if (!data || !activeRunId) return [];
    return data.filter((r) => r.correlation_id === activeRunId);
  }, [data, activeRunId]);

  const hasData = runRows.length > 0;

  // Chart | Table toggle
  const modeToggle = (
    <div style={{ display: 'flex', gap: 2 }}>
      {(['chart', 'table'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          style={{
            padding: '2px 10px',
            borderRadius: 4,
            border: '1px solid var(--line)',
            background: mode === m ? 'var(--panel-2)' : 'transparent',
            cursor: 'pointer',
          }}
        >
          <Text size="sm" weight={mode === m ? 'semibold' : 'regular'} color={mode === m ? 'primary' : 'secondary'}>
            {m === 'chart' ? 'Chart' : 'Table'}
          </Text>
        </button>
      ))}
    </div>
  );

  return (
    <ComponentWrapper
      title="AB Model Cost Compare"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!hasData}
      emptyMessage="No comparison data yet"
      emptyHint="Results appear after the first ab-compare run completes"
      headerExtra={modeToggle}
    >
      {hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
          {/* Run selector + summary */}
          {runs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text size="sm" color="secondary">Run:</Text>
                <select
                  value={activeRunId ?? ''}
                  onChange={(e) => setSelectedRun(e.target.value || null)}
                  className="ab-run-select"
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 4,
                    padding: '4px 8px',
                    color: 'var(--text-primary)',
                  }}
                  aria-label="Select run"
                >
                  {runs.map((run, i) => (
                    <option key={run.id} value={run.id}>
                      {formatRunLabel(run.id, run.time)}{i === 0 ? ' — latest' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Text size="xs" family="mono" color="tertiary">
                {runRows.length} models compared on same task
              </Text>
            </div>
          )}

          {/* Chart or Table */}
          {mode === 'chart' ? (
            <MultiMetricChart rows={runRows} />
          ) : (
            <DetailTable rows={runRows} />
          )}

          {/* Per-model savings panel */}
          <SavingsPanel rows={runRows} />
        </div>
      )}
    </ComponentWrapper>
  );
}
