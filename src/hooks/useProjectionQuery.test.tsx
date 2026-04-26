import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { useProjectionQuery } from './useProjectionQuery';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <DataSourceTestProvider client={queryClient}>{children}</DataSourceTestProvider>
);

describe('useProjectionQuery', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches data from projection topic via FileSnapshotSource', async () => {
    // FileSnapshotSource pattern: index.json → ["0.json"], then the item file
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ['0.json'] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 42 }) });

    const { result } = renderHook(
      () => useProjectionQuery({ topic: 'onex.snapshot.projection.test.v1', queryKey: ['test'] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ total: 42 }]);
  });

  it('returns empty array when index.json is not found', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

    const { result } = renderHook(
      () => useProjectionQuery({ topic: 'onex.snapshot.projection.missing.v1', queryKey: ['test-missing'] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  // T15 acceptance (OMN-156): calling outside <SnapshotSourceProvider>
  // throws a clear error.
  it('throws when called outside <SnapshotSourceProvider>', () => {
    const qcOnly = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    expect(() =>
      renderHook(
        () => useProjectionQuery({ topic: 'x', queryKey: ['x'] }),
        { wrapper: qcOnly },
      ),
    ).toThrow(/SnapshotSourceProvider/);
  });
});
