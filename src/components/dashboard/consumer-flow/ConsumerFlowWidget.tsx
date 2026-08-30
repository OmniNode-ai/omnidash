// OMN-17197 (GOAL row 0, epic OMN-16776) -- the render end of the consumer-flow
// projection.
//
// Epic doctrine, applied literally: the client renders truth, it does not create
// it. `flow_state` is DERIVED IN `node_projection_consumer_flow` and arrives on
// the row. This widget never recomputes it, never infers it from the counters,
// and never invents a verdict for a row that carries none -- it sorts and formats
// what the projection already decided. A client that grades flow itself can be
// wrong about the platform in exactly the way that hides an outage (OMN-16755).
//
// The four-state distinction is the whole point of OMN-16777, so it must survive
// the render boundary: STALLED, STARVED, IDLE and FLOWING each carry their own
// label, their own glyph, and their own `data-flow-state` attribute. UNKNOWN -- a
// missed heartbeat window -- arrives with NULL counters and renders as "no
// reading", never `0`, because an unobserved zero and an observed zero are
// different facts.

import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text, type TextColor } from '@/components/ui/typography';

// Row shape mirrors the contract's projection_api.columns for
// onex.snapshot.projection.consumer-flow.v1.
export interface ConsumerFlowRow {
  consumer_group: string;
  topic: string;
  window_start: string;
  window_end: string;
  node_id?: string | null;
  ingest_sequence?: number | null;
  messages_in: number | null;
  messages_out: number | null;
  messages_dlq: number | null;
  handler_errors?: number | null;
  upstream_produced?: boolean | null;
  upstream_evidence?: string | null;
  flow_state: string;
  evaluated_at?: string | null;
}

export interface ConsumerFlowWidgetConfig {
  /** Max consumer-group rows to render after ordering. Default 25. */
  maxRows?: number;
  /** When true (default) IDLE rows are collapsed behind the summary line. */
  hideIdle?: boolean;
}

// Presentation of the four states (plus UNKNOWN).
//
// Severity ordering is a PRESENTATION concern -- which row an operator reads
// first. It is not a verdict: nothing here can turn a projection's IDLE into a
// STALLED or the reverse.
interface StatePresentation {
  label: string;
  glyph: string;
  color: TextColor;
  /** Lower sorts first. A stall an operator must act on outranks a quiet consumer. */
  rank: number;
}

const STATE_PRESENTATION: Record<string, StatePresentation> = {
  STALLED: { label: 'STALLED', glyph: 'X', color: 'bad', rank: 0 },
  STARVED: { label: 'STARVED', glyph: '!', color: 'bad', rank: 1 },
  UNKNOWN: { label: 'UNKNOWN', glyph: '?', color: 'warn', rank: 2 },
  FLOWING: { label: 'FLOWING', glyph: '>', color: 'ok', rank: 3 },
  IDLE: { label: 'IDLE', glyph: '.', color: 'tertiary', rank: 4 },
};

// A state the projection emits that this client has no presentation for renders
// under its own name and ranks ahead of the healthy states -- never silently
// folded into IDLE, never dropped from the table.
function presentationFor(state: string): StatePresentation {
  return STATE_PRESENTATION[state] ?? { label: state, glyph: '?', color: 'warn', rank: 2 };
}

/**
 * A counter the projection did not observe (UNKNOWN windows carry NULL) must not
 * render as `0`. Conflating "we did not look" with "we looked and saw nothing"
 * is the false-green this epic exists to close.
 */
export function formatCounter(value: number | null | undefined): string {
  return value === null || value === undefined ? 'no reading' : String(value);
}

const GRID = '1fr 1fr 100px 60px 60px 60px';

function HeaderRow() {
  const cell = (label: string) => (
    <Text as="span" size="xs" color="tertiary" weight="semibold">
      {label}
    </Text>
  );
  return (
    <div
      style={{
        padding: '4px 0',
        borderBottom: '1px solid var(--line)',
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 8,
        alignItems: 'center',
      }}
    >
      {cell('Consumer group')}
      {cell('Topic')}
      {cell('Flow')}
      {cell('In')}
      {cell('Out')}
      {cell('DLQ')}
    </div>
  );
}

