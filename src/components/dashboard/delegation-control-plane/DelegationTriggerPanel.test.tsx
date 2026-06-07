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
    expect(screen.queryByText(/Dispatch/i)).toBeNull();
  });

  it('expands the form on click', () => {
    render(<DelegationTriggerPanel />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));
    expect(screen.getByText(/Dispatch/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Describe the task/i)).toBeTruthy();
  });

  it('dispatch button is disabled when prompt is empty', () => {
    render(<DelegationTriggerPanel />);
    fireEvent.click(screen.getByText(/Trigger delegation/i));
    const dispatch = screen.getByText(/Dispatch/i).closest('button')!;
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

    const textarea = screen.getByPlaceholderText(/Describe the task/i);
    fireEvent.change(textarea, { target: { value: 'Review this PR for correctness' } });

    fireEvent.click(screen.getByText(/Dispatch/i));

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

    const textarea = screen.getByPlaceholderText(/Describe the task/i);
    fireEvent.change(textarea, { target: { value: 'some prompt' } });

    fireEvent.click(screen.getByText(/Dispatch/i));

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

    const textarea = screen.getByPlaceholderText(/Describe the task/i);
    fireEvent.change(textarea, { target: { value: 'some prompt' } });
    fireEvent.click(screen.getByText(/Dispatch/i));

    await waitFor(() => {
      expect(onCorrelationId).toHaveBeenCalledWith('corr-abc-123');
    });
  });
});
