import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { PromptInput } from './PromptInput';
import { PipelineLogStream, type PipelineEvent } from './PipelineLogStream';
import { PipelineStatusBar, type ServiceStatus } from './PipelineStatusBar';
import { DelegationTriggerPanel } from '@/components/dashboard/delegation-control-plane/DelegationTriggerPanel';

import { DATA_SOURCE_DEFAULT_MODE } from '@/config/generated/data-source-defaults';

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

function getDataSourceMode(): string {
  try {
    return import.meta.env.VITE_DATA_SOURCE ?? DATA_SOURCE_DEFAULT_MODE;
  } catch {
    return 'file';
  }
}

export default function ControlPlanePage({
  config: _config,
}: {
  config: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useProjectionQuery<PipelineEvent>({
    topic: TOPICS.hackathonPipelineEvents,
    queryKey: ['hackathon-pipeline-events'],
    refetchInterval: 5_000,
  });

  const [localEvents, setLocalEvents] = useState<PipelineEvent[]>([]);
  const [submitState, setSubmitState] = useState<PromptSubmitState>({ phase: 'idle' });

  const refreshSeaProjections = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['hackathon-pipeline-events'] });
    void queryClient.invalidateQueries({ queryKey: ['trace-explorer'] });
  }, [queryClient]);

  const refreshSeaProjectionsAfterWrite = useCallback(() => {
    refreshSeaProjections();
    window.setTimeout(refreshSeaProjections, 750);
  }, [refreshSeaProjections]);

  const allEvents = useMemo(() => {
    const projected = data ?? [];
    return [...projected, ...localEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [data, localEvents]);

  const handlePromptSubmit = useCallback((prompt: string) => {
    const mode = getDataSourceMode();
    if (mode === 'file') {
      const now = new Date().toISOString();
      const correlationId = `demo-${Date.now()}`;
      const base = Date.now();
      setSubmitState({ phase: 'accepted', message: `Demo request queued: ${prompt}` });
      setLocalEvents((prev) => [
        ...prev,
        {
          id: `local-${base}`,
          type: 'request' as const,
          timestamp: now,
          source: 'control-plane',
          message: `Node generation requested: ${prompt}`,
          correlationId,
          simulated: true,
        },
        {
          id: `local-${base}-val`,
          type: 'validation' as const,
          timestamp: new Date(base + 1200).toISOString(),
          source: 'validator',
          message: 'Contract schema validated: 0 errors',
          correlationId,
          simulated: true,
        },
        {
          id: `local-${base}-ok`,
          type: 'success' as const,
          timestamp: new Date(base + 3500).toISOString(),
          source: 'runtime',
          message: 'Contract materialized, MCP tool registered',
          correlationId,
          simulated: true,
        },
      ]);
    } else {
      const baseUrl =
        import.meta.env.VITE_HTTP_DATA_SOURCE_URL ??
        import.meta.env.VITE_SQLITE_DATA_SOURCE_URL ??
        '';
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
          if (!baseUrl) throw new Error('Missing data source base URL');
          const response = await fetch(`${baseUrl}/api/hackathon/generate`, {
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
            message: `Generation request accepted. Correlation: ${correlationId}`,
          });
          setLocalEvents((prev) => [
            ...prev,
            {
              id: `accepted-${now}`,
              type: 'success' as const,
              timestamp: new Date().toISOString(),
              source: 'control-plane',
              message: `Generation request accepted by backend: ${correlationId}`,
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

  const mode = getDataSourceMode();
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
