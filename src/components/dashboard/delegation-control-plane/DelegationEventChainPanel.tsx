import { Text } from '@/components/ui/typography';
import { fmtDate, fmtMs, shortId } from './format';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import type { DelegationEvidenceSnapshot, DelegationRun } from './delegation-control-plane.types';

interface ChainStage {
  label: string;
  state: 'observed' | 'inferred' | 'pending';
  detail: string;
}

export function DelegationEventChainPanel({
  snapshot,
  selectedRun,
}: {
  snapshot: DelegationEvidenceSnapshot;
  selectedRun: DelegationRun | null;
}) {
  const stages: ChainStage[] = [
    {
      label: 'Command envelope',
      state: selectedRun ? 'inferred' : 'pending',
      detail: selectedRun ? `correlation ${shortId(selectedRun.correlationId)}` : 'waiting for a run row',
    },
    {
      label: 'Handler dispatch',
      state: selectedRun?.source === 'routing_trace' || selectedRun?.source === 'decision_projection' ? 'observed' : selectedRun ? 'inferred' : 'pending',
      detail: selectedRun ? `${selectedRun.taskType} -> ${selectedRun.modelName}` : 'no handler projection row selected',
    },
    {
      label: 'Terminal event',
      state: selectedRun?.status === 'passed' || selectedRun?.status === 'failed' ? 'observed' : selectedRun ? 'inferred' : 'pending',
      detail: selectedRun ? selectedRun.qualityGateDetail ?? selectedRun.status : 'terminal event not projected',
    },
    {
      label: 'Projection row',
      state: selectedRun ? 'observed' : 'pending',
      detail: selectedRun ? `source ${selectedRun.source}` : 'missing run projection',
    },
    {
      label: 'API and dashboard render',
      state: snapshot.hasAnyData ? 'observed' : 'pending',
      detail: snapshot.hasAnyData ? `${snapshot.probes.filter((p) => p.rowCount > 0).length} projection topics returned data` : 'dashboard is awaiting projection rows',
    },
  ];

  return (
    <DelegationPanelFrame
      title="Event Chain"
      subtitle="Golden-chain view from selected run evidence. Command and terminal stages are inferred until dedicated rows land."
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {stages.map((stage) => (
          <div key={stage.label} style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: 10, alignItems: 'start' }}>
            <Text as="span" size="xs" family="mono" color={stage.state === 'observed' ? 'ok' : stage.state === 'inferred' ? 'warn' : 'tertiary'}>
              {stage.state}
            </Text>
            <div>
              <Text as="div" size="sm" color="primary">{stage.label}</Text>
              <Text as="div" size="xs" color="secondary">{stage.detail}</Text>
            </div>
          </div>
        ))}
      </div>
      {selectedRun && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <Text as="div" size="xs" color="tertiary">Selected run timing</Text>
          <Text as="div" size="sm" family="mono" color="secondary">
            {fmtDate(selectedRun.createdAt)} / latency {fmtMs(selectedRun.latencyMs)}
          </Text>
        </div>
      )}
    </DelegationPanelFrame>
  );
}
