import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionGraphView } from './ExecutionGraphView';
import { ExecutionGraphTransportProvider, type ExecutionGraphTransport } from './ExecutionGraphTransport';
import type { ModelExecutionGraph } from './render-model';
import { formatModelSemVer } from './render-model';
import { provisionalExecutionGraph } from './__fixtures__/provisionalGraph';
import { historicalTopologyWithSyntheticWatermarks as realFiveHopGraph } from './__fixtures__/historicalTopologyWithSyntheticWatermarks';

describe('ExecutionGraphView', () => {
  it('preserves prerelease and build identifiers in pinned version labels', () => {
    expect(
      formatModelSemVer({
        major: 2,
        minor: 1,
        patch: 0,
        prerelease: ['rc', 2],
        build: ['fixture', '7'],
      }),
    ).toBe('2.1.0-rc.2+fixture.7');
  });

  it('renders the transport projection and requests adjacent bounds through the transport', async () => {
    const laterGraph = {
      ...provisionalExecutionGraph,
      replay: {
        ...provisionalExecutionGraph.replay,
        source_cursors: [
          {
            ...provisionalExecutionGraph.replay.source_cursors[0],
            max_ingest_watermark: 2,
          },
        ],
      },
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

    expect(
      await screen.findByRole('group', {
        name: 'Recorded delegation execution graph',
      }),
    ).toBeTruthy();
    expect(transport.readLatest).toHaveBeenCalledWith('corr-provisional-001');
    fireEvent.click(screen.getByRole('button', { name: /root\.v1/ }));
    expect(screen.getByText('env-root')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later bound' }));
    await waitFor(() => expect(transport.step).toHaveBeenCalledWith('corr-provisional-001', provisionalExecutionGraph.replay.source_cursors, 'next'));
    await waitFor(() => expect(screen.getByText('fold 1.0.0')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Earlier bound' }));
    await waitFor(() => expect(transport.step).toHaveBeenLastCalledWith('corr-provisional-001', laterGraph.replay.source_cursors, 'previous'));
    expect(screen.getAllByRole('button', { name: /\.v1\. Replay/ })).toHaveLength(2);
  });

  it('counts fixture replay statuses and exposes selected edge source evidence', async () => {
    const transport = {
      readLatest: vi.fn().mockResolvedValue(realFiveHopGraph),
      step: vi.fn(),
    };
    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <ExecutionGraphView correlationId={realFiveHopGraph.replay.correlation_id} />
      </ExecutionGraphTransportProvider>,
    );

    expect(await screen.findByText('5 recorded nodes, 4 recorded edges')).toBeTruthy();
    expect(screen.getByText('Replay passed (5)')).toBeTruthy();
    expect(screen.getByText('Replay failed (0)')).toBeTruthy();
    expect(screen.getByText('Unknown (0)')).toBeTruthy();
    expect(document.querySelectorAll('path[data-edge-kind]')).toHaveLength(4);

    const edge = screen.getByRole('button', {
      name: /97767c23-a7e5-485f-b747-0e0bf6ee24e7 to d88c5031-0da9-462a-80ef-8cc817934cc6/,
    });
    edge.focus();
    fireEvent.keyDown(edge, { key: 'Enter' });
    expect(screen.getByText('parent:d88c5031-0da9-462a-80ef-8cc817934cc6')).toBeTruthy();
    expect(screen.getByText('onex.cmd.omnibase-infra.delegation-request.v1')).toBeTruthy();
    expect(screen.getByText('partition 0, offset 2174')).toBeTruthy();
  });

  it('shows only read-model anchor, unresolved, and withheld status without fabricating graph edges', async () => {
    const source = realFiveHopGraph.replay.nodes[1].source_ref;
    const graphWithIncompleteEvidence = {
      ...realFiveHopGraph,
      replay: {
        ...realFiveHopGraph.replay,
        unresolved: [
          {
            subject_id: '00000000-0000-4000-8000-000000000001',
            reason: 'missing_parent',
            source_ref: source,
          },
        ],
        withheld_count: 2,
      },
    } as unknown as ModelExecutionGraph;
    const transport = {
      readLatest: vi.fn().mockResolvedValue(graphWithIncompleteEvidence),
      step: vi.fn(),
    };

    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <ExecutionGraphView correlationId={graphWithIncompleteEvidence.replay.correlation_id} />
      </ExecutionGraphTransportProvider>,
    );

    const evidenceStatus = await screen.findByRole('region', { name: 'Graph evidence status' });
    expect(within(evidenceStatus).getByText('Session anchor: unresolved')).toBeTruthy();
    expect(within(evidenceStatus).getByText('Unresolved records (1)')).toBeTruthy();
    expect(within(evidenceStatus).getByText('missing_parent')).toBeTruthy();
    expect(within(evidenceStatus).getByText('00000000-0000-4000-8000-000000000001')).toBeTruthy();
    expect(within(evidenceStatus).getByText('onex.cmd.omnibase-infra.delegation-request.v1')).toBeTruthy();
    expect(within(evidenceStatus).getByText('partition 0, offset 2174')).toBeTruthy();
    expect(within(evidenceStatus).getByText('Withheld evidence: 2')).toBeTruthy();
    expect(document.querySelectorAll('path[data-edge-kind]')).toHaveLength(4);
  });

  it('does not stop playback when a step takes longer than its interval', async () => {
    vi.useFakeTimers();
    let resolveStep: ((value: ModelExecutionGraph | null) => void) | undefined;
    const transport = {
      readLatest: vi.fn().mockResolvedValue(provisionalExecutionGraph),
      step: vi.fn<ExecutionGraphTransport['step']>(
        () =>
          new Promise<ModelExecutionGraph | null>((resolve) => {
            resolveStep = resolve;
          }),
      ),
    };
    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <ExecutionGraphView correlationId="corr-provisional-001" />
      </ExecutionGraphTransportProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(transport.step).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      resolveStep?.(provisionalExecutionGraph);
    });
    expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true');
    transport.step.mockImplementationOnce(() => Promise.resolve(null));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false');
    vi.useRealTimers();
  });

  it('fails closed when no trusted transport is provided', () => {
    render(<ExecutionGraphView correlationId="corr-provisional-001" />);
    expect(screen.getByText('Graph read is not connected.')).toBeTruthy();
    expect(screen.getByText(/does not accept tenant overrides/i)).toBeTruthy();
  });

  it('shows refusal without drawing a graph', async () => {
    const refusedGraph = {
      ...provisionalExecutionGraph,
      replay: {
        ...provisionalExecutionGraph.replay,
        refusal: 'envelope_id_collision' as const,
      },
    };
    const transport = {
      readLatest: vi.fn().mockResolvedValue(refusedGraph),
      step: vi.fn(),
    };
    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <ExecutionGraphView correlationId="corr-provisional-001" />
      </ExecutionGraphTransportProvider>,
    );
    expect(await screen.findByText('This replay was refused.')).toBeTruthy();
    expect(
      screen.queryByRole('group', {
        name: 'Recorded delegation execution graph',
      }),
    ).toBeNull();
  });
});
