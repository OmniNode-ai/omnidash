import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ComponentWrapper } from '../ComponentWrapper';
import { PromptInput } from './PromptInput';
import { resolveCommandBaseUrl } from '@/data-source/projection-base-url';
import { useEffectiveDataSource } from '@/data-source/useDataSourceOverride';
import { isLiveDataSource } from '@/hooks/useDataSourceMode';
import { submitGeneration } from '@/services/event-dash-api';

type PromptSubmitState =
  | { phase: 'idle'; message?: string }
  | { phase: 'submitting'; message: string }
  | { phase: 'accepted'; message: string }
  | { phase: 'error'; message: string };

export default function ControlPlanePage({
  config: _config,
}: {
  config: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const [submitState, setSubmitState] = useState<PromptSubmitState>({ phase: 'idle' });
  const mode = useEffectiveDataSource().mode;
  const isLive = isLiveDataSource(mode);

  const refreshSystemEventStream = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['live-event-stream'] });
  }, [queryClient]);

  const refreshSystemEventStreamAfterWrite = useCallback(() => {
    refreshSystemEventStream();
    window.setTimeout(refreshSystemEventStream, 750);
  }, [refreshSystemEventStream]);

  const handlePromptSubmit = useCallback((prompt: string) => {
    const baseUrl = resolveCommandBaseUrl();
    setSubmitState({ phase: 'submitting', message: `Submitting node generation request: ${prompt}` });

    void (async () => {
      try {
        if (baseUrl === null) {
          throw new Error(
            'Data source is in File (fixtures) mode — switch the DATA SOURCE control to Live to create a node.',
          );
        }

        const body = await submitGeneration(prompt, baseUrl);
        const correlationId = body.correlation_id ?? 'unavailable';
        const status = typeof body.status === 'string' ? body.status.toLowerCase() : 'success';
        if (status === 'failed' || status === 'error') {
          const reason = body.error ?? body.message ?? 'backend returned failed status';
          setSubmitState({
            phase: 'error',
            message: `Generation failed. Correlation: ${correlationId}. ${reason}`,
          });
          refreshSystemEventStreamAfterWrite();
          return;
        }

        setSubmitState({
          phase: 'accepted',
          message: `Command accepted. Follow correlation ${correlationId} in the System Event Stream.`,
        });
        refreshSystemEventStreamAfterWrite();
      } catch (err: unknown) {
        console.warn('[ControlPlanePage] POST failed:', err);
        setSubmitState({ phase: 'error', message: `Submit failed: ${String(err)}` });
        refreshSystemEventStream();
      }
    })();
  }, [refreshSystemEventStream, refreshSystemEventStreamAfterWrite]);

  return (
    <ComponentWrapper title="Create Node" isLive={isLive}>
      <PromptInput
        onSubmit={handlePromptSubmit}
        status={submitState.phase}
        feedback={submitState.message}
      />
    </ComponentWrapper>
  );
}
