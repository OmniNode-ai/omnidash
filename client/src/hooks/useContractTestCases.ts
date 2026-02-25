/**
 * useContractTestCases
 *
 * TanStack Query hooks for managing test cases attached to a contract version.
 *
 * Endpoints consumed:
 *   GET    /api/contracts/:id/test-cases
 *   POST   /api/contracts/:id/test-cases
 *   DELETE /api/contracts/:id/test-cases/:testCaseId
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface ContractTestCase {
  id: string;
  contractId: string;
  name: string;
  description: string | null;
  inputs: Record<string, unknown>;
  expectedOutputs: Record<string, unknown>;
  assertions: unknown[];
  lastResult: 'passed' | 'failed' | 'skipped' | null;
  lastRunAt: string | null;
  lastRunBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestCasePayload {
  name: string;
  description?: string;
  inputs?: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
  assertions?: unknown[];
  createdBy?: string;
}

// ============================================================================
// Fetch / mutate helpers
// ============================================================================

async function fetchTestCases(contractId: string): Promise<ContractTestCase[]> {
  const res = await fetch(`/api/contracts/${contractId}/test-cases`);
  if (!res.ok) {
    throw new Error(`Failed to fetch test cases: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<ContractTestCase[]>;
}

async function createTestCase(
  contractId: string,
  payload: CreateTestCasePayload
): Promise<ContractTestCase> {
  const res = await fetch(`/api/contracts/${contractId}/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to create test case: ${res.status}`);
  }
  return res.json() as Promise<ContractTestCase>;
}

async function deleteTestCase(contractId: string, testCaseId: string): Promise<void> {
  const res = await fetch(`/api/contracts/${contractId}/test-cases/${testCaseId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to delete test case: ${res.status}`);
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all test cases for a contract version.
 *
 * @param contractId  The UUID primary key of the contract version (contracts.id)
 * @param enabled     Optional — set false to skip fetching
 */
export function useContractTestCases(contractId: string | null | undefined, enabled = true) {
  return useQuery<ContractTestCase[]>({
    queryKey: ['contract-test-cases', contractId],
    queryFn: () => fetchTestCases(contractId!),
    enabled: enabled && !!contractId,
    staleTime: 30_000,
  });
}

/**
 * Mutation to attach a new test case to a contract version.
 * Invalidates the test-cases query on success.
 *
 * @param contractId  The UUID primary key of the contract version
 */
export function useCreateContractTestCase(contractId: string) {
  const queryClient = useQueryClient();

  return useMutation<ContractTestCase, Error, CreateTestCasePayload>({
    mutationFn: (payload) => createTestCase(contractId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract-test-cases', contractId] });
    },
  });
}

/**
 * Mutation to remove a test case from a contract version.
 * Invalidates the test-cases query on success.
 *
 * @param contractId  The UUID primary key of the contract version
 */
export function useDeleteContractTestCase(contractId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (testCaseId) => deleteTestCase(contractId, testCaseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract-test-cases', contractId] });
    },
  });
}
