/**
 * Contract Schemas
 *
 * Provides access to contract schemas via the schema source abstraction.
 * Schemas can come from mock data (development) or the registry API (production).
 */

import { contractSchemaSource, type ContractSchemas } from '@/lib/data-sources';
import type { ContractType } from '../models/types';

// Re-export types for convenience
export type { ContractSchemas };

/**
 * Get schemas for a given contract type (synchronous)
 *
 * Uses mock data for initial render. For fresh API data, use
 * contractSchemaSource.fetchSchema() directly.
 */
export function getContractSchemas(type: ContractType): ContractSchemas {
  const schemas = contractSchemaSource.getSchemaSync(type);

  if (!schemas) {
    throw new Error(`Unknown contract type: ${type}`);
  }

  return schemas;
}
