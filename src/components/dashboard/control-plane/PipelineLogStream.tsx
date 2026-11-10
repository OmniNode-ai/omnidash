import { Text } from '@/components/ui/typography';
import { formatRedactedEventPayload } from '@/utils/redact-event-payload';
import { localeTime as fmtLocaleTime } from '@/theme/format';
// OMN-23330 AC25: this file's fixed inline styles are classes in PipelineLogStream.static.css.
import './PipelineLogStream.static.css';

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
  request: 'var(--ds-brand)',
  validation: 'var(--ds-warn)',
  success: 'var(--ds-status-ok)',
  error: 'var(--ds-status-bad)',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return fmtLocaleTime(d, undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function ProofFact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasText(value)) return null;
  return (
    <div>
      <Text as="div" size="xs" color="tertiary" className="mono text-tracked text-upper">
        {label}
      </Text>
      <Text as="div" size="xs" color="secondary" className="mono pipeline-log-stream-s517194">
        {value}
      </Text>
    </div>
  );
}

function ArtifactBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasText(value)) return null;
  return (
    <div>
      <Text as="div" size="xs" color="tertiary" className="mono text-tracked text-upper pipeline-log-stream-s3eaa7b">
        {label}
      </Text>
      <Text
        as="pre"
        size="xs"
        color="secondary"
        className="mono pipeline-log-stream-s92c43e"
      >
        {value}
      </Text>
    </div>
  );
}

function ArtifactProof({ event }: { event: PipelineEvent }) {
  const payload = hasText(event.payload) ? formatRedactedEventPayload(event.payload) : null;
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
    <details className="pipeline-log-stream-s00c051" open>
      <summary className="pipeline-log-stream-sa434d0">
        <Text as="span" size="xs" weight="bold" color="primary" className="mono text-tracked text-upper">
          Projection-backed artifact proof
        </Text>
      </summary>
      <div className="pipeline-log-stream-s044f9a">
        <div className="pipeline-log-stream-sd94959"
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
        background: 'var(--ds-inset)',
        border: '1px solid var(--ds-line)',
        borderRadius: 6,
        padding: 0,
        width: '100%',
        minHeight: events.length === 0 ? 112 : 0,
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {events.length === 0 ? (
        <div className="pipeline-log-stream-s744dd4">
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
              borderLeft: `3px solid ${TYPE_COLORS[evt.type] ?? 'var(--ds-line)'}`,
              borderBottom: '1px solid var(--ds-line-soft)',
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
                <Text color="warn"
                  as="span"
                  size="xs"
                  weight="bold"
                  className="mono pipeline-log-stream-sb6c4a4"
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