function FlowRow({ row }: { row: ConsumerFlowRow }) {
  const p = presentationFor(row.flow_state);
  const unobserved = row.messages_in === null || row.messages_in === undefined;
  const counterColor: TextColor = unobserved ? 'tertiary' : 'secondary';
  return (
    <div
      data-testid="consumer-flow-row"
      data-flow-state={row.flow_state}
      data-consumer-group={row.consumer_group}
      style={{
        padding: '6px 0',
        borderBottom: '1px solid var(--line-2)',
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 8,
        alignItems: 'center',
      }}
    >
      <Text
        as="span"
        size="xs"
        family="mono"
        color="primary"
        title={row.consumer_group}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.consumer_group}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color="secondary"
        title={row.topic}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.topic}
      </Text>
      <Text as="span" size="xs" family="mono" color={p.color} data-testid="consumer-flow-state">
        <span aria-hidden="true">{p.glyph}</span> {p.label}
      </Text>
      <Text as="span" size="xs" family="mono" color={counterColor} data-testid="consumer-flow-in">
        {formatCounter(row.messages_in)}
      </Text>
      <Text as="span" size="xs" family="mono" color={counterColor} data-testid="consumer-flow-out">
        {formatCounter(row.messages_out)}
      </Text>
      <Text as="span" size="xs" family="mono" color={counterColor} data-testid="consumer-flow-dlq">
        {formatCounter(row.messages_dlq)}
      </Text>
    </div>
  );
}

/**
 * Newest window per (consumer_group, topic), ordered so an operator reads the
 * actionable rows first. The projection serves a rolling window history ordered
 * `window_end DESC`; the operator question is "what is this consumer doing NOW",
 * so older windows for the same pair collapse away rather than repeating.
 */
export function latestWindowPerConsumer(rows: ConsumerFlowRow[]): ConsumerFlowRow[] {
  const newest = new Map<string, ConsumerFlowRow>();
  for (const row of rows) {
    const key = `${row.consumer_group} ${row.topic}`;
    const seen = newest.get(key);
    if (!seen || row.window_end > seen.window_end) newest.set(key, row);
  }
  return [...newest.values()].sort((a, b) => {
    const rank = presentationFor(a.flow_state).rank - presentationFor(b.flow_state).rank;
    if (rank !== 0) return rank;
    return a.consumer_group.localeCompare(b.consumer_group);
  });
}

export default function ConsumerFlowWidget(props: { config?: ConsumerFlowWidgetConfig }) {
  const config = props.config ?? {};
  const maxRows = Math.max(0, config.maxRows ?? 25);
  const hideIdle = config.hideIdle ?? true;

  const { data, isLoading, error } = useProjectionQuery<ConsumerFlowRow>({
    queryKey: ['consumer-flow', TOPICS.consumerFlow],
    topic: TOPICS.consumerFlow,
    refetchInterval: 30_000,
  });

  const all = useMemo(() => latestWindowPerConsumer(data ?? []), [data]);
  const idleCount = useMemo(() => all.filter((r) => r.flow_state === 'IDLE').length, [all]);
  const shown = useMemo(() => {
    const filtered = hideIdle ? all.filter((r) => r.flow_state !== 'IDLE') : all;
    return filtered.slice(0, maxRows);
  }, [all, hideIdle, maxRows]);

  const isEmpty = all.length === 0;

  return (
    <ComponentWrapper
      title="Consumer Flow"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      isLive
      emptyMessage="No consumer-flow windows"
      emptyHint="Rows appear once the runtime heartbeat carries per-consumer flow windows and node_projection_consumer_flow materializes them (epic OMN-16776 Phase 1)."
    >
      {!isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text as="div" size="xs" color="tertiary" data-testid="consumer-flow-summary">
            {all.length} consumer{all.length === 1 ? '' : 's'} observed
            {hideIdle && idleCount > 0 ? ` (${idleCount} idle hidden)` : ''}
          </Text>
          {shown.length === 0 ? (
            <Text as="div" size="sm" color="ok" data-testid="consumer-flow-all-idle">
              Every observed consumer is IDLE. Nothing stalled, starved or unknown.
            </Text>
          ) : (
            <div>
              <HeaderRow />
              {shown.map((row) => (
                <FlowRow key={`${row.consumer_group} ${row.topic}`} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
