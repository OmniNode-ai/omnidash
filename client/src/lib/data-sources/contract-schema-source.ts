/**
 * Contract Schema Data Source
 *
 * Provides contract schemas for the contract builder.
 * Supports both mock mode (using static JSON) and HTTP mode (fetching from API).
 *
 * API Endpoints (future):
 * - GET /api/contracts/types - List available contract types
 * - GET /api/contracts/schema/:type - Get schema for a contract type
 */

import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { USE_MOCK_DATA, ContractSchemaMockData } from '../mock-data';
import type { ContractType } from '@/components/contract-builder/models/types';

// Re-export the schema definition type
export type { ContractSchemaDefinition } from '../mock-data/contract-schema-mock';

/**
 * Schema response with both JSON Schema and UI Schema
 */
export interface ContractSchemas {
  jsonSchema: RJSFSchema;
  uiSchema: UiSchema;
}

/**
 * Response wrapper that includes whether data is from mock or real API
 */
interface SchemaSourceResponse<T> {
  data: T;
  isMock: boolean;
}

/**
 * Contract Schema Source
 *
 * Abstracts the data source for contract schemas.
 * When USE_MOCK_DATA is true, returns static JSON data.
 * When false, attempts to fetch from the API with fallback to mock.
 *
 * Note: Caching is handled by TanStack Query at the component level,
 * following the same pattern as other data sources in this codebase.
 */
class ContractSchemaSource {
  /**
   * Fetch available contract types
   */
  async fetchContractTypes(): Promise<SchemaSourceResponse<ContractType[]>> {
    // Return mock data if flag is enabled
    if (USE_MOCK_DATA) {
      return {
        data: ContractSchemaMockData.getContractTypes(),
        isMock: true,
      };
    }

    // Try fetching from API
    try {
      const response = await fetch('/api/contracts/types');
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch contract types from API, falling back to mock data', err);
    }

    // Fallback to mock data if API fails
    return {
      data: ContractSchemaMockData.getContractTypes(),
      isMock: true,
    };
  }

  /**
   * Fetch schema for a specific contract type
   */
  async fetchSchema(
    type: ContractType
  ): Promise<SchemaSourceResponse<ContractSchemas | undefined>> {
    // Return mock data if flag is enabled
    if (USE_MOCK_DATA) {
      const schema = ContractSchemaMockData.getSchema(type);
      return {
        data: schema ? { jsonSchema: schema.jsonSchema, uiSchema: schema.uiSchema } : undefined,
        isMock: true,
      };
    }

    // Try fetching from API
    try {
      const response = await fetch(`/api/contracts/schema/${type}`);
      if (response.ok) {
        const data = await response.json();
        // API expected to return { jsonSchema, uiSchema }
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn(`Failed to fetch schema for ${type} from API, falling back to mock data`, err);
    }

    // Fallback to mock data if API fails
    const schema = ContractSchemaMockData.getSchema(type);
    return {
      data: schema ? { jsonSchema: schema.jsonSchema, uiSchema: schema.uiSchema } : undefined,
      isMock: true,
    };
  }

  /**
   * Get contract types synchronously (uses mock data)
   * Useful for initial render before async fetch completes
   */
  getContractTypesSync(): ContractType[] {
    return ContractSchemaMockData.getContractTypes();
  }

  /**
   * Get schema synchronously (uses mock data)
   * Useful for initial render before async fetch completes
   */
  getSchemaSync(type: ContractType): ContractSchemas | undefined {
    const schema = ContractSchemaMockData.getSchema(type);
    if (!schema) return undefined;
    return {
      jsonSchema: schema.jsonSchema,
      uiSchema: schema.uiSchema,
    };
  }

  /**
   * Check if we're using mock data
   */
  isUsingMockData(): boolean {
    return USE_MOCK_DATA;
  }
}

// Export singleton instance
export const contractSchemaSource = new ContractSchemaSource();
