/**
 * Contract Schemas
 *
 * Provides access to contract schemas.
 * Schemas are fetched from the API endpoint /api/contracts/schema/:type
 */

import type { ContractSchemas } from '@/lib/data-sources';
import type { ContractType } from '../models/types';

// Re-export types for convenience
export type { ContractSchemas };

/**
 * Get schemas for a given contract type (async)
 *
 * Fetches schema from the API endpoint.
 */
export async function fetchContractSchemas(type: ContractType): Promise<ContractSchemas> {
  const response = await fetch(`/api/contracts/schema/${type}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch schema for ${type}: ${response.statusText}`);
  }
  const data = await response.json();
  return data as ContractSchemas;
}

/**
 * Get schemas for a given contract type (synchronous, for backwards compatibility)
 * Returns null if schema not available synchronously.
 * Prefer fetchContractSchemas() for new code.
 */
export function getContractSchemas(_type: ContractType): ContractSchemas | null {
  // Synchronous schema loading is no longer supported.
  // Use fetchContractSchemas() instead.
  return null;
}
