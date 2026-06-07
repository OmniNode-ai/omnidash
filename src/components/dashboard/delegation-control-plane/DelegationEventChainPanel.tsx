import { Text } from '@/components/ui/typography';
import { fmtDate, fmtMs, shortId } from './format';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import { useDelegationRunContext } from './DelegationRunContext';

type StageStatus = 'observed' | 'inferred' | 'UNKNOWN';

interface ChainStage {
  label: string;
  status: StageStatus;
  topic: string;
  detail: string;
  timestamp?: string;
}

function buildChain(
  selectedRun: ReturnType<typeof useDelegationRunContext>['selectedRun'],
  snapshot: ReturnType<typeof useDelegationRunContext>['snapshot'],
): ChainStage[] {
  const hasRun = selectedRun !== null;
  const isObservedSource =
    selectedRun?.source === 'routing_trace' || selectedRun?.source === 'decision_projection';
  const hasTerminal =
    selectedRun?.status === 'passed' || selectedRun?.status === 'failed';

  return [
    {
      label: 'Command envelope',
      status: hasRun ? 'inferred' : 'UNKNOWN',
      topic: 'onex.cmd.delegation.delegate.v1',
      detail: hasRun
        ? `correlation_id ${shortId(selectedRun.correlationId)}`
        : 'UNKNOWN — no run selected',
      timestamp: hasRun ? selectedRun.createdAt : undefined,
    },
    {
      label: 'Handler dispatch',
      status: isObservedSource ? 'observed' : hasRun ? 'inferred' : 'UNKNOWN',
      topic: 'onex.evt.delegation.routing_trace.v1',
      detail: hasRun
        ? `${selectedRun.taskType} → ${selectedRun.modelName} (rule: ${selectedRun.routingRule ?? 'UNKNOWN'})`
        : 'UNKNOWN — no routing trace projected',
      timestamp: hasRun ? selectedRun.createdAt : undefined,
    },
    {
      label: 'Terminal event',
      status: hasTerminal ? 'observed' : hasRun ? 'inferred' : 'UNKNOWN',
      topic: 'onex.evt.delegation.decision_terminal.v1',
      detail: hasRun
        ? (selectedRun.qualityGateDetail ?? selectedRun.status)
        : 'UNKNOWN — terminal event not projected',
      timestamp: hasRun ? selectedRun.createdAt : undefined,
    },
    {
      label: 'Reducer materialise',
      status: hasRun ? 'inferred' : 'UNKNOWN',
      topic: 'onex.evt.delegation.decision_projection.v1',
      detail: hasRun
        ? `source ${selectedRun.source}`
        : 'UNKNOWN — projection row absent',
      timestamp: hasRun ? selectedRun.createdAt : undefined,
    },
    {
      label: 'Projection row',
      status: hasRun ? 'observed' : 'UNKNOWN',
      topic: 'onex.evt.delegation.decision_projection.v1',
      detail: hasRun
        ? `id ${shortId(selectedRun.id)} / latency ${fmtMs(selectedRun.latencyMs)}`
        : 'UNKNOWN — missing decision projection row',
      timestamp: hasRun ? selectedRun.createdAt : undefined,
    },
    {
      label: 'API and dashboard render',
      status: snapshot.hasAnyData ? 'observed' : 'UNKNOWN',
      topic: 'dashboard.projection.read',
      detail: snapshot.hasAnyData
        ? `${snapshot.probes.filter((p) => p.rowCount > 0).length} of ${snapshot.probes.length} projection topics returned data`
        : 'UNKNOWN — dashboard awaiting projection rows',
      timestamp: snapshot.probes
        .map((p) => p.capturedAt)
        .filter(Boolean)
        .sort()
        .at(-1),
    },
  ];
}

const STATUS_COLOR: Record<StageStatus, 'ok' | 'warn' | 'tertiary'> = {
  observed: 'ok',
  inferred: 'warn',
  UNKNOWN: 'tertiary',
};

export function DelegationEventChainPanel() {
  const { snapshot, selectedRun } = useDelegationRunContext();
  const stages = buildChain(selectedRun, snapshot);

  return (
    <DelegationPanelFrame
      title="Event Chain"
      authority="projection-backed"
      subtitle="Golden-chain view: command → handler → terminal → reducer → projection → API. UNKNOWN indicates missing evidence, not omission."
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {stages.map((stage, idx) => (
          <div
            key={stage.label}
            style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px', gap: 10, alignItems: 'start' }}
          >
            <Text
              as="span"
              size="xs"
              family="mono"
              color={STATUS_COLOR[stage.status]}
            >
              {stage.status}
            </Text>
            <div style={{ minWidth: 0 }}>
              <Text as="div" size="sm" color="primary">
                {idx + 1}. {stage.label}
              </Text>
              <Text as="div" size="xs" color="secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stage.detail}>
                {stage.detail}
              </Text>
              <Text as="div" size="xs" family="mono" color="tertiary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stage.topic}>
                {stage.topic}
              </Text>
            </div>
            <Text as="span" size="xs" family="mono" color="tertiary">
              {stage.timestamp ? fmtDate(stage.timestamp) : '—'}
            </Text>
          </div>
        ))}
      </div>
    </DelegationPanelFrame>
  );
}
