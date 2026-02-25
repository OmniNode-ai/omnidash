/**
 * Contract Registry Mock Data
 *
 * Provides mock contract definitions for the contract builder.
 * In production, these would be fetched from /api/contracts
 */

import type {
  Contract,
  ContractType,
  ContractStatus,
} from '@/components/contract-builder/models/types';

// Import the static JSON data
import contractsJson from '@/components/contract-builder/models/contracts.json';

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

// In-memory storage for dynamically created contracts (drafts, etc.)
// This simulates what would be persisted to a database in production
let dynamicContracts: Contract[] = [];

/**
 * Mock data class for contract registry
 * Follows the same pattern as other mock data classes in the codebase
 */
export class ContractRegistryMockData {
  /**
   * Get all contracts (static + dynamic)
   */
  static getContracts(): Contract[] {
    return [...(contractsJson as Contract[]), ...dynamicContracts];
  }

  /**
   * Get a specific contract by ID
   */
  static getContract(id: string): Contract | undefined {
    const contracts = this.getContracts();
    return contracts.find((c) => c.id === id);
  }

  /**
   * Get contracts filtered by type
   */
  static getContractsByType(type: ContractType): Contract[] {
    return this.getContracts().filter((c) => c.type === type);
  }

  /**
   * Get contracts filtered by status
   */
  static getContractsByStatus(status: ContractStatus): Contract[] {
    return this.getContracts().filter((c) => c.status === status);
  }

  /**
   * Get contracts filtered by a predicate
   */
  static getContractsFiltered(predicate: (contract: Contract) => boolean): Contract[] {
    return this.getContracts().filter(predicate);
  }

  /**
   * Search contracts by name or description
   */
  static searchContracts(query: string): Contract[] {
    const lowerQuery = query.toLowerCase();
    return this.getContracts().filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.displayName.toLowerCase().includes(lowerQuery) ||
        c.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Create a new draft version based on an existing contract
   * Used when editing a non-draft (published, validated, etc.) contract
   *
   * @param sourceContract The contract to base the new draft on
   * @param versionBump How to bump the version: 'major', 'minor', or 'patch'
   * @returns The newly created draft contract
   */
  static createDraftVersion(
    sourceContract: Contract,
    versionBump: 'major' | 'minor' | 'patch' = 'patch'
  ): Contract {
    const newVersion = bumpVersion(sourceContract.version, versionBump);
    const now = new Date().toISOString();

    const newDraft: Contract = {
      ...sourceContract,
      id: generateVersionId(sourceContract.contractId, newVersion),
      version: newVersion,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      // Clear fields that shouldn't carry over
      createdBy: undefined,
    };

    // Add to dynamic contracts (in-memory persistence)
    dynamicContracts.push(newDraft);

    return newDraft;
  }

  /**
   * Update an existing contract (for saving drafts)
   * In production, this would call the API
   */
  static updateContract(contract: Contract): Contract {
    const updatedContract = {
      ...contract,
      updatedAt: new Date().toISOString(),
    };

    // Check if it's a dynamic contract
    const dynamicIndex = dynamicContracts.findIndex((c) => c.id === contract.id);
    if (dynamicIndex >= 0) {
      dynamicContracts[dynamicIndex] = updatedContract;
    }

    // Note: Static contracts from JSON can't be updated in mock mode
    // In production, all updates would go through the API

    return updatedContract;
  }

  /**
   * Check if a draft version already exists for a contract
   */
  static hasDraftVersion(contractId: string): boolean {
    return this.getContracts().some((c) => c.contractId === contractId && c.status === 'draft');
  }

  /**
   * Get the existing draft for a contract, if any
   */
  static getDraftVersion(contractId: string): Contract | undefined {
    return this.getContracts().find((c) => c.contractId === contractId && c.status === 'draft');
  }
}
