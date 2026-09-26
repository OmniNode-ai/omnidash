import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionGraphView } from './ExecutionGraphView';
import { ExecutionGraphTransportProvider } from './ExecutionGraphTransport';
import { provisionalExecutionGraph } from './__fixtures__/provisionalGraph';

describe('ExecutionGraphView', () => {
  it('renders the transport projection and requests adjacent bounds through the transport', async () => {
    const laterGraph = {
      ...provisionalExecutionGraph,
      replay: { ...provisionalExecutionGraph.replay, source_cursors: [{ ...provisionalExecutionGraph.replay.source_cursors[0], max_kafka_offset: 43 }] },
    };
    const transport = {
      readLatest: vi.fn().mockResolvedValue(provisionalExecutionGraph),
      step: vi.fn().mockResolvedValue(laterGraph),
    };

    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <ExecutionGraphView correlationId="corr-provisional-001" />
      </ExecutionGraphTransportProvider>,
    );

    expect(await screen.findByRole('group', { name: 'Recorded delegation execution graph' })).toBeTruthy();
    expect(transport.readLatest).toHaveBeenCalledWith('corr-provisional-001');
    fireEvent.click(screen.getByRole('button', { name: /root\.v1/ }));
    expect(screen.getByText('env-root')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later bound' }));
    await waitFor(() => expect(transport.step).toHaveBeenCalledWith(
      'corr-provisional-001', provisionalExecutionGraph.replay.source_cursors, 'next',
    ));
    await waitFor(() => expect(screen.getByText('fold 1.0.0')).toBeTruthy());
  });

  it('fails closed when no trusted transport is provided', () => {
    render(<ExecutionGraphView correlationId="corr-provisional-001" />);
    expect(screen.getByText('Graph read is not connected.')).toBeTruthy();
    expect(screen.getByText(/does not accept tenant overrides/i)).toBeTruthy();
  });

  it('shows refusal without drawing a graph', async () => {
    const refusedGraph = {
      ...provisionalExecutionGraph,
      replay: { ...provisionalExecutionGraph.replay, refusal: 'envelope_id_collision' as const },
    };
    const transport = { readLatest: vi.fn().mockResolvedValue(refusedGraph), step: vi.fn() };
    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <ExecutionGraphView correlationId="corr-provisional-001" />
      </ExecutionGraphTransportProvider>,
    );
    expect(await screen.findByText('This replay was refused.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Recorded delegation execution graph' })).toBeNull();
  });
});
