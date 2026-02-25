/**
 * Contract Schema Data Source
 *
 * Provides contract schemas for the contract builder.
 * Fetches data from the real API — no mock fallbacks.
 *
 * API Endpoints:
 * - GET /api/contracts/types - List available contract types
 * - GET /api/contracts/schema/:type - Get schema for a contract type
 */

import type { ContractType } from '@/components/contract-builder/models/types';

/**
 * Schema response with both JSON Schema and UI Schema.
 *
 * Previously typed with RJSFSchema/UiSchema from @rjsf/utils.
 * Now uses plain Record types since RJSF has been removed (OMN-2755).
 */
export interface ContractSchemas {
  jsonSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
}

/**
 * Response wrapper that includes whether data is from mock or real API
 */
interface SchemaSourceResponse<T> {
  data: T;
  isMock: boolean;
}

/**
 * The 4 supported contract types.
 * This list is stable and does not require an API round-trip.
 */
const CONTRACT_TYPES: ContractType[] = ['effect', 'orchestrator', 'reducer', 'compute'];

/**
 * Contract Schema Source
 *
 * Fetches contract schema data from the real API.
 * On API failure, errors propagate to the caller — no silent mock fallback.
 *
 * Note: Caching is handled by TanStack Query at the component level,
 * following the same pattern as other data sources in this codebase.
 */
class ContractSchemaSource {
  /**
   * Fetch available contract types
   */
  async fetchContractTypes(): Promise<SchemaSourceResponse<ContractType[]>> {
    const response = await fetch('/api/contracts/types');
    if (!response.ok) {
      throw new Error(
        `Failed to fetch contract types: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    return { data: Array.isArray(data) ? data : [], isMock: false };
  }

  /**
   * Fetch schema for a specific contract type
   */
  async fetchSchema(
    type: ContractType
  ): Promise<SchemaSourceResponse<ContractSchemas | undefined>> {
    const response = await fetch(`/api/contracts/schema/${type}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch schema for ${type}: ${response.status} ${response.statusText}`
      );
    }
    // API expected to return { jsonSchema, uiSchema }
    const data = await response.json();
    return { data, isMock: false };
  }

  /**
   * Get contract types synchronously.
   * Returns the hardcoded list of the 4 supported types.
   */
  getContractTypesSync(): ContractType[] {
    return CONTRACT_TYPES;
  }

  /**
   * Get schema synchronously.
   * Without a synchronous data store, always returns undefined.
   * Use fetchSchema(type) for actual schema data.
   */
  getSchemaSync(_type: ContractType): ContractSchemas | undefined {
    return undefined;
  }

  /**
   * Check if we're using mock data — always false in production.
   */
  isUsingMockData(): boolean {
    return false;
  }
}

// Export singleton instance
export const contractSchemaSource = new ContractSchemaSource();
