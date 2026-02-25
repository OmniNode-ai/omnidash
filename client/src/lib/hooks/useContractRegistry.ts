/**
 * Contract Registry Hooks
 *
 * TanStack Query hooks for all contract registry API operations.
 * These hooks are the primary integration point between the Contract Builder UI
 * and the server-side registry API.
 *
 * Design principles:
 * - All reads use useQuery with stable query keys (prefixed with 'contracts')
 * - All writes use useMutation with automatic query invalidation on success
 * - Error handling propagates to the component via TanStack Query error states
 * - No silent mock fallbacks — errors are surfaced to the caller
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Contract,
  ContractType,
  ContractStatus,
} from '@/components/contract-builder/models/types';
import type { ContractSchemas } from '@/lib/data-sources/contract-schema-source';

// ============================================================================
// Query Key Factory
// ============================================================================

/**
 * Stable, hierarchical query key factory for contract registry queries.
 * All keys are prefixed with 'contracts' for easy cache invalidation.
 */
export const contractKeys = {
  all: ['contracts'] as const,
  lists: () => [...contractKeys.all, 'list'] as const,
  list: (filters: ContractListFilters) => [...contractKeys.lists(), filters] as const,
  details: () => [...contractKeys.all, 'detail'] as const,
  detail: (id: string) => [...contractKeys.details(), id] as const,
  version: (contractId: string, version: string) =>
    [...contractKeys.all, 'version', contractId, version] as const,
  schemas: () => [...contractKeys.all, 'schema'] as const,
  schema: (type: ContractType) => [...contractKeys.schemas(), type] as const,
  types: () => [...contractKeys.all, 'types'] as const,
  audit: (id: string) => [...contractKeys.all, 'audit', id] as const,
  auditSnapshot: (contractId: string, auditId: string) =>
    [...contractKeys.all, 'audit', contractId, 'snapshot', auditId] as const,
  diff: (fromId: string, toId: string) => [...contractKeys.all, 'diff', fromId, toId] as const,
  diffVersions: (fromId: string, toId: string) =>
    [...contractKeys.all, 'diff-versions', fromId, toId] as const,
} as const;

// ============================================================================
// Types
// ============================================================================

export interface ContractListFilters {
  type?: ContractType;
  status?: ContractStatus;
  search?: string;
}

export interface ValidationError {
  code: string;
  message: string;
  path?: string;
  severity?: 'error' | 'warning';
}

export interface ValidationResult {
  lifecycle_state?: string;
  contract?: Contract;
  error?: string;
  gates?: ValidationError[];
}

export interface LifecycleResult {
  success: boolean;
  contract: Contract;
  content_hash?: string;
  message?: string;
  error?: string;
  gates?: ValidationError[];
}

export interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number | null;
}

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

export interface BreakingChangeEntry {
  type: 'removed_required_field' | 'type_changed' | 'capability_removed' | 'required_added';
  path: string;
  description: string;
  fromValue?: unknown;
  toValue?: unknown;
}

export interface NonBreakingChangeEntry {
  type: 'field_added' | 'required_removed' | 'description_changed' | 'default_changed' | 'other';
  path: string;
  description: string;
  fromValue?: unknown;
  toValue?: unknown;
}

export interface BreakingChangeAnalysis {
  hasBreakingChanges: boolean;
  breakingChanges: BreakingChangeEntry[];
  nonBreakingChanges: NonBreakingChangeEntry[];
}

export interface VersionDiffResponse {
  from: {
    id: string;
    contractId: string;
    version: string;
    status: ContractStatus;
    updatedAt: string;
  };
  to: {
    id: string;
    contractId: string;
    version: string;
    status: ContractStatus;
    updatedAt: string;
  };
  diff: DiffResult;
  breakingChanges: BreakingChangeAnalysis;
}

export interface AuditDiffResponse {
  from: { auditId: string; version: string | null; timestamp: string; action: string };
  to: { auditId: string; version: string | null; timestamp: string; action: string };
  diff: DiffResult;
}

export interface AuditEntry {
  id: string;
  contractId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  fromVersion: string | null;
  toVersion: string | null;
  actor: string | null;
  reason: string | null;
  evidence: unknown[];
  contentHash: string | null;
  snapshot: unknown | null;
  createdAt: string;
}

