import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';

// ── Projection types (from savings_estimates SQLite table, OMN-10623) ─

export interface DelegationSavingsSession {
  session_id: string;
  local_cost_usd: number;
  cloud_cost_usd: number;
  savings_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  savings_method: 'measured' | 'estimated';
  usage_source: 'measured' | 'estimated' | 'unknown';
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

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Session row ───────────────────────────────────────────────────────

function SessionRow({ s }: { s: DelegationSavingsSession }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 80px 80px 60px',
        gap: 8,
        padding: '5px 0',
        borderBottom: '1px solid var(--line-2)',
        alignItems: 'center',
      }}
    >
      <Text as="span" size="sm" family="mono" color="secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {s.session_id.slice(0, 12)}…
      </Text>
      <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
        {fmtUsd(s.local_cost_usd)}
      </Text>
      <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right', color: 'var(--warn)' }}>
        {fmtUsd(s.cloud_cost_usd)}
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
    refetchInterval: 60_000,
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
                  gridTemplateColumns: '1fr 80px 80px 80px 60px',
                  gap: 8,
                  paddingBottom: 4,
                  borderBottom: '1px solid var(--line)',
                }}
              >
                {(['Session', 'Local', 'Cloud', 'Saved', 'Date'] as const).map((h) => (
                  <Text key={h} as="span" size="xs" color="tertiary" style={{ textAlign: h === 'Session' ? 'left' : 'right' }}>
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
