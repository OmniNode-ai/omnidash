import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { Text } from '@/components/ui/typography';
import { PromptInput } from './PromptInput';
import { PipelineLogStream, type PipelineEvent } from './PipelineLogStream';
import { PipelineStatusBar, type ServiceStatus } from './PipelineStatusBar';
import { DelegationTriggerPanel } from '@/components/dashboard/delegation-control-plane/DelegationTriggerPanel';

import { resolveCommandBaseUrl } from '@/data-source/projection-base-url';
import { useEffectiveDataSource } from '@/data-source/useDataSourceOverride';

const NODE_GENERATION_COMPLETED_PROJECTION_TOPIC = 'onex.evt.omnimarket.node-generation-completed.v1';

type SeaProjectionRow = Partial<Omit<PipelineEvent, 'type'>> & {
  id?: unknown;
  correlation_id?: unknown;
  task_description?: unknown;
  provider?: unknown;
  model_id?: unknown;
  endpoint_ref?: unknown;
  resolved_endpoint?: unknown;
  routing_source?: unknown;
  projection_owner?: unknown;
  projection_reducer_version?: unknown;
  contract_yaml?: unknown;
  handler_source?: unknown;
  output_payload_sha256?: unknown;
  contract_sha256?: unknown;
  handler_sha256?: unknown;
  contract_passed?: unknown;
  contractPassed?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  type?: unknown;
};

type PromptSubmitState =
  | { phase: 'idle'; message?: string }
  | { phase: 'submitting'; message: string }
  | { phase: 'accepted'; message: string }
  | { phase: 'error'; message: string };

interface LiveGenerateResponse {
  correlation_id?: string;
  status?: string;
  error?: string;
  message?: string;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalText(value: unknown): string | null {
  return text(value);
}

function contractPassed(value: unknown, rowType: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'success', 'passed'].includes(normalized)) return true;
    if (['false', '0', 'error', 'failed'].includes(normalized)) return false;
  }
  return rowType === 'success';
}

function payloadFor(row: SeaProjectionRow): string | null {
  if (typeof row.payload === 'string') return row.payload;
  const isCanonicalGenerationRow =
    row.correlation_id !== undefined ||
    row.task_description !== undefined ||
    row.contract_passed !== undefined ||
    row.contract_yaml !== undefined ||
    row.handler_source !== undefined;
  if (!isCanonicalGenerationRow) return null;
  try {
    return JSON.stringify(row);
  } catch {
    return null;
  }
}

export function normalizeSeaProjectionRow(row: SeaProjectionRow): PipelineEvent | null {
  const timestamp = text(row.timestamp) ?? text(row.created_at);
  const correlationId = text(row.correlationId) ?? text(row.correlation_id);
  if (!timestamp || !correlationId) return null;

  const taskDescription = text(row.taskDescription) ?? text(row.task_description);
  const passed = contractPassed(row.contractPassed ?? row.contract_passed, row.type);
  const type = text(row.type);
  const eventType: PipelineEvent['type'] =
    type === 'request' || type === 'validation' || type === 'success' || type === 'error'
      ? type
      : passed
        ? 'success'
        : 'error';
  const message = text(row.message) ??
    `${passed ? 'Node generation completed' : 'Node generation failed validation'}${taskDescription ? `: ${taskDescription}` : ''}`;

  return {
    id: text(row.id) ?? `${correlationId}-completed`,
    type: eventType,
    timestamp,
    source: text(row.source) ?? 'node_generation_consumer',
    message,
    correlationId,
    taskDescription: taskDescription ?? undefined,
    selectedProvider: optionalText(row.selectedProvider ?? row.provider),
    selectedModel: optionalText(row.selectedModel ?? row.model_id),
    endpointRef: optionalText(row.endpointRef ?? row.endpoint_ref),
    resolvedEndpoint: optionalText(row.resolvedEndpoint ?? row.resolved_endpoint),
    routingSource: optionalText(row.routingSource ?? row.routing_source),
    projectionOwner: optionalText(row.projectionOwner ?? row.projection_owner),
    projectionReducerVersion: optionalText(row.projectionReducerVersion ?? row.projection_reducer_version),
    contractYaml: optionalText(row.contractYaml ?? row.contract_yaml),
    handlerSource: optionalText(row.handlerSource ?? row.handler_source),
    outputPayloadSha256: optionalText(row.outputPayloadSha256 ?? row.output_payload_sha256),
    contractSha256: optionalText(row.contractSha256 ?? row.contract_sha256),
    handlerSha256: optionalText(row.handlerSha256 ?? row.handler_sha256),
    payload: payloadFor(row),
  };
}

