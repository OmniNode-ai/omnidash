import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePageAgent } from './usePageAgent';

// Mock page-agent to avoid DOM and LLM dependency in unit tests
vi.mock('page-agent', () => ({
  PageAgent: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: 'Adding cost-trend-panel to your dashboard.',
      history: [
        {
          type: 'step',
          action: { name: 'add_component', input: { componentName: 'cost-trend-panel' }, output: 'Added component' },
        },
      ],
    }),
    dispose: vi.fn(),
    status: 'idle',
  })),
}));

// AGENT_ACTIONS and zod are imported at module level — real implementations used in tests

describe('usePageAgent', () => {
  afterEach(() => vi.clearAllMocks());

  it('initializes without error and sets isReady=true', async () => {
    const { result } = renderHook(() => usePageAgent({ enabled: true }));
    await act(async () => {
      await result.current.initialize();
    });
    expect(result.current.isReady).toBe(true);
  });

  it('sends a message and invokes onAction for each tool call in history', async () => {
    const onAction = vi.fn().mockResolvedValue({ success: true, message: 'Added component' });
    const onResponse = vi.fn();
    const { result } = renderHook(() => usePageAgent({ enabled: true, onAction, onResponse }));

    // Separate acts: initialize triggers setIsReady(true) re-render which must flush
    // before sendMessage can read the updated agentRef via result.current
    await act(async () => {
      await result.current.initialize();
    });
    await act(async () => {
      await result.current.sendMessage('Add a cost trend panel');
    });

    expect(onResponse).toHaveBeenCalledWith(
      'Adding cost-trend-panel to your dashboard.',
      expect.arrayContaining([
        expect.objectContaining({ name: 'add_component' }),
      ])
    );
  });

  it('does not initialize when enabled=false', async () => {
    const { result } = renderHook(() => usePageAgent({ enabled: false }));
    await act(async () => {
      await result.current.initialize();
    });
    expect(result.current.isReady).toBe(false);
  });

  it('destroy resets isReady to false', async () => {
    const { result } = renderHook(() => usePageAgent({ enabled: true }));
    await act(async () => {
      await result.current.initialize();
    });
    expect(result.current.isReady).toBe(true);

    act(() => {
      result.current.destroy();
    });
    expect(result.current.isReady).toBe(false);
  });

  it('throws when sendMessage called before initialize', async () => {
    const { result } = renderHook(() => usePageAgent({ enabled: true }));
    await expect(result.current.sendMessage('hello')).rejects.toThrow('Agent not initialized');
  });
});
