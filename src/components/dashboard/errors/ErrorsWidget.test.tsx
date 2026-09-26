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
});
