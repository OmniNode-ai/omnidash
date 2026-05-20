import { useState, useCallback, useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { PromptInput } from './PromptInput';
import { PipelineLogStream, type PipelineEvent } from './PipelineLogStream';
import { PipelineStatusBar, type ServiceStatus } from './PipelineStatusBar';

const DEFAULT_DATA_SOURCE = 'file';

function isFixtureMode(): boolean {
  try {
    return (import.meta.env.VITE_DATA_SOURCE ?? DEFAULT_DATA_SOURCE) === 'file';
  } catch {
    return true;
  }
}

export default function ControlPlanePage({
  config: _config,
}: {
  config: Record<string, unknown>;
}) {
  const { data, isLoading, error } = useProjectionQuery<PipelineEvent>({
    topic: TOPICS.hackathonPipelineEvents,
    queryKey: ['hackathon-pipeline-events'],
    refetchInterval: 5_000,
  });

  const [localEvents, setLocalEvents] = useState<PipelineEvent[]>([]);

  const allEvents = useMemo(() => {
    const projected = data ?? [];
    return [...projected, ...localEvents].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [data, localEvents]);

  const handlePromptSubmit = useCallback((prompt: string) => {
    if (isFixtureMode()) {
      const now = new Date().toISOString();
      const correlationId = `demo-${Date.now()}`;
      const base = Date.now();
      setLocalEvents((prev) => [
        ...prev,
        {
          id: `local-${base}`,
          type: 'request' as const,
          timestamp: now,
          source: 'control-plane',
          message: `Node generation requested: ${prompt}`,
          correlationId,
        },
        {
          id: `local-${base}-val`,
          type: 'validation' as const,
          timestamp: new Date(base + 1200).toISOString(),
          source: 'validator',
          message: 'Contract schema validated: 0 errors',
          correlationId,
        },
        {
          id: `local-${base}-ok`,
          type: 'success' as const,
          timestamp: new Date(base + 3500).toISOString(),
          source: 'runtime',
          message: 'Contract materialized, MCP tool registered',
          correlationId,
        },
      ]);
    } else {
      const baseUrl =
        import.meta.env.VITE_HTTP_DATA_SOURCE_URL ??
        import.meta.env.VITE_SQLITE_DATA_SOURCE_URL ??
        '';
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
        } catch (err: unknown) {
          console.warn('[ControlPlanePage] POST failed:', err);
          const now = Date.now();
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
        }
      })();
    }
  }, []);

  const serviceStatus: ServiceStatus = isFixtureMode() ? 'demo' : 'up';

  return (
    <ComponentWrapper
      title="Self-Extending Agent Control Plane"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={false}
      isLive={!isFixtureMode()}
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

        <PromptInput onSubmit={handlePromptSubmit} />

        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
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
