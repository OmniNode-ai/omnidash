import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ExecutionGraphWorkspace } from './ExecutionGraphWorkspace';
import { ExecutionGraphTransportProvider } from './ExecutionGraphTransport';
import { provisionalExecutionGraph } from './__fixtures__/provisionalGraph';

it('opens outside the widget grid, fits the graph, and restores navigation on close', async () => {
  const readLatest = vi.fn().mockResolvedValue(provisionalExecutionGraph);
  const { container } = render(
    <ExecutionGraphTransportProvider transport={{ readLatest }}>
      <ExecutionGraphWorkspace correlationId="corr-provisional-001" isFixture />
    </ExecutionGraphTransportProvider>,
  );
  const dialog = screen.getByRole('dialog', { name: 'Execution graph' });
  expect(dialog.parentElement).toBe(document.body);
  expect(container.contains(dialog)).toBe(false);
  expect(document.body.style.overflow).toBe('hidden');
  const graph = await screen.findByRole('group', { name: 'Recorded delegation execution graph' });
  expect(graph).not.toHaveAttribute('width', '100%');
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(graph).not.toHaveAttribute('width', '100%');
  fireEvent.click(screen.getByRole('button', { name: 'Fit graph' }));
  expect(graph).toHaveAttribute('width', '100%');
  fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Open full-screen execution graph' }));
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('reads each selected execution separately instead of joining different roots', async () => {
  const readLatest = vi.fn().mockResolvedValue(provisionalExecutionGraph);
  render(<ExecutionGraphTransportProvider transport={{ readLatest }}>
    <ExecutionGraphWorkspace correlationId="first" isFixture runs={[
      { id: 'one', correlationId: 'first', taskType: 'First parent chain', modelName: 'fixture', status: 'projected', source: 'decision_projection' },
      { id: 'two', correlationId: 'second', taskType: 'Second parent chain', modelName: 'fixture', status: 'projected', source: 'decision_projection' },
    ]} />
  </ExecutionGraphTransportProvider>);
  await screen.findByRole('group', { name: 'Recorded delegation execution graph' });
  expect(readLatest).toHaveBeenLastCalledWith('first');
  fireEvent.change(screen.getByRole('combobox', { name: 'Recorded execution' }), { target: { value: 'second' } });
  await waitFor(() => expect(readLatest).toHaveBeenLastCalledWith('second'));
  await screen.findByRole('group', { name: 'Recorded delegation execution graph' });
  expect(screen.getAllByRole('group', { name: 'Recorded delegation execution graph' })).toHaveLength(1);
});
