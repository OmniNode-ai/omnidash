import { useMemo } from 'react';
import { Text, Heading } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';

interface SandboxDecision {
  decision_id: string;
  timestamp: string;
  session_id: string;
  node_name: string;
  action: string;
  verdict: 'allow' | 'deny';
  policy_rule: string;
  resource_type: string;
  resource_usage_mb: number | null;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function VerdictBadge({ verdict }: { verdict: 'allow' | 'deny' }) {
  return (
    <Text
      as="span"
      size="xs"
      family="mono"
      weight="semibold"
      transform="uppercase"
      style={{
        padding: '2px 8px',
        borderRadius: 4,
        background: verdict === 'allow'
          ? 'color-mix(in oklch, var(--status-ok) 20%, transparent)'
          : 'color-mix(in oklch, var(--bad, oklch(62% 0.18 25)) 20%, transparent)',
        border: `1px solid ${verdict === 'allow' ? 'var(--status-ok)' : 'var(--bad, oklch(62% 0.18 25))'}`,
        color: verdict === 'allow' ? 'var(--status-ok)' : 'var(--bad, oklch(62% 0.18 25))',
        whiteSpace: 'nowrap',
      }}
    >
      {verdict}
    </Text>
  );
}

function DenyRateBar({ denyRate }: { denyRate: number }) {
  const pct = Math.min(100, Math.max(0, denyRate * 100));
  const color = pct > 30 ? 'var(--bad, oklch(62% 0.18 25))' : pct > 10 ? 'var(--status-warn)' : 'var(--status-ok)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border, oklch(20% 0.01 260))', borderRadius: 3, overflow: 'hidden' }}>
        <div
          style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.3s ease' }}
        />
      </div>
      <Text size="xs" family="mono" style={{ color, minWidth: 38 }}>
        {pct.toFixed(1)}%
      </Text>
    </div>
  );
}