// ============================================================================
// API Fetch Helpers
// ============================================================================

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    const err = new Error(responseBody.error || `Request failed: ${res.status}`);
    // Attach structured gate violations for validation errors
    (err as Error & { gates?: ValidationError[] }).gates = responseBody.gates;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    throw new Error(responseBody.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ============================================================================
// Read Hooks
// ============================================================================

/**
 * Fetch the list of contracts.
 * Supports filtering by type, status, and search term.
 *
 * @example
 * const { data: contracts, isLoading } = useContracts({ status: 'draft' });
 */
export function useContracts(filters: ContractListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  const url = `/api/contracts${qs ? `?${qs}` : ''}`;

  return useQuery<Contract[]>({
    queryKey: contractKeys.list(filters),
    queryFn: () => fetchJson<Contract[]>(url),
  });
}

/**
 * Fetch a single contract by its UUID (primary key).
 *
 * @example
 * const { data: contract } = useContract(id);
 */
export function useContract(id: string | undefined) {
  return useQuery<Contract>({
    queryKey: contractKeys.detail(id ?? ''),
    queryFn: () => fetchJson<Contract>(`/api/contracts/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Fetch a specific contract version by its stable logical ID and semantic version.
 *
 * @example
 * const { data: contract } = useContractVersion('user-auth-orchestrator', '1.2.0');
 */
export function useContractVersion(contractId: string | undefined, version: string | undefined) {
  return useQuery<Contract>({
    queryKey: contractKeys.version(contractId ?? '', version ?? ''),
    queryFn: () =>
      fetchJson<Contract>(`/api/contracts/versions/${contractId}/${version}`),
    enabled: Boolean(contractId) && Boolean(version),
  });
}

/**
 * Fetch available contract types (orchestrator, effect, reducer, compute).
 * This list is stable — refreshes once and caches indefinitely.
 *
 * @example
 * const { data: types } = useContractTypes();
 */
export function useContractTypes() {
  return useQuery<ContractType[]>({
    queryKey: contractKeys.types(),
    queryFn: () => fetchJson<ContractType[]>('/api/contracts/types'),
    staleTime: Infinity, // Types are stable — never stale
  });
}

/**
 * Fetch the JSON Schema and UI Schema for a given contract type.
 * Schemas are stable per type — cached indefinitely after first fetch.
 *
 * @example
 * const { data: schemas } = useContractSchema('orchestrator');
 */
export function useContractSchema(type: ContractType | undefined) {
  return useQuery<ContractSchemas>({
    queryKey: contractKeys.schema(type ?? 'effect'),
    queryFn: () => fetchJson<ContractSchemas>(`/api/contracts/schema/${type}`),
    enabled: Boolean(type),
    staleTime: Infinity, // Schemas are stable per type — never stale
  });
}

/**
 * Fetch the audit log for a contract.
 *
 * @example
 * const { data: auditLog } = useContractAudit(contractId);
 */
export function useContractAudit(contractId: string | undefined) {
  return useQuery<AuditEntry[]>({
    queryKey: contractKeys.audit(contractId ?? ''),
    queryFn: () => fetchJson<AuditEntry[]>(`/api/contracts/${contractId}/audit`),
    enabled: Boolean(contractId),
  });
}

/**
 * Fetch a diff between two audit log entries.
 * Used by the history browser to show line-by-line changes between snapshots.
 *
 * @example
 * const { data: diff } = useAuditDiff(contractId, fromAuditId, toAuditId);
 */
export function useAuditDiff(
  contractId: string | undefined,
  fromAuditId: string | undefined,
  toAuditId: string | undefined
) {
  return useQuery<AuditDiffResponse>({
    queryKey: contractKeys.diff(fromAuditId ?? '', toAuditId ?? ''),
    queryFn: () =>
      fetchJson<AuditDiffResponse>(
        `/api/contracts/${contractId}/diff?from=${fromAuditId}&to=${toAuditId}`
      ),
    enabled: Boolean(contractId) && Boolean(fromAuditId) && Boolean(toAuditId),
  });
}

/**
 * Fetch a structured diff between two contract version UUIDs.
 * Includes line-by-line diff AND breaking change analysis.
 *
 * This is the primary diff endpoint for version comparison — it operates on
 * contract primary key UUIDs (not audit entry IDs).
 *
 * @example
 * const { data } = useVersionDiff(olderContract.id, newerContract.id);
 * if (data?.breakingChanges.hasBreakingChanges) { ... }
 */
export function useVersionDiff(
  fromContractId: string | undefined,
  toContractId: string | undefined
) {
  return useQuery<VersionDiffResponse>({
    queryKey: contractKeys.diffVersions(fromContractId ?? '', toContractId ?? ''),
    queryFn: () =>
      fetchJson<VersionDiffResponse>(
        `/api/contracts/diff-versions?from=${fromContractId}&to=${toContractId}`
      ),
    enabled: Boolean(fromContractId) && Boolean(toContractId),
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new contract draft.
 * Invalidates the contracts list on success.
 *
 * @example
 * const { mutateAsync: createContract } = useCreateContract();
 * const contract = await createContract({ name, displayName, type });
 */
export function useCreateContract() {
  const queryClient = useQueryClient();

  return useMutation<Contract, Error, Partial<Contract>>({
    mutationFn: (data) => postJson<Contract>('/api/contracts', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

/**
 * Update an existing contract draft.
 * Invalidates both the contract detail and list caches on success.
 *
 * @example
 * const { mutateAsync: updateContract } = useUpdateContract();
 * const updated = await updateContract({ id: contract.id, updates: { description: '...' } });
 */
export function useUpdateContract() {
  const queryClient = useQueryClient();

  return useMutation<
    Contract,
    Error,
    { id: string; updates: Partial<Contract> }
  >({
    mutationFn: ({ id, updates }) => putJson<Contract>(`/api/contracts/${id}`, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(contractKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

/**
 * Validate a contract draft.
 * On success (all gates pass), the contract status transitions to 'validated'.
 * On failure (422), the error includes a `gates` array of structured validation errors.
 *
 * @example
 * const { mutateAsync: validateContract } = useValidateContract();
 * try {
 *   const { contract } = await validateContract(contractId);
 * } catch (err) {
 *   const gates = (err as Error & { gates?: ValidationError[] }).gates;
 * }
 */
export function useValidateContract() {
  const queryClient = useQueryClient();

  return useMutation<ValidationResult, Error, string>({
    mutationFn: (id) => postJson<ValidationResult>(`/api/contracts/${id}/validate`),
    onSuccess: (result) => {
      if (result.contract) {
        queryClient.setQueryData(contractKeys.detail(result.contract.id), result.contract);
        void queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
      }
    },
  });
}

/**
 * Publish a validated contract.
 * Assigns a SHA-256 content hash before storing.
 * Emits a `contract_published` event to the event bus.
 *
 * @example
 * const { mutateAsync: publishContract } = usePublishContract();
 * const { contract, content_hash } = await publishContract({ id, evidence: [...] });
 */
export function usePublishContract() {
  const queryClient = useQueryClient();

  return useMutation<
    LifecycleResult,
    Error,
    { id: string; evidence?: unknown[]; actor?: string }
  >({
    mutationFn: ({ id, evidence, actor }) =>
      postJson<LifecycleResult>(`/api/contracts/${id}/publish`, { evidence, actor }),
    onSuccess: (result) => {
      if (result.contract) {
        queryClient.setQueryData(contractKeys.detail(result.contract.id), result.contract);
        void queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
        void queryClient.invalidateQueries({
          queryKey: contractKeys.audit(result.contract.id),
        });
      }
    },
  });
}

/**
 * Deprecate a published contract.
 * Emits a `contract_deprecated` event to the event bus.
 *
 * @example
 * const { mutateAsync: deprecateContract } = useDeprecateContract();
 * await deprecateContract({ id, reason: 'Superseded by v2' });
 */
export function useDeprecateContract() {
  const queryClient = useQueryClient();

  return useMutation<
    LifecycleResult,
    Error,
    { id: string; reason?: string; actor?: string }
  >({
    mutationFn: ({ id, reason, actor }) =>
      postJson<LifecycleResult>(`/api/contracts/${id}/deprecate`, { reason, actor }),
    onSuccess: (result) => {
      if (result.contract) {
        queryClient.setQueryData(contractKeys.detail(result.contract.id), result.contract);
        void queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
        void queryClient.invalidateQueries({
          queryKey: contractKeys.audit(result.contract.id),
        });
      }
    },
  });
}

/**
 * Archive a deprecated contract.
 * Emits a `contract_archived` event to the event bus.
 *
 * @example
 * const { mutateAsync: archiveContract } = useArchiveContract();
 * await archiveContract({ id, reason: 'No longer needed' });
 */
export function useArchiveContract() {
  const queryClient = useQueryClient();

  return useMutation<
    LifecycleResult,
    Error,
    { id: string; reason?: string; actor?: string }
  >({
    mutationFn: ({ id, reason, actor }) =>
      postJson<LifecycleResult>(`/api/contracts/${id}/archive`, { reason, actor }),
    onSuccess: (result) => {
      if (result.contract) {
        queryClient.setQueryData(contractKeys.detail(result.contract.id), result.contract);
        void queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
        void queryClient.invalidateQueries({
          queryKey: contractKeys.audit(result.contract.id),
        });
      }
    },
  });
}
