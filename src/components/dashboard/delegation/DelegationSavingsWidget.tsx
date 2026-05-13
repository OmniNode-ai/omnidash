import { useMemo, useState } from 'react';
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
  prompt_text?: string | null;
  response_text?: string | null;
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

// ── Client-side cost computation ──────────────────────────────────────
// Used when cost_savings_usd / savings_usd is 0 but token counts are present.
// Prices in USD per token.

const OPUS_INPUT_PRICE  = 15.0  / 1_000_000;  // $15/M tokens
const OPUS_OUTPUT_PRICE = 75.0  / 1_000_000;  // $75/M tokens
const SONNET_INPUT_PRICE  = 3.0  / 1_000_000;
const SONNET_OUTPUT_PRICE = 15.0 / 1_000_000;

function computeSessionCosts(s: DelegationSavingsSession): {
  opusCost: number;
  sonnetCost: number;
  marginalSaved: number;
} {
  const prompt = s.prompt_tokens ?? 0;
  const completion = s.completion_tokens ?? 0;
  const opusCost   = prompt * OPUS_INPUT_PRICE   + completion * OPUS_OUTPUT_PRICE;
  const sonnetCost = prompt * SONNET_INPUT_PRICE + completion * SONNET_OUTPUT_PRICE;
  // Use projection savings when available, else fall back to Opus marginal cost
  const marginalSaved = (s.savings_usd ?? 0) > 0 ? s.savings_usd : opusCost;
  return { opusCost, sonnetCost, marginalSaved };
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
// Columns: Task | Model | Tokens | Latency | Opus (est) | Sonnet (est) | Saved | Date
// When savings_usd is 0 but tokens are present, costs are computed client-side.
// Clicking the row expands a detail panel showing prompt + response.

const GRID_COLS = '2fr 2fr 1fr 1fr 1fr 1fr 1fr 1fr';

function SessionRow({ s }: { s: DelegationSavingsSession }) {
  const [expanded, setExpanded] = useState(false);
  const rowLabel = s.task_type ?? s.session_id.slice(0, 20);
  const modelShort = s.model_name?.replace('local-', '').replace('-30b', '') ?? '—';
  const hasDetail = Boolean(s.prompt_text || s.response_text);

  const { opusCost, sonnetCost, marginalSaved } = computeSessionCosts(s);
  const hasTokens = (s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0) > 0;

  return (
    <div style={{ borderBottom: '1px solid var(--line-2)' }}>
      <div
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={hasDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v); } : undefined}
        style={{
          display: 'grid',
          gridTemplateColumns: GRID_COLS,
          gap: 6,
          padding: '5px 0',
          alignItems: 'center',
          cursor: hasDetail ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <Text as="span" size="sm" family="mono" color="primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hasDetail ? (expanded ? '▾ ' : '▸ ') : ''}{rowLabel}
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
          {hasTokens ? fmtUsd(opusCost) : (s.cloud_cost_usd > 0 ? fmtUsd(s.cloud_cost_usd) : '—')}
        </Text>
        <Text as="span" size="sm" family="mono" tabularNums color="tertiary" style={{ textAlign: 'right' }}>
          {hasTokens ? fmtUsd(sonnetCost) : '—'}
        </Text>
        <Text as="span" size="sm" family="mono" tabularNums weight="semibold" style={{ textAlign: 'right', color: marginalSaved > 0 ? 'var(--good)' : 'var(--ink-3)' }}>
          {marginalSaved > 0 ? `+${fmtUsd(marginalSaved)}` : '—'}
        </Text>
        <Text as="span" size="xs" family="mono" color="tertiary" style={{ textAlign: 'right' }}>
          {fmtDate(s.created_at)}
        </Text>
      </div>

      {expanded && hasDetail && (
        <div
          style={{
            margin: '0 0 8px 0',
            padding: '10px 12px',
            background: 'var(--surface-2, rgba(0,0,0,0.04))',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {s.prompt_text && (
            <div>
              <Text as="div" size="xs" color="tertiary" weight="semibold" transform="uppercase" className="text-tracked" style={{ marginBottom: 4 }}>
                Prompt
              </Text>
              <pre
                style={{
                  margin: 0,
                  padding: '8px 10px',
                  background: 'var(--surface-3, rgba(0,0,0,0.07))',
                  borderRadius: 4,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                <Text as="span" size="xs" family="mono" color="primary">{s.prompt_text}</Text>
              </pre>
            </div>
          )}
          {s.response_text && (
            <div>
              <Text as="div" size="xs" color="tertiary" weight="semibold" transform="uppercase" className="text-tracked" style={{ marginBottom: 4 }}>
                Response
              </Text>
              <div
                style={{
                  padding: '8px 10px',
                  background: 'var(--surface-3, rgba(0,0,0,0.07))',
                  borderRadius: 4,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                <Text as="span" size="xs" family="mono" color="secondary" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {s.response_text}
                </Text>
              </div>
            </div>
          )}
        </div>
      )}
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

  // When the projection carries zeros, compute cumulative costs from token counts.
  const cumulativeComputed = useMemo(() => {
    if (!projection) return null;
    const sessions = projection.sessions;
    let totalOpus = 0;
    let totalSonnet = 0;
    let totalSaved = 0;
    for (const s of sessions) {
      const { opusCost, sonnetCost, marginalSaved } = computeSessionCosts(s);
      totalOpus += opusCost;
      totalSonnet += sonnetCost;
      totalSaved += marginalSaved;
    }
    return { totalOpus, totalSonnet, totalSaved };
  }, [projection]);

  // Prefer projection values when they carry real data; fall back to computed.
  const displaySaved = (projection?.cumulative_savings_usd ?? 0) > 0
    ? projection!.cumulative_savings_usd
    : (cumulativeComputed?.totalSaved ?? 0);

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
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              paddingBottom: 12,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <KPI
              label="Est. savings vs Opus"
              value={displaySaved}
              prefix="$"
              decimals={4}
              tone="good"
            />
            <KPI
              label="Local cost"
              value={projection.cumulative_local_cost_usd}
              prefix="$"
              decimals={4}
              tone="default"
            />
            <KPI
              label="Opus equivalent cost"
              value={cumulativeComputed?.totalOpus ?? projection.cumulative_cloud_cost_usd}
              prefix="$"
              decimals={4}
              tone="default"
            />
            <KPI
              label="Sessions"
              value={projection.session_count}
              tone="default"
            />
          </div>

          {/* Cost methodology note */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Text as="span" size="xs" color="tertiary">Opus basis: $15/$75 per M tokens input/output</Text>
            {projection.pricing_manifest_version && (
              <>
                <Text as="span" size="xs" color="tertiary">·</Text>
                <Text as="span" size="xs" family="mono" color="secondary">{projection.pricing_manifest_version}</Text>
              </>
            )}
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
                {(['Task', 'Model', 'Tokens', 'Latency', 'Opus est.', 'Sonnet est.', 'Saved', 'Date'] as const).map((h) => (
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
