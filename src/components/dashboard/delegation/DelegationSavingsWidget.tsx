import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';

// ── Projection types (from savings_estimates SQLite table, OMN-10623) ─

export interface DelegationSavingsSession {
  session_id: string;
  task_type?: string;
  local_cost_usd: number;
  cloud_cost_usd: number;
  savings_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  savings_method: 'measured' | 'estimated';
  usage_source: 'measured' | 'estimated' | 'unknown';
  /** Model used for this session (from delegation_events.model_name). */
  model_name?: string;
  /** Total prompt tokens (from llm_call_metrics.prompt_tokens). */
  prompt_tokens?: number;
  /** Total completion tokens (from llm_call_metrics.completion_tokens). */
  completion_tokens?: number;
  /** Delegation latency in ms (from delegation_events.latency_ms). */
  latency_ms?: number;
  created_at: string;
}

export interface DelegationSavingsProjection {
  cumulative_savings_usd: number;
  cumulative_local_cost_usd: number;
  cumulative_cloud_cost_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  session_count: number;
  sessions: DelegationSavingsSession[];
  captured_at: string;
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationSavingsConfig {
  showSessions?: boolean;
  maxSessions?: number;
}

// ── Formatters ────────────────────────────────────────────────────────

function fmtUsd(v: number): string {
  return v === 0 ? '$0.00' : `$${v.toFixed(v < 0.01 ? 4 : 2)}`;
}

function fmtDate(value: string | number): string {
  try {
    // Handle unix timestamps (seconds or milliseconds) and ISO strings
    let ts: number;
    if (typeof value === 'number') {
      // If it looks like seconds (< 1e12), convert to ms
      ts = value < 1e12 ? value * 1000 : value;
    } else {
      const parsed = Number(value);
      if (!isNaN(parsed) && parsed > 1e9) {
        ts = parsed < 1e12 ? parsed * 1000 : parsed;
      } else {
        ts = new Date(value).getTime();
      }
    }
    if (isNaN(ts)) return String(value);
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return String(value);
  }
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

function fmtTokens(prompt: number | undefined, completion: number | undefined): string {
  const p = prompt ?? 0;
  const c = completion ?? 0;
  if (p === 0 && c === 0) return '—';
  const total = p + c;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}K`;
  return String(total);
}

// ── Session row ───────────────────────────────────────────────────────
//
// Columns: Task | Model | Tokens | Latency | Opus Est. | Local | Saved | Date
// Proportional grid fills available space.

const GRID_COLS = '2fr 2fr 1fr 1fr 1fr 1fr 1fr 1fr';

function SessionRow({ s }: { s: DelegationSavingsSession }) {
  const rowLabel = s.task_type ?? s.session_id.slice(0, 20);
  const modelShort = s.model_name?.replace('local-', '').replace('-30b', '') ?? '—';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLS,
        gap: 6,
        padding: '5px 0',
        borderBottom: '1px solid var(--line-2)',
        alignItems: 'center',
      }}
    >
      <Text as="span" size="sm" family="mono" color="primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {rowLabel}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary" title={s.model_name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {modelShort}
      </Text>
      <Text as="span" size="xs" family="mono" tabularNums color="secondary" style={{ textAlign: 'right' }}>
        {fmtTokens(s.prompt_tokens, s.completion_tokens)}
      </Text>
      <Text as="span" size="xs" family="mono" tabularNums color="secondary" style={{ textAlign: 'right' }}>
        {s.latency_ms != null ? fmtMs(s.latency_ms) : '—'}
      </Text>
      <Text as="span" size="sm" family="mono" tabularNums color="tertiary" style={{ textAlign: 'right' }}>
        {fmtUsd(s.cloud_cost_usd)}
      </Text>
      <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
        {fmtUsd(s.local_cost_usd)}
      </Text>
      <Text as="span" size="sm" family="mono" tabularNums weight="semibold" style={{ textAlign: 'right', color: s.savings_usd > 0 ? 'var(--good)' : 'var(--ink-3)' }}>
        {s.savings_usd > 0 ? `+${fmtUsd(s.savings_usd)}` : '—'}
      </Text>
      <Text as="span" size="xs" family="mono" color="tertiary" style={{ textAlign: 'right' }}>
        {fmtDate(s.created_at)}
      </Text>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationSavingsWidget(props: { config: DelegationSavingsConfig }) {
  const { config } = props;
  const showSessions = config.showSessions ?? true;
  const maxSessions = Math.max(0, Math.trunc(config.maxSessions ?? 10));

  const { data, isLoading, error } = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['delegation-savings', TOPICS.delegationSavings],
    topic: TOPICS.delegationSavings,
    refetchInterval: 5_000,
  });

  const projection = useMemo<DelegationSavingsProjection | null>(() => {
    return data?.[0] ?? null;
  }, [data]);

  const visibleSessions = useMemo(() => {
    if (!projection) return [];
    return projection.sessions.slice(0, maxSessions);
  }, [projection, maxSessions]);

  const isEmpty = !projection || projection.session_count === 0;

  return (
    <ComponentWrapper
      title="Delegation Savings"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No delegation savings data"
      emptyHint="Savings data appears once delegation routing is active and savings_estimates are recorded"
    >
      {projection && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KPI row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              paddingBottom: 12,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <KPI
              label={`Est. savings vs ${projection.baseline_model}`}
              value={projection.cumulative_savings_usd}
              prefix="$"
              decimals={2}
              tone="good"
            />
            <KPI
              label="Local cost"
              value={projection.cumulative_local_cost_usd}
              prefix="$"
              decimals={2}
              tone="default"
            />
            <KPI
              label="Sessions"
              value={projection.session_count}
              tone="default"
            />
          </div>

          {/* Manifest version label */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Text as="span" size="xs" color="tertiary">Pricing manifest:</Text>
            <Text as="span" size="xs" family="mono" color="secondary">{projection.pricing_manifest_version}</Text>
            <Text as="span" size="xs" color="tertiary">vs</Text>
            <Text as="span" size="xs" family="mono" color="secondary">{projection.baseline_model}</Text>
          </div>

          {/* Per-session table */}
          {showSessions && visibleSessions.length > 0 && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  gap: 8,
                  paddingBottom: 4,
                  borderBottom: '1px solid var(--line)',
                }}
              >
                {(['Task', 'Model', 'Tokens', 'Latency', 'Opus Est.', 'Local', 'Saved', 'Date'] as const).map((h) => (
                  <Text key={h} as="span" size="xs" color="tertiary" style={{ textAlign: h === 'Task' || h === 'Model' ? 'left' : 'right' }}>
                    {h}
                  </Text>
                ))}
              </div>
              {visibleSessions.map((s) => (
                <SessionRow key={s.session_id} s={s} />
              ))}
              {projection.sessions.length > maxSessions && (
                <Text as="div" size="xs" color="tertiary" style={{ marginTop: 4, textAlign: 'right' }}>
                  +{projection.sessions.length - maxSessions} more sessions
                </Text>
              )}
            </div>
          )}

          {!projection.provisioned && (
            <Text as="em" size="xs" color="tertiary" style={{ display: 'block' }}>
              Projection upstream-blocked — displaying contract-valid fixtures (OMN-10623).
            </Text>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
