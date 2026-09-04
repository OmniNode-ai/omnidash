// OMN-17874 (epic OMN-16776, group G2) -- the render end of the work-events
// projection, and the DECLARED READER that
// `onex.snapshot.projection.work.events.v1` needs now that OMN-17772 flipped it
// to `bus_backed: true`.
//
// Why this widget exists when omnimarket's `/morning` page already renders the
// same exposure: the OMN-17199 gate
// (`omnibase_infra.validators.bus_backed_exposure_readers`) counts exactly three
// reader shapes -- a component in the omnidash component registry declaring the
// topic in its `dataSources`, that component placed in a shipped layout, or a
// reasoned `consumers: none`. A server-rendered omnimarket page is none of the
// three. OMN-17772 delivered its own scope item 3 (the morning-page panel, AC3
// proven with measured rows); this is the separate omnidash reader, the exact
// counterpart OMN-17775 was to OMN-17774 for session-replay.
//
// It also retires an escape hatch. omnimarket#2294 declared `consumers: none`
// on this exposure to unblock three unrelated omnibase_infra PRs, with the
// reason recording that reader work must remove it. The validator fails
// `stale_opt_out` on an opt-out standing over a live reader, so the omnimarket
// half of this ticket deletes that block.
//
// Epic doctrine, applied literally: the client renders truth, it does not create
// it. `event_kind`, `actor_kind`, `summary` and `ticket_id` are all authored by
// `node_projection_work_events`. This widget orders and formats them; it never
// re-derives an event kind from the source topic, never invents a summary from
// the payload, and never turns an unrecorded ticket into a blank that reads as
// "no ticket was involved".

import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text, type TextColor } from '@/components/ui/typography';

// Row shape mirrors the contract's projection_api.columns for
// onex.snapshot.projection.work.events.v1, in declaration order.
export interface WorkEventRow {
  event_id: string;
  emitted_at: string;
  event_kind: string;
  actor_kind?: string | null;
  actor_id?: string | null;
  ticket_id?: string | null;
  summary?: string | null;
  source_topic?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface WorkEventsWidgetConfig {
  /** Max work-event rows to render after ordering. Default 25. */
  maxRows?: number;
}

// Presentation only. An event_kind the projection emits that this client has no
// entry for renders under its OWN name rather than being folded into a bucket --
// silently collapsing an unrecognised kind is how a newly-projected class of
// work disappears from the surface that is supposed to prove it happened.
const EVENT_KIND_COLOR: Record<string, TextColor> = {
  'session.start': 'ok',
  'session.end': 'ok',
  'session.tool': 'primary',
  'session.prompt': 'warn',
};

export function eventKindColor(eventKind: string): TextColor {
  return EVENT_KIND_COLOR[eventKind] ?? 'secondary';
}

/**
 * A ticket the projection did not record must not render as an empty cell.
 * `ticket_id` is nullable on the relation, and an empty cell is indistinguishable
 * from "this work touched no ticket" -- which is a claim the projection never
 * made. Say "unattributed" in words instead.
 */
export function formatTicket(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? 'unattributed' : value;
}

/**
 * A row the projection served with no summary renders the fact, not a guess.
 * The payload is right there and a plausible sentence could be assembled from
 * it; assembling one would make this client the author of a value the reducer
 * declined to write.
 */
export function formatSummary(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? 'no summary recorded' : value;
}

/**
 * Newest event first, then by descending `event_id` inside the same instant.
 *
 * Presentation ordering only. The contract's own `order_by` is
 * `emitted_at DESC`, so this agrees with the serving order rather than fighting
 * it; it is restated here because a bus-backed exposure serves from the snapshot
 * cache, whose iteration order is a cache-internal detail and not the contract's
 * promise. The tie-break is `event_id` -- the exposure's content-addressed
 * `key_columns` value -- so two events stamped at the same microsecond order
 * deterministically instead of by whatever order the cache happened to yield.
 * No value on any row is altered.
 */
export function newestFirst(rows: WorkEventRow[]): WorkEventRow[] {
  return [...rows].sort((a, b) => {
    if (a.emitted_at !== b.emitted_at) return a.emitted_at < b.emitted_at ? 1 : -1;
    return a.event_id < b.event_id ? 1 : a.event_id > b.event_id ? -1 : 0;
  });
}

const GRID = '1.4fr 110px 1.6fr 130px';

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
      {cell('Actor')}
      {cell('Kind')}
      {cell('Summary')}
      {cell('Ticket')}
    </div>
  );
}

function EventRow({ row }: { row: WorkEventRow }) {
  const unattributed = row.ticket_id === null || row.ticket_id === undefined || row.ticket_id === '';
  return (
    <div
      data-testid="work-events-row"
      data-event-id={row.event_id}
      data-event-kind={row.event_kind}
      data-actor-kind={row.actor_kind ?? ''}
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
        title={row.actor_id ?? ''}
        data-testid="work-events-actor"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.actor_id ?? ''}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color={eventKindColor(row.event_kind)}
        data-testid="work-events-kind"
      >
        {row.event_kind}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color="secondary"
        title={row.source_topic ?? ''}
        data-testid="work-events-summary"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {formatSummary(row.summary)}
      </Text>
      <Text
        as="span"
        size="xs"
        family="mono"
        color={unattributed ? 'tertiary' : 'secondary'}
        data-testid="work-events-ticket"
      >
        {formatTicket(row.ticket_id)}
      </Text>
    </div>
  );
}

export default function WorkEventsWidget(props: { config?: WorkEventsWidgetConfig }) {
  const config = props.config ?? {};
  const maxRows = Math.max(0, config.maxRows ?? 25);

  const { data, isLoading, error } = useProjectionQuery<WorkEventRow>({
    queryKey: ['work-events-widget', TOPICS.workEvents],
    topic: TOPICS.workEvents,
    refetchInterval: 30_000,
  });

  const ordered = useMemo(() => newestFirst(data ?? []), [data]);
  const actorCount = useMemo(
    () => new Set(ordered.map((r) => r.actor_id ?? '')).size,
    [ordered],
  );
  const shown = useMemo(() => ordered.slice(0, maxRows), [ordered, maxRows]);
  const isEmpty = ordered.length === 0;

  return (
    <ComponentWrapper
      title="Work Events"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      isLive
      emptyMessage="No work events"
      emptyHint="Rows appear once session lifecycle events reach node_projection_work_events and it republishes each materialized row onto the snapshot topic (OMN-17772). Hook traffic publishes on the stability lane while this consumer runs on dev, which OMN-17034 tracks."
    >
      {!isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text as="div" size="xs" color="tertiary" data-testid="work-events-summary-line">
            {ordered.length} work event{ordered.length === 1 ? '' : 's'} across {actorCount} actor
            {actorCount === 1 ? '' : 's'}
          </Text>
          <div>
            <HeaderRow />
            {shown.map((row) => (
              <EventRow key={row.event_id} row={row} />
            ))}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
