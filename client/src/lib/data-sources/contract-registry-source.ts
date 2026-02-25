/**
 * Contract Registry Data Source
 *
 * Provides contract definitions for the contract builder.
 * Fetches data from the real API — no mock fallbacks.
 *
 * API Endpoints:
 * - GET    /api/contracts           - List all contracts
 * - GET    /api/contracts/:id       - Get single contract
 * - POST   /api/contracts           - Create new draft
 * - PUT    /api/contracts/:id       - Update draft
 * - POST   /api/contracts/:id/validate  - Validate contract
 * - POST   /api/contracts/:id/publish   - Publish validated contract
 * - POST   /api/contracts/:id/deprecate - Deprecate published contract
 * - POST   /api/contracts/:id/archive   - Archive deprecated contract
 */

import type {
  Contract,
  ContractType,
  ContractStatus,
} from '@/components/contract-builder/models/types';

// Re-export the types for convenience
export type { Contract, ContractType, ContractStatus };

/**
 * Response wrapper that includes whether data is from mock or real API
 */
interface ContractRegistryResponse<T> {
  data: T;
  isMock: boolean;
}

/**
 * Validation result from the API
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  contract: Contract;
}

/**
 * Lifecycle action result from the API
 */
interface LifecycleResult {
  success: boolean;
  contract: Contract;
  error?: string;
}

/**
 * Bump a semantic version string
 * @param version Current version (e.g., "1.2.3")
 * @param type Which part to bump: 'major', 'minor', or 'patch'
 * @returns New version string (e.g., "1.2.4" for patch bump)
 */
function bumpVersion(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  const parts = version.split('.').map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

/**
 * Generate a unique ID for a new contract version
 */
function generateVersionId(contractId: string, version: string): string {
  return `${contractId}-v${version}`.replace(/\./g, '-');
}

/**
 * Contract Registry Source
 *
 * Fetches contract data from the real API.
 * On API failure, errors propagate to the caller — no silent mock fallback.
 *
 * Note: Caching is handled by TanStack Query at the component level,
 * following the same pattern as other data sources in this codebase.
 */
class ContractRegistrySource {
  /**
   * Fetch all contracts
   */
  async fetchContracts(): Promise<ContractRegistryResponse<Contract[]>> {
    const response = await fetch('/api/contracts');
    if (!response.ok) {
      throw new Error(`Failed to fetch contracts: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return { data: Array.isArray(data) ? data : [], isMock: false };
  }

  /**
   * Fetch a specific contract by ID
   */
  async fetchContract(id: string): Promise<ContractRegistryResponse<Contract | undefined>> {
    const response = await fetch(`/api/contracts/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch contract ${id}: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return { data, isMock: false };
  }

  /**
   * Fetch contracts filtered by type
   */
  async fetchContractsByType(type: ContractType): Promise<ContractRegistryResponse<Contract[]>> {
    const response = await fetch(`/api/contracts?type=${type}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch contracts by type: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    return { data: Array.isArray(data) ? data : [], isMock: false };
  }

  /**
   * Fetch contracts filtered by status
   */
  async fetchContractsByStatus(
    status: ContractStatus
  ): Promise<ContractRegistryResponse<Contract[]>> {
    const response = await fetch(`/api/contracts?status=${status}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch contracts by status: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    return { data: Array.isArray(data) ? data : [], isMock: false };
  }

  /**
   * Get all contracts synchronously.
   * Without a synchronous data store, returns an empty array.
   * Use fetchContracts() for actual data.
   */
  getContractsSync(): Contract[] {
    return [];
  }

  /**
   * Get a specific contract synchronously.
   * Without a synchronous data store, always returns undefined.
   * Use fetchContract(id) for actual data.
   */
  getContractSync(_id: string): Contract | undefined {
    return undefined;
  }

  /**
   * Check if we're using mock data — always false in production.
   */
  isUsingMockData(): boolean {
    return false;
  }

  /**
   * Create a new draft version based on an existing contract (async, via API).
   * Used when editing a non-draft (published, validated, etc.) contract.
   *
   * @param sourceContract The contract to base the new draft on
   * @param versionBump How to bump the version: 'major', 'minor', or 'patch'
   * @returns The newly created draft contract
   */
  async createDraftVersionAsync(
    sourceContract: Contract,
    versionBump: 'major' | 'minor' | 'patch' = 'patch'
  ): Promise<ContractRegistryResponse<Contract>> {
    const response = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromContractId: sourceContract.id,
        versionBump,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to create draft: ${response.status}`);
    }
    const data = await response.json();
    return { data, isMock: false };
  }

  /**
   * Create a draft version synchronously from a source contract.
   * Computes the new version locally — does not persist to the API.
   * Call createDraftVersionAsync() to persist via the API.
   *
   * @param sourceContract The contract to base the new draft on
   * @param versionBump How to bump the version: 'major', 'minor', or 'patch'
   * @returns The locally computed draft contract (not yet persisted)
   */
  createDraftVersion(
    sourceContract: Contract,
    versionBump: 'major' | 'minor' | 'patch' = 'patch'
  ): Contract {
    const newVersion = bumpVersion(sourceContract.version, versionBump);
    const now = new Date().toISOString();
    return {
      ...sourceContract,
      id: generateVersionId(sourceContract.contractId, newVersion),
      version: newVersion,
      status: 'draft' as ContractStatus,
      createdAt: now,
      updatedAt: now,
      createdBy: undefined,
    };
  }

  /**
   * Create a brand new contract draft
   */
  async createContract(contract: Partial<Contract>): Promise<ContractRegistryResponse<Contract>> {
    const response = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contract),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create contract');
    }
    const data = await response.json();
    return { data, isMock: false };
  }

  /**
   * Update an existing draft contract
   */
  async updateContract(
    id: string,
    updates: Partial<Contract>
  ): Promise<ContractRegistryResponse<Contract>> {
    const response = await fetch(`/api/contracts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update contract');
    }
    const data = await response.json();
    return { data, isMock: false };
  }

  /**
   * Validate a contract
   */
  async validateContract(id: string): Promise<ValidationResult> {
    const response = await fetch(`/api/contracts/${id}/validate`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Validation failed');
    }
    return data;
  }

  /**
   * Publish a validated contract
   */
  async publishContract(id: string): Promise<LifecycleResult> {
    const response = await fetch(`/api/contracts/${id}/publish`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Publish failed');
    }
    return data;
  }

  /**
   * Deprecate a published contract
   */
  async deprecateContract(id: string): Promise<LifecycleResult> {
    const response = await fetch(`/api/contracts/${id}/deprecate`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Deprecate failed');
    }
    return data;
  }

  /**
   * Archive a deprecated contract
   */
  async archiveContract(id: string): Promise<LifecycleResult> {
    const response = await fetch(`/api/contracts/${id}/archive`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Archive failed');
    }
    return data;
  }

  /**
   * Check if a draft version already exists for a contract.
   * Without a synchronous data store, always returns false.
   * Use fetchContractsByStatus('draft') for actual data.
   */
  hasDraftVersion(_contractId: string): boolean {
    return false;
  }

  /**
   * Get the existing draft for a contract, if any.
   * Without a synchronous data store, always returns undefined.
   * Use fetchContractsByStatus('draft') for actual data.
   */
  getDraftVersion(_contractId: string): Contract | undefined {
    return undefined;
  }
}

// Export singleton instance
export const contractRegistrySource = new ContractRegistrySource();

// Export types for use in components
export type { ValidationResult, LifecycleResult };
