import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';

// ── Projection types (OMN-12745) ──────────────────────────────────────
//
// Sourced from bus topic onex.evt.omnibase-infra.inference-response.v1.
// The projection reducer extracts ModelLlmInferenceResponse.generated_text
// and surfaces the latest response plus a recent history list.

export interface InferenceResponseRow {
  correlation_id: string;
  model_name: string;
  task_type: string;
  generated_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  captured_at: string;
}

export interface InferenceResponseProjection {
  latest_correlation_id: string;
  latest_model_name: string;
  latest_task_type: string;
  latest_generated_text: string;
  latest_prompt_tokens: number;
  latest_completion_tokens: number;
  latest_latency_ms: number;
  /** Bus topic that feeds this projection. */
  source_topic: string;
  recent_responses: InferenceResponseRow[];
  captured_at: string;
  /** True once the live projection emitter is deployed (OMN-12746). */
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationModelOutputConfig {
  /** Maximum number of recent responses to show in the history list. */
  maxHistory?: number;
  /** Show the full generated_text for the latest response. Default true. */
  showFullOutput?: boolean;
}

// ── Formatters ────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

// ── Response card ─────────────────────────────────────────────────────

function ResponseCard({
  row,
  fullText,
}: {
  row: InferenceResponseRow;
  fullText: boolean;
}) {
  const shortModel = row.model_name.split('/').pop() ?? row.model_name;
  const displayText = fullText
    ? row.generated_text
    : row.generated_text.slice(0, 160) + (row.generated_text.length > 160 ? '…' : '');

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: '12px 14px',
        background: 'var(--panel)',
      }}
    >
      {/* Header row: model + task + latency */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Text as="span" size="xs" family="mono" color="primary" weight="semibold">
          {shortModel}
        </Text>
        <Text as="span" size="xs" color="tertiary">
          ·
        </Text>
        <Text
          as="span"
          size="xs"
          family="mono"
          color="secondary"
          style={{
            display: 'inline-block',
            padding: '1px 5px',
            borderRadius: 3,
            background: 'var(--panel-2)',
            border: '1px solid var(--line-2)',
          }}
        >
          {row.task_type}
        </Text>
        <Text as="span" size="xs" color="tertiary">
          ·
        </Text>
        <Text as="span" size="xs" family="mono" tabularNums color="secondary">
          {fmtMs(row.latency_ms)}
        </Text>
        <Text as="span" size="xs" color="tertiary">
          ·
        </Text>
        <Text as="span" size="xs" family="mono" tabularNums color="tertiary">
          {(row.prompt_tokens + row.completion_tokens).toLocaleString()} tokens
        </Text>
      </div>

      {/* Generated text output */}
      <Text
        as="p"
        size="sm"
        color="primary"
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {displayText}
      </Text>
    </div>
  );
}

// ── History list ──────────────────────────────────────────────────────

function HistoryRow({ row }: { row: InferenceResponseRow }) {
  const shortModel = row.model_name.split('/').pop() ?? row.model_name;
  const preview = row.generated_text.slice(0, 80) + (row.generated_text.length > 80 ? '…' : '');
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '100px 80px 1fr',
        gap: 8,
        padding: '5px 0',
        borderBottom: '1px solid var(--line-2)',
        alignItems: 'start',
      }}
    >
      <Text as="span" size="xs" family="mono" color="primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortModel}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color="secondary"
        style={{
          display: 'inline-block',
          padding: '1px 4px',
          borderRadius: 3,
          background: 'var(--panel-2)',
          border: '1px solid var(--line-2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {row.task_type}
      </Text>
      <Text as="span" size="xs" color="secondary" style={{ wordBreak: 'break-word' }}>
        {preview}
      </Text>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationModelOutputWidget(props: {
  config: DelegationModelOutputConfig;
}) {
  const { config } = props;
  const maxHistory = config.maxHistory ?? 3;
  const showFullOutput = config.showFullOutput ?? true;

  const dataSourceMode = useDataSourceMode();

  const { data, isLoading, error } = useProjectionQuery<InferenceResponseProjection>({
    queryKey: ['delegation-model-output', TOPICS.inferenceResponseText],
    topic: TOPICS.inferenceResponseText,
    refetchInterval: 5_000,
  });

  const projection = useMemo<InferenceResponseProjection | null>(
    () => data?.[0] ?? null,
    [data],
  );

  const latestRow: InferenceResponseRow | null = projection
    ? {
        correlation_id: projection.latest_correlation_id,
        model_name: projection.latest_model_name,
        task_type: projection.latest_task_type,
        generated_text: projection.latest_generated_text,
        prompt_tokens: projection.latest_prompt_tokens,
        completion_tokens: projection.latest_completion_tokens,
        latency_ms: projection.latest_latency_ms,
        captured_at: projection.captured_at,
      }
    : null;

  const historyRows = useMemo(() => {
    if (!projection) return [];
    // Show history entries excluding the latest to avoid duplication.
    return projection.recent_responses.slice(1, maxHistory + 1);
  }, [projection, maxHistory]);

  const isEmpty = !projection || !projection.latest_generated_text;

  return (
    <ComponentWrapper
      title="Model Output"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No inference output"
      emptyHint={
        `Inference output appears once the projection emitter is deployed (OMN-12746). ` +
        `In file mode, add fixture files under fixtures/${encodeURIComponent(TOPICS.inferenceResponseText)}/`
      }
      fileMode={!isLiveDataSource(dataSourceMode)}
    >
      {projection && latestRow && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Source topic pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text as="span" size="xs" color="tertiary">
              Source:
            </Text>
            <Text
              as="span"
              size="xs"
              family="mono"
              color="secondary"
              style={{
                display: 'inline-block',
                padding: '1px 5px',
                borderRadius: 3,
                background: 'var(--panel-2)',
                border: '1px solid var(--line-2)',
              }}
            >
              {projection.source_topic}
            </Text>
          </div>

          {/* Latest response */}
          <ResponseCard row={latestRow} fullText={showFullOutput} />

          {/* History */}
          {historyRows.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text
                as="div"
                size="xs"
                color="secondary"
                weight="semibold"
                style={{ marginBottom: 6 }}
              >
                Recent responses
              </Text>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 80px 1fr',
                  gap: 8,
                  paddingBottom: 4,
                  borderBottom: '1px solid var(--line)',
                }}
              >
                {(['Model', 'Task', 'Preview'] as const).map((h) => (
                  <Text key={h} as="span" size="xs" color="tertiary">
                    {h}
                  </Text>
                ))}
              </div>
              {historyRows.map((row) => (
                <HistoryRow key={row.correlation_id} row={row} />
              ))}
            </div>
          )}

          {/* Upstream-blocked notice */}
          {!projection.provisioned && (
            <Text as="em" size="xs" color="tertiary" style={{ display: 'block', marginTop: 4 }}>
              upstream-blocked — displaying fixture data (OMN-12746 redeploy required for live
              surfacing).
            </Text>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
