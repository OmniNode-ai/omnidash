/**
 * Contract Builder Type Definitions
 *
 * Core types for the contract management system.
 */

// Contract node types matching the ONEX 4-node architecture
export type ContractType = 'orchestrator' | 'effect' | 'reducer' | 'compute';

// Contract lifecycle states
export type ContractStatus = 'draft' | 'validated' | 'published' | 'deprecated' | 'archived';

/**
 * Core contract entity
 *
 * Note: `contractId` is the stable identifier across versions.
 * `id` is unique per version (e.g., for database primary key).
 *
 * Example:
 *   - contractId: "fetch-api-data" (same across all versions)
 *   - id: "fetch-api-data-v1.0.0" (unique per version)
 *   - version: "1.0.0"
 */
export interface Contract {
  /** Unique identifier for this specific version */
  id: string;
  /** Stable identifier that links all versions of this contract */
  contractId: string;
  name: string;
  displayName: string;
  type: ContractType;
  status: ContractStatus;
  version: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
