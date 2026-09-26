import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionSnapshot } from '@/data-source';
import { useFrameStore } from '@/store/store';
import {
  DEFAULT_TRACE_FILTERS,
  filterTraceEvents,
  TraceExplorerView,
  type DelegationDecisionRow,
  type LiveEventRow,
} from './TraceExplorerWidget';
import type { WorkEventRow } from '@/components/dashboard/work-events/WorkEventsWidget';

const READ_AT = '2026-09-26T12:00:00Z';

function snapshot<T>(rows: T[]): ProjectionSnapshot<T> {
  return {
    rows,
    rowCount: rows.length,
    dataFreshness: 'fresh',
    latestEventAt: rows.length > 0 ? '2026-09-26T11:59:00Z' : null,
    readAt: READ_AT,
  };
}

function event(overrides: Partial<LiveEventRow> = {}): LiveEventRow {
  return {
    id: 'event-1',
    event_id: 'event-1',
    type: 'TOOL_EXECUTED',
    timestamp: '2026-09-26T11:55:00Z',
    source: 'omniclaude',
    topic: 'dev.onex.evt.omniclaude.tool-executed.v1',
    summary: 'Bash completed',
    payload: { command: 'npm test', api_key: 'must-not-render' },
    correlation_id: 'corr-alpha',
    ...overrides,
  };
}

const EVENTS = [
  event(),
  event({ id: 'event-2', event_id: 'event-2', type: 'ERROR', source: 'runtime', topic: 'prod.onex.evt.runtime.failed.v1', summary: 'Beta failed', correlation_id: 'corr-beta', timestamp: '2026-09-26T11:57:00Z' }),
  event({ id: 'event-3', event_id: 'event-3', type: 'PROMPT', source: 'omniclaude', topic: 'onex.evt.omniclaude.prompt-submitted.v1', summary: 'Prompt submitted', correlation_id: 'corr-gamma', timestamp: '2026-09-26T11:58:00Z' }),
];

function renderView(events = EVENTS) {
  return render(
    <TraceExplorerView
      eventSnapshot={snapshot(events)}
      decisionSnapshot={snapshot<DelegationDecisionRow>([])}
      workSnapshot={snapshot<WorkEventRow>([])}
      paused={false}
      onPausedChange={vi.fn()}
    />,
  );
}

describe('Event Trace filters — AC1', () => {
  it.each([
    ['correlation id', { correlationId: 'corr-alpha' }, 1],
    ['event type', { eventType: 'ERROR' }, 1],
    ['topic suffix', { topic: 'runtime.failed.v1' }, 1],
    ['start time', { start: '2026-09-26T11:56:00Z' }, 2],
    ['end time', { end: '2026-09-26T11:56:00Z' }, 1],
    ['multi-field search', { query: 'beta' }, 1],
  ])('narrows by %s', (_name, override, expected) => {
    expect(filterTraceEvents(EVENTS, { ...DEFAULT_TRACE_FILTERS, ...override })).toHaveLength(expected);
  });

  it('renders removable chips for active filters', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'runtime' } });
    fireEvent.change(screen.getByLabelText('Filter correlation id'), { target: { value: 'corr-beta' } });
    fireEvent.change(screen.getByLabelText('Filter event type'), { target: { value: 'ERROR' } });
    fireEvent.change(screen.getByLabelText('Filter topic suffix'), { target: { value: 'failed.v1' } });
    fireEvent.change(screen.getByLabelText('Filter start time'), { target: { value: '2026-09-26T11:56' } });
    fireEvent.change(screen.getByLabelText('Filter end time'), { target: { value: '2026-09-26T12:00' } });
    expect(within(screen.getByTestId('active-filter-chips')).getAllByRole('button')).toHaveLength(6);
  });
});

describe('Event Trace correlation pivot — AC2', () => {
  beforeEach(() => {
    useFrameStore.setState({ traceFilter: null });
  });

  it('calls setTraceFilter with a clicked correlation id', () => {
    const setTraceFilter = vi.fn();
    useFrameStore.setState({ setTraceFilter });
    renderView([EVENTS[0]]);
    fireEvent.click(screen.getByRole('button', { name: /correlation: corr-alpha/i }));
    expect(setTraceFilter).toHaveBeenCalledWith('corr-alpha');
  });

  it('consumes and clears traceFilter on mount', () => {
    const setTraceFilter = vi.fn((value: string | null) => useFrameStore.setState({ traceFilter: value }));
    useFrameStore.setState({ traceFilter: 'corr-beta', setTraceFilter });
    renderView();
    expect(screen.getByLabelText('Filter correlation id')).toHaveValue('corr-beta');
    expect(setTraceFilter).toHaveBeenCalledWith(null);
    expect(useFrameStore.getState().traceFilter).toBeNull();
  });
});

describe('Event Trace heartbeat default — AC3', () => {
  it('excludes a row set that is 88 percent heartbeat, then includes it when toggled', () => {
    const rows = [
      event({ id: 'normal', event_id: 'normal' }),
      ...Array.from({ length: 7 }, (_, index) => event({
        id: `heartbeat-${index}`,
        event_id: `heartbeat-${index}`,
        type: 'onex.evt.platform.node-heartbeat.v1',
        topic: `env-${index}.node-heartbeat.v1`,
      })),
    ];
    renderView(rows);
    expect(screen.getAllByTestId('trace-event-row')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Include heartbeats'));
    expect(screen.getAllByTestId('trace-event-row')).toHaveLength(8);
  });
});
