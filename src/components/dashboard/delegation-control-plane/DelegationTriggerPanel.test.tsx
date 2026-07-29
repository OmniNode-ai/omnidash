import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationTriggerPanel } from './DelegationTriggerPanel';
import * as delegationApi from '@/services/delegation-api';

describe('DelegationTriggerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders collapsed trigger button initially', () => {
    render(<DelegationTriggerPanel />);
    expect(screen.getByText(/Trigger delegation/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Delegate$/i })).toBeNull();
  });

  it('expands the form on click', () => {
    render(<DelegationTriggerPanel />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));
    expect(screen.getByRole('button', { name: /^Delegate$/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/question, constraints, and desired conclusion/i)).toBeTruthy();
    expect(screen.getByText(/bounded question/i)).toBeTruthy();
  });

  it('dispatch button is disabled when prompt is empty', () => {
    render(<DelegationTriggerPanel />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));
    const dispatch = screen.getByRole('button', { name: /^Delegate$/i });
    expect(dispatch).toBeDefined();
    expect((dispatch as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls triggerDelegation with prompt and task_type on submit', async () => {
    const mockTrigger = vi.spyOn(delegationApi, 'triggerDelegation').mockResolvedValue({
      correlation_id: 'test-corr-id',
      accepted: true,
    });

    render(<DelegationTriggerPanel />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));

    const textarea = screen.getByPlaceholderText(/question, constraints, and desired conclusion/i);
    fireEvent.change(textarea, { target: { value: 'Review this PR for correctness' } });

    fireEvent.click(screen.getByRole('button', { name: /^Delegate$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Accepted/i)).toBeTruthy();
    });

    expect(mockTrigger).toHaveBeenCalledWith({
      prompt: 'Review this PR for correctness',
      task_type: 'reasoning',
    });
    expect(screen.getByText('test-corr-id')).toBeTruthy();
  });

  it('shows error message on trigger failure', async () => {
    vi.spyOn(delegationApi, 'triggerDelegation').mockRejectedValue(
      new Error('runtime unreachable'),
    );

    render(<DelegationTriggerPanel />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));

    const textarea = screen.getByPlaceholderText(/question, constraints, and desired conclusion/i);
    fireEvent.change(textarea, { target: { value: 'some prompt' } });

    fireEvent.click(screen.getByRole('button', { name: /^Delegate$/i }));

    await waitFor(() => {
      expect(screen.getByText(/runtime unreachable/i)).toBeTruthy();
    });
  });

  it('calls onCorrelationId callback with returned correlation_id', async () => {
    vi.spyOn(delegationApi, 'triggerDelegation').mockResolvedValue({
      correlation_id: 'corr-abc-123',
      accepted: true,
    });

    const onCorrelationId = vi.fn();
    render(<DelegationTriggerPanel onCorrelationId={onCorrelationId} />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));

    const textarea = screen.getByPlaceholderText(/question, constraints, and desired conclusion/i);
    fireEvent.change(textarea, { target: { value: 'some prompt' } });
    fireEvent.click(screen.getByRole('button', { name: /^Delegate$/i }));

    await waitFor(() => {
      expect(onCorrelationId).toHaveBeenCalledWith('corr-abc-123');
    });
  });

  it('keeps an in-flight dispatch open until the request settles', async () => {
    let resolveDispatch!: (value: { correlation_id: string; accepted: boolean }) => void;
    vi.spyOn(delegationApi, 'triggerDelegation').mockReturnValue(
      new Promise((resolve) => {
        resolveDispatch = resolve;
      }),
    );

    render(<DelegationTriggerPanel />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));
    fireEvent.change(screen.getByPlaceholderText(/question, constraints, and desired conclusion/i), {
      target: { value: 'hold this dispatch open' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Delegate$/i }));

    const closeButton = screen.getByRole('button', { name: /close delegation form/i });
    expect(closeButton).toBeDisabled();
    fireEvent.click(closeButton);
    expect(screen.getByPlaceholderText(/question, constraints, and desired conclusion/i)).toHaveValue('hold this dispatch open');

    resolveDispatch({ correlation_id: 'corr-pending-1', accepted: true });
    expect(await screen.findByText('corr-pending-1')).toBeInTheDocument();
    expect(closeButton).not.toBeDisabled();
  });

  it('explains each task type and updates prompt guidance from the shared contract', () => {
    render(<DelegationTriggerPanel collapsible={false} />);

    const taskType = screen.getByLabelText('Task type');
    expect(screen.getByRole('option', { name: 'Complex reasoning' })).toBeInTheDocument();
    fireEvent.change(taskType, { target: { value: 'complex_reasoning' } });

    expect(screen.getByText(/multi-step or high-context problem/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/context, dependencies, constraints, and the decision/i)).toBeInTheDocument();
  });

  it('uses the shared primary CTA styling', () => {
    render(<DelegationTriggerPanel collapsible={false} />);
    expect(screen.getByRole('button', { name: /^Delegate$/i })).toHaveClass('btn', 'primary');
  });
});
