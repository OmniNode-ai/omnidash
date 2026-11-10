import { useMemo } from 'react';
import { Text, Heading } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import { fixed as fmtFixed, localeTime as fmtLocaleTime } from '@/lib/format';
import { refreshInterval } from '@/lib/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in SandboxMonitorPage.static.css.
import './SandboxMonitorPage.static.css';

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
  return fmtLocaleTime(d, undefined, { hour12: false });
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
          ? 'color-mix(in oklch, var(--ds-status-ok) 20%, transparent)'
          : 'color-mix(in oklch, var(--ds-bad, var(--ds-hue-red)) 20%, transparent)',
        border: `1px solid ${verdict === 'allow' ? 'var(--ds-ok)' : 'var(--ds-bad, var(--ds-bad))'}`,
        color: verdict === 'allow' ? 'var(--ds-ok)' : 'var(--ds-bad, var(--ds-bad))',
        whiteSpace: 'nowrap',
      }}
    >
      {verdict}
    </Text>
  );
}

function DenyRateBar({ denyRate }: { denyRate: number }) {
  const pct = Math.min(100, Math.max(0, denyRate * 100));
  const color = pct > 30 ? 'var(--ds-bad, var(--ds-hue-red))' : pct > 10 ? 'var(--ds-warn)' : 'var(--ds-ok)';
  return (
    <div className="sandbox-monitor-page-sfb9057">
      <div className="sandbox-monitor-page-s3c30dd">
        <div
          style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.3s ease' }}
        />
      </div>
      <Text size="xs" family="mono" style={{ color, minWidth: 38 }}>
        {fmtFixed(pct, 1)}%
      </Text>
    </div>
  );
}

export function SandboxMonitorPage() {
  const dataSourceMode = useDataSourceMode();
  const { data: decisions, isLoading, error } = useProjectionQuery<SandboxDecision>({
    topic: TOPICS.sandboxDecisions,
    queryKey: ['sandbox-decisions'],
    refetchInterval: refreshInterval(),
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
          <div className="sandbox-monitor-page-s636ba8">
            <Text size="sm" color="secondary">
              {isLoading ? 'Loading…' : error ? 'Server unavailable' : isLiveDataSource(dataSourceMode) ? 'LIVE' : 'Fixture data'}
            </Text>
          </div>
        </div>
        <div className="header-actions sandbox-monitor-page-sb6e62f">
          <Text size="sm" color="ok">{allowCount} allowed</Text>
          <Text color="bad" size="sm">{denyCount} denied</Text>
        </div>
      </div>

      <div className="dash-body sandbox-monitor-page-sea0c4d">
        {/* KPI row */}
        <div className="sandbox-monitor-page-s4dd6d5">
          {([
            { label: 'Total Decisions', value: String(total), color: undefined as string | undefined },
            { label: 'Allowed', value: String(allowCount), color: 'var(--ds-status-ok)' as string | undefined },
            { label: 'Denied', value: String(denyCount), color: 'var(--ds-bad, var(--ds-hue-red))' as string | undefined },
          ]).map(({ label, value, color }) => (
            <div className="sandbox-monitor-page-s6bf4d6"
              key={label}
            >
              <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">{label}</Text>
              <Text size="xl" weight="bold" family="mono" style={{ marginTop: 4, ...(color ? { color } : {}) }}>
                {value}
              </Text>
            </div>
          ))}
        </div>

        {/* Deny rate bar */}
        <div className="sandbox-monitor-page-s88d796"
        >
          <div className="sandbox-monitor-page-s6ddf48">
            <Heading level={3} size="sm">Deny Rate</Heading>
          </div>
          <DenyRateBar denyRate={denyRate} />
        </div>

        {/* By policy breakdown */}
        {byPolicy.length > 0 && (
          <div className="sandbox-monitor-page-sae8498"
          >
            <div className="sandbox-monitor-page-s52a6b6">
              <Heading level={3} size="sm">By Policy Rule</Heading>
            </div>
            <table className="sandbox-monitor-page-s0bc69d">
              <thead>
                <tr className="sandbox-monitor-page-s99d8eb">
                  {(['Policy Rule', 'Allowed', 'Denied', 'Deny Rate'] as const).map((h) => (
                    <th className="sandbox-monitor-page-sf7aca1" key={h}>
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
                    <tr className="sandbox-monitor-page-s99d8eb" key={rule}>
                      <td className="sandbox-monitor-page-s96bfe9"><Text size="sm" family="mono">{rule}</Text></td>
                      <td className="sandbox-monitor-page-s96bfe9"><Text size="sm" color="ok">{counts.allow}</Text></td>
                      <td className="sandbox-monitor-page-s96bfe9"><Text color="bad" size="sm">{counts.deny}</Text></td>
                      <td className="sandbox-monitor-page-sb7087d"><DenyRateBar denyRate={rowDenyRate} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Live event stream */}
        <div className="sandbox-monitor-page-s543027"
        >
          <div className="sandbox-monitor-page-s20f44e">
            <Heading level={3} size="sm">Decision Stream</Heading>
            <Text size="xs" color="tertiary">most recent first</Text>
          </div>
          {isLoading && (
            <div className="sandbox-monitor-page-s0830bd">
              <Text size="sm" color="tertiary">Loading decisions…</Text>
            </div>
          )}
          {!isLoading && sorted.length === 0 && (
            <div className="sandbox-monitor-page-s0830bd">
              <Text size="sm" color="tertiary">
                {error ? 'Server unavailable — no sandbox data' : 'No sandbox decisions recorded'}
              </Text>
            </div>
          )}
          {!isLoading && sorted.length > 0 && (
            <table className="sandbox-monitor-page-s0bc69d">
              <thead>
                <tr className="sandbox-monitor-page-s99d8eb">
                  {(['Time', 'Node', 'Action', 'Resource', 'Verdict', 'Policy Rule'] as const).map((h) => (
                    <th className="sandbox-monitor-page-sf7aca1" key={h}>
                      <Text size="xs" color="tertiary" weight="semibold" transform="uppercase">{h}</Text>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 100).map((d) => (
                  <tr className="sandbox-monitor-page-s99d8eb"
                    key={d.decision_id}
                  >
                    <td className="sandbox-monitor-page-s966836">
                      <Text size="xs" family="mono" color="tertiary">{formatTimestamp(d.timestamp)}</Text>
                    </td>
                    <td className="sandbox-monitor-page-s966836">
                      <Text size="sm" family="mono" truncate>{d.node_name}</Text>
                    </td>
                    <td className="sandbox-monitor-page-s966836">
                      <Text size="sm" color="secondary" truncate>{d.action}</Text>
                    </td>
                    <td className="sandbox-monitor-page-s966836">
                      <Text size="sm" color="tertiary">{d.resource_type}</Text>
                    </td>
                    <td className="sandbox-monitor-page-s966836">
                      <VerdictBadge verdict={d.verdict} />
                    </td>
                    <td className="sandbox-monitor-page-s966836">
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
