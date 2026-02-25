/**
 * useContractRegistry — TanStack Query hooks for the Contract Registry API
 *
 * Covers:
 *  - Listing contracts (with optional type/status filters)
 *  - Fetching a single contract by ID
 *  - Creating a new draft contract
 *  - Updating a draft contract
 *  - Lifecycle transitions: validate → publish → deprecate → archive
 *  - Version history browsing (all versions of a contract)
 *  - Breaking change analysis between two contract versions
 *  - Query-key helpers for granular cache invalidation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import type {
  Contract,
  ContractType,
  ContractStatus,
} from '@/components/contract-builder/models/types';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const contractKeys = {
  all: ['contracts'] as const,
  lists: () => [...contractKeys.all, 'list'] as const,
  list: (filters?: { type?: ContractType; status?: ContractStatus }) =>
    [...contractKeys.lists(), filters ?? {}] as const,
  detail: (id: string) => [...contractKeys.all, 'detail', id] as const,
  versions: (contractId: string) => [...contractKeys.all, 'versions', contractId] as const,
  diff: (fromId: string, toId: string) => [...contractKeys.all, 'diff', fromId, toId] as const,
  types: () => [...contractKeys.all, 'types'] as const,
};

// ---------------------------------------------------------------------------
// Shared API types
// ---------------------------------------------------------------------------

export interface CreateContractPayload {
  name: string;
  displayName: string;
  type: ContractType;
  version: string;
  description?: string;
}

export interface UpdateContractPayload {
  name?: string;
  displayName?: string;
  description?: string;
  /** Raw RJSF form data (contract schema content) */
  formData?: Record<string, unknown>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  contract: Contract;
}

export interface LifecycleResult {
  success: boolean;
  contract: Contract;
  error?: string;
}

export interface BreakingChange {
  category:
    | 'field_removed'
    | 'field_type_changed'
    | 'required_field_added'
    | 'enum_value_removed'
    | 'determinism_class_changed'
    | 'node_type_changed';
  path: string;
  message: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface BreakingChangeAnalysis {
  hasBreakingChanges: boolean;
  breakingChanges: BreakingChange[];
  recommendedBump: 'major' | 'minor' | 'patch';
  fromVersion: string;
  toVersionSuggested: string;
}

// ---------------------------------------------------------------------------
// Query: list all contracts (optional filters)
// ---------------------------------------------------------------------------

export function useContracts(
  filters?: { type?: ContractType; status?: ContractStatus },
  options?: Partial<UseQueryOptions<Contract[]>>
) {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const url = `/api/contracts${qs ? `?${qs}` : ''}`;

  return useQuery<Contract[]>({
    queryKey: contractKeys.list(filters),
    queryFn: () => fetchJson<Contract[]>(url),
    staleTime: 10_000,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Query: list available contract types
// ---------------------------------------------------------------------------

export function useContractTypes() {
  return useQuery<ContractType[]>({
    queryKey: contractKeys.types(),
    queryFn: () => fetchJson<ContractType[]>('/api/contracts/types'),
    // Types are stable — cache for 5 minutes
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Query: single contract by ID
// ---------------------------------------------------------------------------

export function useContract(id: string | undefined) {
  return useQuery<Contract>({
    queryKey: contractKeys.detail(id ?? ''),
    queryFn: () => fetchJson<Contract>(`/api/contracts/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Query: all versions of a contract (version history browser)
// ---------------------------------------------------------------------------

/**
 * Fetch all versions of a specific contract (by stable contractId).
 * Returned list is ordered newest-first by the API.
 *
 * @param contractId - The stable logical ID shared across versions
 */
export function useContractVersions(contractId: string | null | undefined) {
  return useQuery<Contract[]>({
    queryKey: contractKeys.versions(contractId ?? ''),
    queryFn: () => fetchJson<Contract[]>(`/api/contracts/by-contract-id/${contractId}`),
    enabled: !!contractId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Query: breaking change analysis between two versions
// ---------------------------------------------------------------------------

/**
 * Analyse breaking changes between two contract versions.
 *
 * @param fromId - The older version's ID (UUID)
 * @param toId   - The newer (draft) version's ID (UUID)
 *
 * Blocked (enabled=false) when either ID is missing.
 */
export function useBreakingChangeAnalysis(
  fromId: string | null | undefined,
  toId: string | null | undefined
) {
  return useQuery<BreakingChangeAnalysis>({
    queryKey: contractKeys.diff(fromId ?? '', toId ?? ''),
    queryFn: () =>
      fetchJson<BreakingChangeAnalysis>('/api/contracts/diff-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId, toId }),
      }),
    enabled: !!fromId && !!toId,
    staleTime: 60_000, // Analysis result is deterministic — cache longer
  });
}

// ---------------------------------------------------------------------------
// Mutation: create a new draft contract
// ---------------------------------------------------------------------------

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation<Contract, Error, CreateContractPayload>({
    mutationFn: (payload) => postJson<Contract>('/api/contracts', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: update a draft contract
// ---------------------------------------------------------------------------

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation<Contract, Error, { id: string } & UpdateContractPayload>({
    mutationFn: ({ id, ...updates }) => putJson<Contract>(`/api/contracts/${id}`, updates),
    onSuccess: (updated) => {
      qc.setQueryData(contractKeys.detail(updated.id), updated);
      void qc.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: validate a contract (DRAFT → policy-gate check)
// ---------------------------------------------------------------------------

export function useValidateContract() {
  const qc = useQueryClient();
  return useMutation<ValidationResult, Error, string>({
    mutationFn: (id) => postJson<ValidationResult>(`/api/contracts/${id}/validate`),
    onSuccess: (_result, id) => {
      // Refresh both list and detail so status badge updates
      void qc.invalidateQueries({ queryKey: contractKeys.lists() });
      void qc.invalidateQueries({ queryKey: contractKeys.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: publish a validated contract
// ---------------------------------------------------------------------------

export function usePublishContract() {
  const qc = useQueryClient();
  return useMutation<LifecycleResult, Error, string>({
    mutationFn: (id) => postJson<LifecycleResult>(`/api/contracts/${id}/publish`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: deprecate a published contract
// ---------------------------------------------------------------------------

export function useDeprecateContract() {
  const qc = useQueryClient();
  return useMutation<LifecycleResult, Error, string>({
    mutationFn: (id) => postJson<LifecycleResult>(`/api/contracts/${id}/deprecate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: archive a deprecated contract
// ---------------------------------------------------------------------------

export function useArchiveContract() {
  const qc = useQueryClient();
  return useMutation<LifecycleResult, Error, string>({
    mutationFn: (id) => postJson<LifecycleResult>(`/api/contracts/${id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}
