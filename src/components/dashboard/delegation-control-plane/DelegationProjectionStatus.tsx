import { Text } from '@/components/ui/typography';
import { fmtDate } from './format';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import type { DelegationProjectionProbe } from './delegation-control-plane.types';

export function DelegationProjectionStatus({ probes }: { probes: DelegationProjectionProbe[] }) {
  return (
    <DelegationPanelFrame
      title="Projection Status"
      subtitle="Readiness probe for every projection topic used by this control plane."
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 110px 1fr', gap: 8, paddingBottom: 5, borderBottom: '1px solid var(--line)' }}>
        {['Projection', 'Rows', 'Freshness', 'Topic'].map((heading) => (
          <Text key={heading} as="span" size="xs" color="tertiary">
            {heading}
          </Text>
        ))}
      </div>
      {probes.map((probe) => {
        const status = probe.error ? 'error' : probe.isLoading ? 'loading' : probe.provisioned === false ? 'unprovisioned' : probe.rowCount > 0 ? 'ready' : 'empty';
        return (
          <div key={probe.key} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 110px 1fr', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line-2)' }}>
            <div style={{ minWidth: 0 }}>
              <Text as="div" size="sm" color="primary">{probe.label}</Text>
              <Text as="div" size="xs" family="mono" color={status === 'error' ? 'bad' : status === 'ready' ? 'ok' : status === 'unprovisioned' ? 'warn' : 'tertiary'}>
                {status}
              </Text>
            </div>
            <Text as="span" size="sm" family="mono" color="secondary">{probe.rowCount}</Text>
            <Text as="span" size="xs" family="mono" color="secondary">{fmtDate(probe.capturedAt)}</Text>
            <Text as="span" size="xs" family="mono" color="tertiary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={probe.topic}>
              {probe.topic}
            </Text>
          </div>
        );
      })}
    </DelegationPanelFrame>
  );
}
