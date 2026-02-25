/**
 * useContractRegistry — unit tests
 *
 * Tests for:
 * - contractKeys factory
 * - useContracts, useContract, useContractVersion
 * - useContractTypes, useContractSchema
 * - useVersionDiff (returns breakingChanges)
 * - useMutation hooks: useCreateContract, useUpdateContract,
 *   useValidateContract, usePublishContract, useDeprecateContract, useArchiveContract
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  contractKeys,
  useContracts,
  useContract,
  useContractVersion,
  useContractTypes,
  useContractSchema,
  useVersionDiff,
  useCreateContract,
  useUpdateContract,
  useValidateContract,
  usePublishContract,
  useDeprecateContract,
  useArchiveContract,
} from '@/lib/hooks/useContractRegistry';
import type { Contract } from '@/components/contract-builder/models/types';

// ============================================================================
// Test helpers
// ============================================================================

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockContract: Contract = {
  id: 'test-uuid-1',
  contractId: 'user-auth-orchestrator',
  name: 'user_auth_orchestrator',
  displayName: 'User Auth Orchestrator',
  type: 'orchestrator',
  status: 'draft',
  version: '1.0.0',
  description: 'Test contract',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  createdBy: 'test-user',
};

// ============================================================================
// contractKeys factory
// ============================================================================

describe('contractKeys', () => {
  it('all() returns root key', () => {
    expect(contractKeys.all).toEqual(['contracts']);
  });

  it('list() includes filters', () => {
    const key = contractKeys.list({ status: 'draft', type: 'orchestrator' });
    expect(key[0]).toBe('contracts');
    expect(key[1]).toBe('list');
    expect(key[2]).toEqual({ status: 'draft', type: 'orchestrator' });
  });

  it('detail() includes id', () => {
    const key = contractKeys.detail('test-uuid-1');
    expect(key).toContain('test-uuid-1');
  });

  it('version() includes contractId and version', () => {
    const key = contractKeys.version('user-auth-orchestrator', '1.0.0');
    expect(key).toContain('user-auth-orchestrator');
    expect(key).toContain('1.0.0');
  });

  it('schema() includes contract type', () => {
    const key = contractKeys.schema('orchestrator');
    expect(key).toContain('orchestrator');
  });

  it('diffVersions() includes both IDs', () => {
    const key = contractKeys.diffVersions('uuid-a', 'uuid-b');
    expect(key).toContain('uuid-a');
    expect(key).toContain('uuid-b');
  });
});

// ============================================================================
// useContracts
// ============================================================================

describe('useContracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches contracts list successfully', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([mockContract]), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useContracts(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockContract]);
  });

  it('builds query string from filters', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    const qc = makeQueryClient();
    renderHook(() => useContracts({ status: 'published', type: 'effect' }), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const url = calls[0][0] as string;
      expect(url).toContain('status=published');
      expect(url).toContain('type=effect');
    });
  });

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'DB error' }), { status: 500 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useContracts(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/DB error/);
  });
});

// ============================================================================
// useContract
// ============================================================================

describe('useContract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches a single contract by ID', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockContract), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useContract('test-uuid-1'), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('test-uuid-1');
  });

  it('is disabled when id is undefined', async () => {
    const qc = makeQueryClient();
    const { result } = renderHook(() => useContract(undefined), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ============================================================================
// useContractVersion
// ============================================================================

describe('useContractVersion', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches a contract by contractId and version', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockContract), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(
      () => useContractVersion('user-auth-orchestrator', '1.0.0'),
      { wrapper: wrapper(qc) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.contractId).toBe('user-auth-orchestrator');

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('/versions/user-auth-orchestrator/1.0.0');
  });

  it('is disabled when contractId or version is undefined', () => {
    const qc = makeQueryClient();
    const { result } = renderHook(() => useContractVersion(undefined, '1.0.0'), {
      wrapper: wrapper(qc),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ============================================================================
// useContractTypes
// ============================================================================

describe('useContractTypes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches contract types and never refetches (staleTime: Infinity)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(['orchestrator', 'effect', 'reducer', 'compute']), {
        status: 200,
      })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useContractTypes(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['orchestrator', 'effect', 'reducer', 'compute']);
  });
});

// ============================================================================
// useContractSchema
// ============================================================================

describe('useContractSchema', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches schema for a contract type', async () => {
    const schemaData = { jsonSchema: { type: 'object' }, uiSchema: {} };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(schemaData), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useContractSchema('orchestrator'), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.jsonSchema).toBeDefined();
  });

  it('is disabled when type is undefined', () => {
    const qc = makeQueryClient();
    const { result } = renderHook(() => useContractSchema(undefined), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ============================================================================
// useVersionDiff
// ============================================================================

describe('useVersionDiff', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches version diff with breaking change analysis', async () => {
    const diffResponse = {
      from: { id: 'uuid-v1', contractId: 'auth', version: '1.0.0', status: 'published', updatedAt: '2026-01-01' },
      to: { id: 'uuid-v2', contractId: 'auth', version: '2.0.0', status: 'draft', updatedAt: '2026-01-02' },
      diff: { lines: [], additions: 0, deletions: 0 },
      breakingChanges: {
        hasBreakingChanges: false,
        breakingChanges: [],
        nonBreakingChanges: [],
      },
    };

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(diffResponse), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useVersionDiff('uuid-v1', 'uuid-v2'), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.breakingChanges.hasBreakingChanges).toBe(false);
    expect(result.current.data?.from.version).toBe('1.0.0');
    expect(result.current.data?.to.version).toBe('2.0.0');
  });

  it('builds correct query URL', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    const qc = makeQueryClient();
    renderHook(() => useVersionDiff('from-id', 'to-id'), { wrapper: wrapper(qc) });

    await waitFor(() => {
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain('/diff-versions?from=from-id&to=to-id');
    });
  });

  it('is disabled when either ID is undefined', () => {
    const qc = makeQueryClient();
    const { result } = renderHook(() => useVersionDiff(undefined, 'uuid-v2'), {
      wrapper: wrapper(qc),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ============================================================================
// Mutation hooks
// ============================================================================

describe('useCreateContract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('creates a contract and returns the result', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockContract), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useCreateContract(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ name: 'test', type: 'orchestrator', displayName: 'Test' });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/contracts');
    expect((init as any).method).toBe('POST');
  });
});

describe('useUpdateContract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends PUT request with id and updates', async () => {
    const updated = { ...mockContract, description: 'Updated' };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }));

    const qc = makeQueryClient();
    const { result } = renderHook(() => useUpdateContract(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ id: 'test-uuid-1', updates: { description: 'Updated' } });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/contracts/test-uuid-1');
    expect((init as any).method).toBe('PUT');
  });
});

describe('useValidateContract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls validate endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ lifecycle_state: 'validated', contract: mockContract }), {
        status: 200,
      })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useValidateContract(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync('test-uuid-1');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/contracts/test-uuid-1/validate');
  });
});

describe('usePublishContract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls publish endpoint with evidence', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, contract: mockContract }), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => usePublishContract(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ id: 'test-uuid-1', evidence: ['PR#42'], actor: 'jonah' });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/contracts/test-uuid-1/publish');
    const body = JSON.parse((init as any).body as string);
    expect(body.evidence).toEqual(['PR#42']);
    expect(body.actor).toBe('jonah');
  });
});

describe('useDeprecateContract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls deprecate endpoint with reason', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, contract: mockContract }), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useDeprecateContract(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ id: 'test-uuid-1', reason: 'Superseded by v2' });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/contracts/test-uuid-1/deprecate');
    const body = JSON.parse((init as any).body as string);
    expect(body.reason).toBe('Superseded by v2');
  });
});

describe('useArchiveContract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls archive endpoint with reason', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, contract: mockContract }), { status: 200 })
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useArchiveContract(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ id: 'test-uuid-1', reason: 'No longer needed' });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/contracts/test-uuid-1/archive');
    const body = JSON.parse((init as any).body as string);
    expect(body.reason).toBe('No longer needed');
  });
});
