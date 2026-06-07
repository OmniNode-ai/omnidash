import { Text } from '@/components/ui/typography';

export interface PipelineEvent {
  id: string;
  type: 'request' | 'validation' | 'success' | 'error';
  timestamp: string;
  source: string;
  message: string;
  correlationId: string;
  taskDescription?: string;
  selectedProvider?: string | null;
  selectedModel?: string | null;
  endpointRef?: string | null;
  resolvedEndpoint?: string | null;
  routingSource?: string | null;
  projectionOwner?: string | null;
  projectionReducerVersion?: string | null;
  contractYaml?: string | null;
  handlerSource?: string | null;
  outputPayloadSha256?: string | null;
  contractSha256?: string | null;
  handlerSha256?: string | null;
  payload?: string | null;
  simulated?: boolean;
}

const TYPE_COLORS: Record<PipelineEvent['type'], string> = {
  request: 'var(--accent)',
  validation: 'var(--status-warn)',
  success: 'var(--status-ok)',
  error: 'var(--status-bad)',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function prettyPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

function ProofFact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasText(value)) return null;
  return (
    <div>
      <Text as="div" size="xs" color="tertiary" className="mono text-tracked text-upper">
        {label}
      </Text>
      <Text as="div" size="xs" color="secondary" className="mono" style={{ wordBreak: 'break-word' }}>
        {value}
      </Text>
    </div>
  );
}

function ArtifactBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasText(value)) return null;
  return (
    <div>
      <Text as="div" size="xs" color="tertiary" className="mono text-tracked text-upper" style={{ marginBottom: 4 }}>
        {label}
      </Text>
      <Text
        as="pre"
        size="xs"
        color="secondary"
        className="mono"
        style={{
          margin: 0,
          padding: 10,
          border: '1px solid var(--line)',
          borderRadius: 6,
          background: 'var(--panel)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Text>
    </div>
  );
}

function ArtifactProof({ event }: { event: PipelineEvent }) {
  const payload = hasText(event.payload) ? prettyPayload(event.payload) : null;
  const hasProof =
    hasText(event.contractYaml) ||
    hasText(event.handlerSource) ||
    hasText(payload) ||
    [
      event.selectedProvider,
      event.selectedModel,
      event.endpointRef,
      event.resolvedEndpoint,
      event.routingSource,
      event.projectionOwner,
      event.projectionReducerVersion,
      event.outputPayloadSha256,
      event.contractSha256,
      event.handlerSha256,
    ].some(hasText);

  if (!hasProof) return null;

  return (
    <details open style={{ gridColumn: '1 / -1', marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
        <Text as="span" size="xs" weight="bold" color="primary" className="mono text-tracked text-upper">
          Projection-backed artifact proof
        </Text>
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 8,
          }}
        >
          <ProofFact label="Correlation" value={event.correlationId} />
          <ProofFact label="Provider" value={event.selectedProvider} />
          <ProofFact label="Model" value={event.selectedModel} />
          <ProofFact label="Endpoint Ref" value={event.endpointRef} />
          <ProofFact label="Resolved Endpoint" value={event.resolvedEndpoint} />
          <ProofFact label="Routing Source" value={event.routingSource} />
          <ProofFact label="Projection Owner" value={event.projectionOwner} />
          <ProofFact label="Reducer Version" value={event.projectionReducerVersion} />
          <ProofFact label="Output SHA256" value={event.outputPayloadSha256} />
          <ProofFact label="Contract SHA256" value={event.contractSha256} />
          <ProofFact label="Handler SHA256" value={event.handlerSha256} />
        </div>
        <ArtifactBlock label="contract_yaml" value={event.contractYaml} />
        <ArtifactBlock label="handler_source" value={event.handlerSource} />
        {!hasText(event.contractYaml) && !hasText(event.handlerSource) && (
          <ArtifactBlock label="generation_events payload" value={payload} />
        )}
      </div>
    </details>
  );
}

export function PipelineLogStream({ events }: { events: PipelineEvent[] }) {
  return (
    <div
      style={{
        background: 'var(--bg-sunken)',
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: 0,
        width: '100%',
        minHeight: events.length === 0 ? 112 : 0,
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {events.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <Text size="md" color="tertiary">
            Waiting for pipeline events...
          </Text>
        </div>
      ) : (
        events.map((evt) => (
          <div
            key={evt.id}
            data-testid="pipeline-log-entry"
            style={{
              display: 'grid',
              gridTemplateColumns: '72px 80px 1fr',
              gap: 10,
              padding: '6px 12px',
              borderLeft: `3px solid ${TYPE_COLORS[evt.type] ?? 'var(--line)'}`,
              borderBottom: '1px solid var(--line-2)',
              opacity: evt.simulated ? 0.7 : 1,
            }}
          >
            <Text size="xs" color="tertiary" className="mono">
              {formatTime(evt.timestamp)}
            </Text>
            <Text
              size="xs"
              weight="bold"
              className="mono text-tracked text-upper"
              style={{ color: TYPE_COLORS[evt.type] }}
            >
              {evt.type}
            </Text>
            <Text size="sm" color="secondary">
              {evt.simulated && (
                <Text
                  as="span"
                  size="xs"
                  weight="bold"
                  className="mono"
                  style={{
                    color: 'var(--status-warn)',
                    marginRight: 6,
                    border: '1px solid var(--status-warn)',
                    padding: '0 3px',
                    borderRadius: 2,
                  }}
                >
                  DEMO
                </Text>
              )}
              {evt.message}
            </Text>
            <ArtifactProof event={evt} />
          </div>
        ))
      )}
    </div>
  );
}