export default function ControlPlanePage({
  config: _config,
}: {
  config: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useProjectionQuery<SeaProjectionRow>({
    topic: NODE_GENERATION_COMPLETED_PROJECTION_TOPIC,
    queryKey: ['node-generation-completed'],
    refetchInterval: 5_000,
  });

  const [localEvents, setLocalEvents] = useState<PipelineEvent[]>([]);
  const [submitState, setSubmitState] = useState<PromptSubmitState>({ phase: 'idle' });

  const refreshSeaProjections = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['node-generation-completed'] });
    void queryClient.invalidateQueries({ queryKey: ['trace-explorer'] });
  }, [queryClient]);

  const refreshSeaProjectionsAfterWrite = useCallback(() => {
    refreshSeaProjections();
    window.setTimeout(refreshSeaProjections, 750);
  }, [refreshSeaProjections]);

  const allEvents = useMemo(() => {
    const projected = (data ?? []).map(normalizeSeaProjectionRow).filter((event): event is PipelineEvent => event !== null);
    return [...projected, ...localEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [data, localEvents]);

  const handlePromptSubmit = useCallback((prompt: string) => {
    // OMN-12775: file-mode client-side fabrication disabled — default to bus/projection.
    // No simulated:true events; projection data comes from the bus on the demo path.
    {
      // OMN-13007: resolve the command origin through the shared seam so the SEA
      // generate submit follows the runtime data-source override (chrome control)
      // exactly like every projection read. `null` means file mode — there is no
      // live backend, so the submit fails with an honest "switch to live" message
      // instead of silently posting to the page origin. `''` is the valid
      // same-origin proxy base.
      const baseUrl = resolveCommandBaseUrl();
      const now = Date.now();
      const pendingCorrelationId = `pending-${now}`;
      setSubmitState({ phase: 'submitting', message: `Submitting generation request: ${prompt}` });
      setLocalEvents((prev) => [
        ...prev,
        {
          id: `submit-${now}`,
          type: 'request' as const,
          timestamp: new Date(now).toISOString(),
          source: 'control-plane',
          message: `Submitted generation request: ${prompt}`,
          correlationId: pendingCorrelationId,
        },
      ]);
      void (async () => {
        try {
          if (baseUrl === null) {
            throw new Error(
              'Data source is in File (fixtures) mode — switch the chrome DATA SOURCE control to Live to submit a generation request.',
            );
          }
          const response = await fetch(`${baseUrl}/api/sea/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_description: prompt }),
          });
          if (!response.ok) {
            const body = await response.text().catch(() => '');
            const detail = body ? `: ${body}` : '';
            throw new Error(`HTTP ${response.status} ${response.statusText}${detail}`);
          }
          const body = await response.json().catch(() => ({})) as LiveGenerateResponse;
          const correlationId = body.correlation_id ?? pendingCorrelationId;
          const status = typeof body.status === 'string' ? body.status.toLowerCase() : 'success';
          if (status === 'failed' || status === 'error') {
            const reason = body.error ?? body.message ?? 'backend returned failed status';
            setSubmitState({
              phase: 'error',
              message: `Generation failed. Correlation: ${correlationId}. ${reason}`,
            });
            setLocalEvents((prev) => [
              ...prev,
              {
                id: `failed-${now}`,
                type: 'error' as const,
                timestamp: new Date().toISOString(),
                source: 'control-plane',
                message: `Generation failed in backend: ${correlationId} · ${reason}`,
                correlationId,
              },
            ]);
            refreshSeaProjectionsAfterWrite();
            return;
          }
          setSubmitState({
            phase: 'accepted',
            message: `Command accepted. Awaiting projection proof. Correlation: ${correlationId}`,
          });
          setLocalEvents((prev) => [
            ...prev,
            {
              id: `accepted-${now}`,
              type: 'request' as const,
              timestamp: new Date().toISOString(),
              source: 'control-plane',
              message: `Command accepted by backend: ${correlationId}. Waiting for projection-backed generation_events proof.`,
              correlationId,
            },
          ]);
          refreshSeaProjectionsAfterWrite();
        } catch (err: unknown) {
          console.warn('[ControlPlanePage] POST failed:', err);
          setSubmitState({ phase: 'error', message: `Submit failed: ${String(err)}` });
          setLocalEvents((prev) => [
            ...prev,
            {
              id: `err-${now}`,
              type: 'error' as const,
              timestamp: new Date(now).toISOString(),
              source: 'control-plane',
              message: `Failed to submit: ${String(err)}`,
              correlationId: `err-${now}`,
            },
          ]);
          refreshSeaProjections();
        }
      })();
    }
  }, [refreshSeaProjections, refreshSeaProjectionsAfterWrite]);

  // OMN-13007: effective mode honors the runtime chrome override so the SEA
  // widget's status flips to live the moment the operator switches source.
  const mode = useEffectiveDataSource().mode;
  const serviceStatus: ServiceStatus =
    mode === 'file'
      ? 'demo'
      : mode === 'sqlite'
        ? 'sqlite'
        : mode === 'http' || mode === 'postgres'
          ? 'up'
          : 'unknown';
  const isLive = mode === 'http' || mode === 'postgres';

  return (
    <ComponentWrapper
      title="Self-Extending Agent Control Plane"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={false}
      isLive={isLive}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          width: '100%',
        }}
      >
        <PipelineStatusBar
          kafka={serviceStatus}
          runtime={serviceStatus}
          mcp={serviceStatus}
        />

        <PromptInput
          onSubmit={handlePromptSubmit}
          status={submitState.phase}
          feedback={submitState.message}
        />
        {isLive && <DelegationTriggerPanel />}

        <div
          style={{
            marginInline: -12,
            width: 'calc(100% + 24px)',
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 6, paddingInline: 12 }}>
            <Text as="span" size="xs" weight="bold" color="tertiary" className="text-tracked text-upper">
              Pipeline Events
            </Text>
            {allEvents.length > 0 && (
              <Text as="span" size="xs" color="tertiary" className="mono" style={{ marginLeft: 8 }}>
                {allEvents.length} events
              </Text>
            )}
          </div>
          <PipelineLogStream events={allEvents} />
        </div>
      </div>
    </ComponentWrapper>
  );
}
