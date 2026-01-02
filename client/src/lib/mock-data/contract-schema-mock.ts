/**
 * Contract Schema Mock Data
 *
 * Provides mock contract schemas for the contract builder.
 * In production, these would be fetched from /api/contracts/schema/:type
 */

import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import type { ContractType } from '@/components/contract-builder/models/types';

// Import the static JSON schema files
import effectJsonSchema from '@/components/contract-builder/schemas/effect-schema.json';
import effectUiSchema from '@/components/contract-builder/schemas/effect-uischema.json';

/**
 * Schema definition for a contract type
 */
export interface ContractSchemaDefinition {
  type: ContractType;
  jsonSchema: RJSFSchema;
  uiSchema: UiSchema;
}

/**
 * All available contract schemas
 */
const contractSchemas: Record<ContractType, ContractSchemaDefinition> = {
  effect: {
    type: 'effect',
    jsonSchema: effectJsonSchema as RJSFSchema,
    uiSchema: effectUiSchema as UiSchema,
  },
  // TODO: Add other contract type schemas when available
  // For now, use effect schema as placeholder for other types
  orchestrator: {
    type: 'orchestrator',
    jsonSchema: effectJsonSchema as RJSFSchema,
    uiSchema: effectUiSchema as UiSchema,
  },
  reducer: {
    type: 'reducer',
    jsonSchema: effectJsonSchema as RJSFSchema,
    uiSchema: effectUiSchema as UiSchema,
  },
  compute: {
    type: 'compute',
    jsonSchema: effectJsonSchema as RJSFSchema,
    uiSchema: effectUiSchema as UiSchema,
  },
};

/**
 * Mock data class for contract schemas
 * Follows the same pattern as other mock data classes in the codebase
 */
export class ContractSchemaMockData {
  /**
   * Get all available contract types
   */
  static getContractTypes(): ContractType[] {
    return Object.keys(contractSchemas) as ContractType[];
  }

  /**
   * Get schema for a specific contract type
   */
  static getSchema(type: ContractType): ContractSchemaDefinition | undefined {
    return contractSchemas[type];
  }

  /**
   * Get JSON schema for a specific contract type
   */
  static getJsonSchema(type: ContractType): RJSFSchema | undefined {
    return contractSchemas[type]?.jsonSchema;
  }

  /**
   * Get UI schema for a specific contract type
   */
  static getUiSchema(type: ContractType): UiSchema | undefined {
    return contractSchemas[type]?.uiSchema;
  }

  /**
   * Get all schemas
   */
  static getAllSchemas(): ContractSchemaDefinition[] {
    return Object.values(contractSchemas);
  }
}
