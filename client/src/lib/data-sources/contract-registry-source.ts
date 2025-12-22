/**
 * Contract Registry Data Source
 *
 * Provides contract definitions for the contract builder.
 * Supports both mock mode (using static data) and HTTP mode (fetching from API).
 *
 * API Endpoint (future): GET /api/contracts
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
  createDraftVersion(
    sourceContract: Contract,
    versionBump: 'major' | 'minor' | 'patch' = 'patch'
  ): Contract {
    // In mock mode, use the mock data class
    // In production, this would POST to the API
    return ContractRegistryMockData.createDraftVersion(sourceContract, versionBump);
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
