import { Text } from '@/components/ui/typography';
import { fmtDate } from './format';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import { useDelegationRunContext } from './DelegationRunContext';
import type { DelegationProjectionProbe } from './delegation-control-plane.types';

type ProbeStatus = 'error' | 'loading' | 'unprovisioned' | 'degraded' | 'ready' | 'empty';

function probeStatus(probe: DelegationProjectionProbe): ProbeStatus {
  if (probe.error) return 'error';
  if (probe.isLoading) return 'loading';
  if (probe.provisioned === false) return 'unprovisioned';
  if (probe.rowCount > 0 && probe.capturedAt) {
    const ageMs = Date.now() - Date.parse(probe.capturedAt);
    if (ageMs > 5 * 60 * 1000) return 'degraded';
    return 'ready';
  }
  if (probe.rowCount > 0) return 'ready';
  return 'empty';
}

const STATUS_COLOR: Record<ProbeStatus, 'ok' | 'warn' | 'bad' | 'tertiary'> = {
  ready: 'ok',
  degraded: 'warn',
  unprovisioned: 'warn',
  empty: 'tertiary',
  loading: 'tertiary',
  error: 'bad',
};

export function DelegationProjectionProbePanel() {
  const { snapshot } = useDelegationRunContext();
  const { probes, isLoading, primaryError } = snapshot;

  const degradedCount = probes.filter((p) => probeStatus(p) === 'degraded').length;
  const errorCount = probes.filter((p) => p.error !== null).length;
  const readyCount = probes.filter((p) => p.rowCount > 0).length;
  const latestCapturedAt = probes
    .map((p) => p.capturedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <DelegationPanelFrame
      title="Projection / API"
      subtitle="Raw readiness probe for every projection topic. Degraded = data present but freshness &gt; 5 min."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        <SummaryFact label="Ready topics" value={String(readyCount)} />
        <SummaryFact label="Degraded" value={String(degradedCount)} highlight={degradedCount > 0 ? 'warn' : undefined} />
        <SummaryFact label="Errors" value={String(errorCount)} highlight={errorCount > 0 ? 'bad' : undefined} />
        <SummaryFact label="Last captured" value={fmtDate(latestCapturedAt)} />
      </div>

      {primaryError && (
        <Text as="div" size="xs" family="mono" color="bad" style={{ marginBottom: 10, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 4 }}>
          Primary error: {primaryError.message}
        </Text>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 110px 90px', gap: 8, paddingBottom: 5, borderBottom: '1px solid var(--line)' }}>
        {['Projection', 'Rows', 'Freshness', 'Status'].map((heading) => (
          <Text key={heading} as="span" size="xs" color="tertiary">
            {heading}
          </Text>
        ))}
      </div>

      {probes.map((probe) => {
        const status = probeStatus(probe);
        return (
          <div
            key={probe.key}
            style={{ display: 'grid', gridTemplateColumns: '1fr 72px 110px 90px', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line-2)' }}
          >
            <div style={{ minWidth: 0 }}>
              <Text as="div" size="sm" color="primary">{probe.label}</Text>
              <Text
                as="div"
                size="xs"
                family="mono"
                color="tertiary"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={probe.topic}
              >
                {probe.topic}
              </Text>
              {probe.error && (
                <Text as="div" size="xs" family="mono" color="bad">
                  {probe.error.message}
                </Text>
              )}
            </div>
            <Text as="span" size="sm" family="mono" color="secondary">
              {probe.isLoading ? '…' : String(probe.rowCount)}
            </Text>
            <Text as="span" size="xs" family="mono" color="secondary">
              {fmtDate(probe.capturedAt)}
            </Text>
            <Text as="span" size="xs" family="mono" color={STATUS_COLOR[status]}>
              {probe.isLoading ? 'loading' : status}
            </Text>
          </div>
        );
      })}

      {!isLoading && probes.length === 0 && (
        <Text as="div" size="sm" color="tertiary" style={{ padding: '8px 0' }}>
          No projection probes registered.
        </Text>
      )}
    </DelegationPanelFrame>
  );
}

function SummaryFact({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'warn' | 'bad';
}) {
  return (
    <div>
      <Text as="div" size="xs" color="tertiary">{label}</Text>
      <Text as="div" size="lg" family="mono" color={highlight ?? 'primary'}>{value}</Text>
    </div>
  );
}
