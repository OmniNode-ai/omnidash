/**
 * Contract Registry Data Source
 *
 * Provides contract definitions for the contract builder.
 * Supports both mock mode (using static data) and HTTP mode (fetching from API).
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

import { USE_MOCK_DATA, ContractRegistryMockData } from '../mock-data';
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
 * Contract Registry Source
 *
 * Abstracts the data source for contracts.
 * When USE_MOCK_DATA is true, returns static mock data.
 * When false, attempts to fetch from the API with fallback to mock.
 *
 * Note: Caching is handled by TanStack Query at the component level,
 * following the same pattern as other data sources in this codebase.
 */
class ContractRegistrySource {
  /**
   * Fetch all contracts
   */
  async fetchContracts(): Promise<ContractRegistryResponse<Contract[]>> {
    // Return mock data if flag is enabled
    if (USE_MOCK_DATA) {
      return {
        data: ContractRegistryMockData.getContracts(),
        isMock: true,
      };
    }

    // Try fetching from API
    try {
      const response = await fetch('/api/contracts');
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch contracts from API, falling back to mock data', err);
    }

    // Fallback to mock data if API fails
    return {
      data: ContractRegistryMockData.getContracts(),
      isMock: true,
    };
  }

  /**
   * Fetch a specific contract by ID
   */
  async fetchContract(id: string): Promise<ContractRegistryResponse<Contract | undefined>> {
    // Return mock data if flag is enabled
    if (USE_MOCK_DATA) {
      return {
        data: ContractRegistryMockData.getContract(id),
        isMock: true,
      };
    }

    // Try fetching from API
    try {
      const response = await fetch(`/api/contracts/${id}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn(`Failed to fetch contract ${id} from API, falling back to mock data`, err);
    }

    // Fallback to mock data if API fails
    return {
      data: ContractRegistryMockData.getContract(id),
      isMock: true,
    };
  }

  /**
   * Fetch contracts filtered by type
   */
  async fetchContractsByType(type: ContractType): Promise<ContractRegistryResponse<Contract[]>> {
    // Return mock data if flag is enabled
    if (USE_MOCK_DATA) {
      return {
        data: ContractRegistryMockData.getContractsByType(type),
        isMock: true,
      };
    }

    // Try fetching from API
    try {
      const response = await fetch(`/api/contracts?type=${type}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn(`Failed to fetch contracts by type from API, falling back to mock data`, err);
    }

    // Fallback to mock data if API fails
    return {
      data: ContractRegistryMockData.getContractsByType(type),
      isMock: true,
    };
  }

  /**
   * Fetch contracts filtered by status
   */
  async fetchContractsByStatus(
    status: ContractStatus
  ): Promise<ContractRegistryResponse<Contract[]>> {
    // Return mock data if flag is enabled
    if (USE_MOCK_DATA) {
      return {
        data: ContractRegistryMockData.getContractsByStatus(status),
        isMock: true,
      };
    }

    // Try fetching from API
    try {
      const response = await fetch(`/api/contracts?status=${status}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn(`Failed to fetch contracts by status from API, falling back to mock data`, err);
    }

    // Fallback to mock data if API fails
    return {
      data: ContractRegistryMockData.getContractsByStatus(status),
      isMock: true,
    };
  }

  /**
   * Get all contracts synchronously (uses mock data)
   * Useful for initial render before async fetch completes
   */
  getContractsSync(): Contract[] {
    return ContractRegistryMockData.getContracts();
  }

  /**
   * Get a specific contract synchronously
   */
  getContractSync(id: string): Contract | undefined {
    return ContractRegistryMockData.getContract(id);
  }

  /**
   * Check if we're using mock data
   */
  isUsingMockData(): boolean {
    return USE_MOCK_DATA;
  }

  /**
   * Create a new draft version based on an existing contract
   * Used when editing a non-draft (published, validated, etc.) contract
   *
   * @param sourceContract The contract to base the new draft on
   * @param versionBump How to bump the version: 'major', 'minor', or 'patch'
   * @returns The newly created draft contract
   */
  async createDraftVersionAsync(
    sourceContract: Contract,
    versionBump: 'major' | 'minor' | 'patch' = 'patch'
  ): Promise<ContractRegistryResponse<Contract>> {
    if (USE_MOCK_DATA) {
      return {
        data: ContractRegistryMockData.createDraftVersion(sourceContract, versionBump),
        isMock: true,
      };
    }

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromContractId: sourceContract.id,
          versionBump,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to create draft via API, falling back to mock', err);
    }

    return {
      data: ContractRegistryMockData.createDraftVersion(sourceContract, versionBump),
      isMock: true,
    };
  }

  /**
   * Synchronous version for backwards compatibility
   */
  createDraftVersion(
    sourceContract: Contract,
    versionBump: 'major' | 'minor' | 'patch' = 'patch'
  ): Contract {
    return ContractRegistryMockData.createDraftVersion(sourceContract, versionBump);
  }

  /**
   * Create a brand new contract draft
   */
  async createContract(contract: Partial<Contract>): Promise<ContractRegistryResponse<Contract>> {
    if (USE_MOCK_DATA) {
      const newContract = ContractRegistryMockData.createDraftVersion(
        contract as Contract,
        'patch'
      );
      return { data: newContract, isMock: true };
    }

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contract),
      });
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create contract');
    } catch (err) {
      console.error('Failed to create contract:', err);
      throw err;
    }
  }

  /**
   * Update an existing draft contract
   */
  async updateContract(
    id: string,
    updates: Partial<Contract>
  ): Promise<ContractRegistryResponse<Contract>> {
    if (USE_MOCK_DATA) {
      const existing = ContractRegistryMockData.getContract(id);
      if (!existing) throw new Error('Contract not found');
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      return { data: updated, isMock: true };
    }

    try {
      const response = await fetch(`/api/contracts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update contract');
    } catch (err) {
      console.error('Failed to update contract:', err);
      throw err;
    }
  }

  /**
   * Validate a contract
   */
  async validateContract(id: string): Promise<ValidationResult> {
    if (USE_MOCK_DATA) {
      const contract = ContractRegistryMockData.getContract(id);
      if (!contract) throw new Error('Contract not found');
      return {
        isValid: true,
        errors: [],
        warnings: [],
        contract: { ...contract, status: 'validated' as ContractStatus },
      };
    }

    try {
      const response = await fetch(`/api/contracts/${id}/validate`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Validation failed');
      }
      return data;
    } catch (err) {
      console.error('Failed to validate contract:', err);
      throw err;
    }
  }

  /**
   * Publish a validated contract
   */
  async publishContract(id: string): Promise<LifecycleResult> {
    if (USE_MOCK_DATA) {
      const contract = ContractRegistryMockData.getContract(id);
      if (!contract) throw new Error('Contract not found');
      return {
        success: true,
        contract: { ...contract, status: 'published' as ContractStatus },
      };
    }

    try {
      const response = await fetch(`/api/contracts/${id}/publish`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Publish failed');
      }
      return data;
    } catch (err) {
      console.error('Failed to publish contract:', err);
      throw err;
    }
  }

  /**
   * Deprecate a published contract
   */
  async deprecateContract(id: string): Promise<LifecycleResult> {
    if (USE_MOCK_DATA) {
      const contract = ContractRegistryMockData.getContract(id);
      if (!contract) throw new Error('Contract not found');
      return {
        success: true,
        contract: { ...contract, status: 'deprecated' as ContractStatus },
      };
    }

    try {
      const response = await fetch(`/api/contracts/${id}/deprecate`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Deprecate failed');
      }
      return data;
    } catch (err) {
      console.error('Failed to deprecate contract:', err);
      throw err;
    }
  }

  /**
   * Archive a deprecated contract
   */
  async archiveContract(id: string): Promise<LifecycleResult> {
    if (USE_MOCK_DATA) {
      const contract = ContractRegistryMockData.getContract(id);
      if (!contract) throw new Error('Contract not found');
      return {
        success: true,
        contract: { ...contract, status: 'archived' as ContractStatus },
      };
    }

    try {
      const response = await fetch(`/api/contracts/${id}/archive`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Archive failed');
      }
      return data;
    } catch (err) {
      console.error('Failed to archive contract:', err);
      throw err;
    }
  }

  /**
   * Check if a draft version already exists for a contract
   */
  hasDraftVersion(contractId: string): boolean {
    return ContractRegistryMockData.hasDraftVersion(contractId);
  }

  /**
   * Get the existing draft for a contract, if any
   */
  getDraftVersion(contractId: string): Contract | undefined {
    return ContractRegistryMockData.getDraftVersion(contractId);
  }
}

// Export singleton instance
export const contractRegistrySource = new ContractRegistrySource();

// Export types for use in components
export type { ValidationResult, LifecycleResult };
