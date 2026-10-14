// @vitest-environment jsdom
import { useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLocalPageConfig } from '@/layout/local-page-loader';
import { WorkflowRun } from './LocalDashboardPage';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const component = loadLocalPageConfig('workflow').components[0];

afterEach(cleanup);

describe('Workflow run picker', () => {
  it('keeps an id entered after the form commits but before passive effects run', async () => {
    const onOpen = vi.fn();
    function EnterBeforeEffects() {
      // Deliver input in the layout phase to exercise input before passive effects,
      // without relying on the scheduler or a slow CI machine to reproduce the race.
      useLayoutEffect(() => {
        const input = screen.getByLabelText('Correlation id') as HTMLInputElement;
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setValue.call(input, RUN_ID);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, []);
      return <WorkflowRun component={component} snapshots={[]} requested={null} onOpen={onOpen} />;
    }
    await act(async () => { render(<EnterBeforeEffects />); });
    expect(screen.getByLabelText('Correlation id')).toHaveValue(RUN_ID);
    fireEvent.click(screen.getByRole('button', { name: 'Open run' }));
    expect(onOpen).toHaveBeenCalledWith(RUN_ID);
  });

  it('preserves a draft on refresh and resets it when the requested run changes', () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <WorkflowRun component={component} snapshots={[]} requested={null} onOpen={onOpen} />,
    );
    fireEvent.change(screen.getByLabelText('Correlation id'), { target: { value: 'unfinished draft' } });
    rerender(<WorkflowRun component={component} snapshots={[]} requested={null} onOpen={onOpen} />);
    expect(screen.getByLabelText('Correlation id')).toHaveValue('unfinished draft');
    rerender(<WorkflowRun component={component} snapshots={[]} requested={RUN_ID} onOpen={onOpen} />);
    expect(screen.getByLabelText('Correlation id')).toHaveValue(RUN_ID);
    rerender(<WorkflowRun component={component} snapshots={[]} requested={null} onOpen={onOpen} />);
    expect(screen.getByLabelText('Correlation id')).toHaveValue('');
  });
});
