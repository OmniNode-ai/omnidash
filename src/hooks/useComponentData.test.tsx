import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useComponentData } from './useComponentData';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useComponentData', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches data from endpoint', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ total: 42 }),
    });

    const { result } = renderHook(
      () => useComponentData('/api/test', { queryKey: ['test'] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ total: 42 });
  });

  it('handles fetch errors gracefully', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(
      () => useComponentData('/api/test-error', { queryKey: ['test-error'] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
