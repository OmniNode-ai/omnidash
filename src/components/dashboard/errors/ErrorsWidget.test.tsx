import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectionSnapshot } from '@/data-source';
import { useFrameStore } from '@/store/store';
import { ErrorsView, type RuntimeErrorFingerprintRow } from './ErrorsWidget';
import type { ConsumerFlowRow } from '@/components/dashboard/consumer-flow/ConsumerFlowWidget';
import type { LiveEventRow } from '@/components/dashboard/trace-explorer/TraceExplorerWidget';

function snapshot<T>(rows: T[]): ProjectionSnapshot<T> {
  const now = new Date().toISOString();
  return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: now, readAt: now };
}

describe('ErrorsView', () => {
  it('renders the typed missing-producer state for zero fingerprint rows', () => {
    render(<ErrorsView consumerSnapshot={snapshot<ConsumerFlowRow>([])} eventSnapshot={snapshot<LiveEventRow>([])} fingerprintSnapshot={snapshot<RuntimeErrorFingerprintRow>([])} config={{ window: 'all' }} />);
    expect(screen.getByText('Runtime error producer missing').closest('[data-empty-state-reason]')).toHaveAttribute('data-empty-state-reason', 'upstream-blocked');
    expect(screen.getByText(/runtime errors are not yet emitted as bus events/i)).toBeInTheDocument();
  });

  it('hands a live error correlation id to setTraceFilter', () => {
    const setTraceFilter = vi.fn();
    useFrameStore.setState({ setTraceFilter });
    const row: LiveEventRow = { id: 'error-1', type: 'ERROR', timestamp: new Date().toISOString(), source: 'runtime', topic: 'onex.evt.runtime.failed.v1', summary: 'failed', payload: {}, correlation_id: 'corr-error' };
    render(<ErrorsView consumerSnapshot={snapshot<ConsumerFlowRow>([])} eventSnapshot={snapshot([row])} fingerprintSnapshot={snapshot<RuntimeErrorFingerprintRow>([])} config={{ window: 'all' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'corr-error' }));
    expect(setTraceFilter).toHaveBeenCalledWith('corr-error');
  });

  it('counts only the STALLED row when a healthy CONSUMING sink is present', () => {
    const now = new Date().toISOString();
    const base: ConsumerFlowRow = {
      consumer_group: 'local.omnimarket.writer.consume.1.0.0',
      topic: 'onex.evt.omnimarket.write-requested.v1',
      window_start: now,
      window_end: now,
      messages_in: 3,
      messages_out: 0,
      messages_dlq: 0,
      handler_errors: 0,
      flow_state: 'CONSUMING',
    };
    const stalled: ConsumerFlowRow = {
      ...base,
      consumer_group: 'local.omnimarket.publisher.consume.1.0.0',
      flow_state: 'STALLED',
    };

    render(
      <ErrorsView
        consumerSnapshot={snapshot([base, stalled])}
        eventSnapshot={snapshot<LiveEventRow>([])}
        fingerprintSnapshot={snapshot<RuntimeErrorFingerprintRow>([])}
        config={{ window: 'all' }}
      />,
    );

    expect(screen.getByText(/STALLED 1/)).toBeInTheDocument();
    expect(screen.getAllByTestId('consumer-error-row')).toHaveLength(1);
    expect(screen.getByText(stalled.consumer_group)).toBeInTheDocument();
    expect(screen.queryByText(base.consumer_group)).not.toBeInTheDocument();
  });
});
