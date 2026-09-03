// OMN-17775 (GOAL row 0 leg (b)/(c), epic OMN-16776) -- the render end of the
// session-replay projection, and the DECLARED READER that
// `onex.snapshot.projection.session.replay.v1` needs before OMN-17774 may flip it
// to `bus_backed: true`.
//
// Why this widget exists when `SessionReplayPage` already reads the same topic:
// the OMN-17199 gate (`omnibase_infra.validators.bus_backed_exposure_readers`)
// counts exactly three reader shapes -- a component in the omnidash component
// registry declaring the topic in its `dataSources`, that component placed in a
// shipped layout, or a reasoned `consumers: none`. A page is none of the three,
// and neither is omnimarket's server-rendered `/morning`. An exposure is a
// promise that somebody looks; the registry is where that promise is declared.
//
// Epic doctrine, applied literally: the client renders truth, it does not create
// it. `event_type`, `sequence`, `cumulative_tokens` and `is_checkpoint` are all
// DERIVED IN `node_projection_session_replay` and arrive on the row. This widget
// orders and formats them; it never recomputes one, never infers an event_type
// from `node_name`, and never renumbers a sequence. Ordering is presentation --
// it cannot turn one projection value into another.

import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text, type TextColor } from '@/components/ui/typography';

// Row shape mirrors the contract's projection_api.columns for
// onex.snapshot.projection.session.replay.v1, in declaration order.
export interface SessionReplayRow {
  snapshot_id: string;
  session_id: string;
  sequence: number;
  timestamp: string;
  event_type: string;
  node_name?: string | null;
  state_delta?: Record<string, unknown> | null;
  cumulative_tokens?: number | null;
  is_checkpoint?: boolean | null;
}

export interface SessionReplayWidgetConfig {
  /** Max snapshot rows to render after ordering. Default 25. */
  maxRows?: number;
}

// Presentation only. An event_type the projection emits that this client has no
// entry for renders under its OWN name rather than being folded into a bucket --
// silently collapsing an unrecognised event type is how a new lifecycle event
// disappears from the surface that is supposed to prove it happened.
const EVENT_TYPE_COLOR: Record<string, TextColor> = {
  session_start: 'ok',
  session_end: 'ok',
  user_input: 'warn',
  tool_call: 'primary',
  checkpoint: 'tertiary',
};

export function eventTypeColor(eventType: string): TextColor {
  return EVENT_TYPE_COLOR[eventType] ?? 'secondary';
}

/**
 * A token total the projection did not record must not render as `0`.
 * `cumulative_tokens` is `NOT NULL DEFAULT 0` in the migration, so a NULL here
 * means the column was absent from the served row, not that the session spent
 * nothing. Conflating "not recorded" with "recorded as zero" is the false-green
 * this epic exists to close.
 */
export function formatTokens(value: number | null | undefined): string {
  return value === null || value === undefined ? 'no reading' : String(value);
}

/**
 * Newest event first, then by descending sequence inside the same timestamp.
 *
 * Presentation ordering only: the projection serves `session_id, sequence ASC`
 * (its contract `order_by`), which answers "replay this session from the start".
 * The operator question this widget answers is the other one -- "what has the
 * platform recorded most recently" -- so the same rows are ordered the other way
 * round. No value on any row is altered.
 */
export function newestFirst(rows: SessionReplayRow[]): SessionReplayRow[] {
  return [...rows].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
    return b.sequence - a.sequence;
  });
}

const GRID = '1.6fr 70px 110px 1fr 90px';

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
      {cell('Session')}
      {cell('Seq')}
      {cell('Event')}
      {cell('Node')}
      {cell('Tokens')}
    </div>
  );
}

function SnapshotRow({ row }: { row: SessionReplayRow }) {
  const unrecorded = row.cumulative_tokens === null || row.cumulative_tokens === undefined;
  return (
    <div
      data-testid="session-replay-row"
      data-session-id={row.session_id}
      data-event-type={row.event_type}
      data-checkpoint={row.is_checkpoint ? 'true' : 'false'}
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
        title={row.session_id}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.session_id}
      </Text>
      <Text as="span" size="xs" family="mono" color="secondary" data-testid="session-replay-sequence">
        {row.sequence}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color={eventTypeColor(row.event_type)}
        data-testid="session-replay-event-type"
      >
        {row.event_type}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color="secondary"
        title={row.node_name ?? ''}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.node_name ?? ''}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color={unrecorded ? 'tertiary' : 'secondary'}
        data-testid="session-replay-tokens"
      >
        {formatTokens(row.cumulative_tokens)}
      </Text>
    </div>
  );
}

export default function SessionReplayWidget(props: { config?: SessionReplayWidgetConfig }) {
  const config = props.config ?? {};
  const maxRows = Math.max(0, config.maxRows ?? 25);

  const { data, isLoading, error } = useProjectionQuery<SessionReplayRow>({
    queryKey: ['session-replay-widget', TOPICS.sessionReplay],
    topic: TOPICS.sessionReplay,
    refetchInterval: 30_000,
  });

  const ordered = useMemo(() => newestFirst(data ?? []), [data]);
  const sessionCount = useMemo(
    () => new Set(ordered.map((r) => r.session_id)).size,
    [ordered],
  );
  const shown = useMemo(() => ordered.slice(0, maxRows), [ordered, maxRows]);
  const isEmpty = ordered.length === 0;

  return (
    <ComponentWrapper
      title="Session Replay"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      isLive
      emptyMessage="No session replay snapshots"
      emptyHint="Rows appear once session lifecycle events reach node_projection_session_replay and it republishes each materialized row onto the snapshot topic (OMN-17774)."
    >
      {!isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text as="div" size="xs" color="tertiary" data-testid="session-replay-summary">
            {ordered.length} snapshot{ordered.length === 1 ? '' : 's'} across {sessionCount} session
            {sessionCount === 1 ? '' : 's'}
          </Text>
          <div>
            <HeaderRow />
            {shown.map((row) => (
              <SnapshotRow key={row.snapshot_id} row={row} />
            ))}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
