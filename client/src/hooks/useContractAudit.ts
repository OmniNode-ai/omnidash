/**
 * useContractAudit
 *
 * TanStack Query hooks for fetching contract audit log and snapshot diffs.
 *
 * Endpoints consumed:
 *   GET /api/contracts/:id/audit
 *   GET /api/contracts/:id/audit/:auditId/snapshot
 *   GET /api/contracts/:id/diff?from=<auditId>&to=<auditId>
 */

import { useQuery } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

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
  hasSnapshot: boolean;
  createdAt: string;
}

export interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number | null;
}

export interface AuditDiff {
  from: {
    auditId: string;
    version: string | null;
    timestamp: string;
    action: string;
  };
  to: {
    auditId: string;
    version: string | null;
    timestamp: string;
    action: string;
  };
  diff: {
    lines: DiffLine[];
    additions: number;
    deletions: number;
  };
}

// ============================================================================
// Fetch helpers
// ============================================================================

async function fetchAuditLog(contractId: string): Promise<AuditEntry[]> {
  const res = await fetch(`/api/contracts/${contractId}/audit`);
  if (!res.ok) {
    throw new Error(`Failed to fetch audit log: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<AuditEntry[]>;
}

async function fetchAuditSnapshot(
  contractId: string,
  auditId: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/contracts/${contractId}/audit/${auditId}/snapshot`);
  if (!res.ok) {
    throw new Error(`Failed to fetch audit snapshot: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { snapshot: Record<string, unknown> };
  return body.snapshot;
}

async function fetchAuditDiff(
  contractId: string,
  fromAuditId: string,
  toAuditId: string
): Promise<AuditDiff> {
  const params = new URLSearchParams({ from: fromAuditId, to: toAuditId });
  const res = await fetch(`/api/contracts/${contractId}/diff?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch audit diff: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<AuditDiff>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch the full audit log for a contract version.
 *
 * @param contractId  The UUID primary key of the contract version (contracts.id)
 * @param enabled     Optional — set false to skip fetching
 */
export function useContractAudit(contractId: string | null | undefined, enabled = true) {
  return useQuery<AuditEntry[]>({
    queryKey: ['contract-audit', contractId],
    queryFn: () => fetchAuditLog(contractId!),
    enabled: enabled && !!contractId,
    staleTime: 30_000, // 30 s — audit logs don't change frequently
  });
}

/**
 * Fetch the contract snapshot stored in a specific audit entry.
 *
 * @param contractId  Contract version UUID
 * @param auditId     Audit entry UUID
 * @param enabled     Optional — set false to skip fetching
 */
export function useAuditSnapshot(
  contractId: string | null | undefined,
  auditId: string | null | undefined,
  enabled = true
) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['contract-audit-snapshot', contractId, auditId],
    queryFn: () => fetchAuditSnapshot(contractId!, auditId!),
    enabled: enabled && !!contractId && !!auditId,
    staleTime: 60_000,
  });
}

/**
 * Fetch a diff between two audit snapshots.
 *
 * @param contractId    Contract version UUID
 * @param fromAuditId   Older audit entry UUID
 * @param toAuditId     Newer audit entry UUID
 * @param enabled       Optional — set false to skip fetching
 */
export function useAuditDiff(
  contractId: string | null | undefined,
  fromAuditId: string | null | undefined,
  toAuditId: string | null | undefined,
  enabled = true
) {
  return useQuery<AuditDiff>({
    queryKey: ['contract-audit-diff', contractId, fromAuditId, toAuditId],
    queryFn: () => fetchAuditDiff(contractId!, fromAuditId!, toAuditId!),
    enabled: enabled && !!contractId && !!fromAuditId && !!toAuditId,
    staleTime: 60_000,
  });
}