export function SandboxMonitorPage() {
  const dataSourceMode = useDataSourceMode();
  const { data: decisions, isLoading, error } = useProjectionQuery<SandboxDecision>({
    topic: TOPICS.sandboxDecisions,
    queryKey: ['sandbox-decisions'],
    refetchInterval: 5_000,
  });

  const sorted = useMemo(() => {
    if (!decisions) return [];
    return [...decisions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [decisions]);

  const allowCount = sorted.filter((d) => d.verdict === 'allow').length;
  const denyCount = sorted.filter((d) => d.verdict === 'deny').length;
  const total = sorted.length;
  const denyRate = total > 0 ? denyCount / total : 0;

  const byPolicy = useMemo(() => {
    const acc: Record<string, { allow: number; deny: number }> = {};
    for (const d of sorted) {
      const key = d.policy_rule || 'unknown';
      acc[key] ??= { allow: 0, deny: 0 };
      acc[key][d.verdict]++;
    }
    return Object.entries(acc).sort((a, b) => (b[1].deny + b[1].allow) - (a[1].deny + a[1].allow));
  }, [sorted]);

  return (
    <>
      <div className="dash-header">
        <div className="dash-title-wrap">
          <div className="dash-title">Sandbox Monitor</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text size="sm" color="secondary">
              {isLoading ? 'Loading…' : error ? 'Server unavailable' : isLiveDataSource(dataSourceMode) ? 'LIVE' : 'Fixture data'}
            </Text>
          </div>
        </div>
        <div className="header-actions" style={{ gap: 12 }}>
          <Text size="sm" color="ok">{allowCount} allowed</Text>
          <Text size="sm" style={{ color: 'var(--bad, oklch(62% 0.18 25))' }}>{denyCount} denied</Text>
        </div>
      </div>

      <div className="dash-body" style={{ padding: '24px 28px', overflowY: 'auto' }}>
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {([
            { label: 'Total Decisions', value: String(total), color: undefined as string | undefined },
            { label: 'Allowed', value: String(allowCount), color: 'var(--status-ok)' as string | undefined },
            { label: 'Denied', value: String(denyCount), color: 'var(--bad, oklch(62% 0.18 25))' as string | undefined },
          ]).map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                background: 'var(--surface, oklch(14% 0.01 260))',
                border: '1px solid var(--border, oklch(20% 0.01 260))',
                borderRadius: 8,
                padding: '16px 20px',
              }}
            >
              <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">{label}</Text>
              <Text size="xl" weight="bold" family="mono" style={{ marginTop: 4, ...(color ? { color } : {}) }}>
                {value}
              </Text>
            </div>
          ))}
        </div>

        {/* Deny rate bar */}
        <div
          style={{
            background: 'var(--surface, oklch(14% 0.01 260))',
            border: '1px solid var(--border, oklch(20% 0.01 260))',
            borderRadius: 8,
            padding: '16px 20px',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Heading level={3} size="sm">Deny Rate</Heading>
          </div>
          <DenyRateBar denyRate={denyRate} />
        </div>

        {/* By policy breakdown */}
        {byPolicy.length > 0 && (
          <div
            style={{
              background: 'var(--surface, oklch(14% 0.01 260))',
              border: '1px solid var(--border, oklch(20% 0.01 260))',
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 24,
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}>
              <Heading level={3} size="sm">By Policy Rule</Heading>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}>
                  {(['Policy Rule', 'Allowed', 'Denied', 'Deny Rate'] as const).map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left' }}>
                      <Text size="xs" color="tertiary" weight="semibold" transform="uppercase">{h}</Text>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPolicy.map(([rule, counts]) => {
                  const rowTotal = counts.allow + counts.deny;
                  const rowDenyRate = rowTotal > 0 ? counts.deny / rowTotal : 0;
                  return (
                    <tr key={rule} style={{ borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}>
                      <td style={{ padding: '10px 12px' }}><Text size="sm" family="mono">{rule}</Text></td>
                      <td style={{ padding: '10px 12px' }}><Text size="sm" color="ok">{counts.allow}</Text></td>
                      <td style={{ padding: '10px 12px' }}><Text size="sm" style={{ color: 'var(--bad, oklch(62% 0.18 25))' }}>{counts.deny}</Text></td>
                      <td style={{ padding: '10px 12px', minWidth: 160 }}><DenyRateBar denyRate={rowDenyRate} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Live event stream */}
        <div
          style={{
            background: 'var(--surface, oklch(14% 0.01 260))',
            border: '1px solid var(--border, oklch(20% 0.01 260))',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, oklch(20% 0.01 260))', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Heading level={3} size="sm">Decision Stream</Heading>
            <Text size="xs" color="tertiary">most recent first</Text>
          </div>
          {isLoading && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Text size="sm" color="tertiary">Loading decisions…</Text>
            </div>
          )}
          {!isLoading && sorted.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Text size="sm" color="tertiary">
                {error ? 'Server unavailable — no sandbox data' : 'No sandbox decisions recorded'}
              </Text>
            </div>
          )}
          {!isLoading && sorted.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}>
                  {(['Time', 'Node', 'Action', 'Resource', 'Verdict', 'Policy Rule'] as const).map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left' }}>
                      <Text size="xs" color="tertiary" weight="semibold" transform="uppercase">{h}</Text>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 100).map((d) => (
                  <tr
                    key={d.decision_id}
                    style={{ borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}
                  >
                    <td style={{ padding: '8px 12px' }}>
                      <Text size="xs" family="mono" color="tertiary">{formatTimestamp(d.timestamp)}</Text>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Text size="sm" family="mono" truncate>{d.node_name}</Text>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Text size="sm" color="secondary" truncate>{d.action}</Text>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Text size="sm" color="tertiary">{d.resource_type}</Text>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <VerdictBadge verdict={d.verdict} />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Text size="sm" color="tertiary" family="mono" truncate>{d.policy_rule}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
