import type { NodeTypeDefinition, ConfigField } from './types';
import { nodeRegistrySource } from '@/lib/data-sources';

/**
 * Node Registry
 *
 * Provides access to workflow node type definitions.
 * Uses the nodeRegistrySource provider which supports both:
 * - Mock mode: Static JSON data (for development)
 * - HTTP mode: API fetch from /api/workflow/node-types (for production)
 *
 * The synchronous exports (NODE_TYPE_DEFINITIONS, NODE_TYPE_MAP, getNodeTypeDefinition)
 * are provided for backward compatibility with existing components.
 * For new code, prefer using nodeRegistrySource directly for async access.
 */

// Synchronous access to node types (uses mock data for initial render)
// This maintains backward compatibility with existing components
export const NODE_TYPE_DEFINITIONS: NodeTypeDefinition[] = nodeRegistrySource.getNodeTypesSync();

// Create a lookup map for quick access
export const NODE_TYPE_MAP = new Map<string, NodeTypeDefinition>(
  NODE_TYPE_DEFINITIONS.map((def) => [def.type, def])
);

// Get a node type definition by type (synchronous)
export function getNodeTypeDefinition(type: string): NodeTypeDefinition | undefined {
  return NODE_TYPE_MAP.get(type);
}

// Default node type if type is not found
export const DEFAULT_NODE_TYPE: NodeTypeDefinition = {
  type: 'unknown',
  label: 'Unknown',
  color: '#6b7280', // gray
  description: 'Unknown node type',
  inputs: [{ name: 'In' }],
  outputs: [{ name: 'Out' }],
};

/**
 * Async API for fetching node types from the registry
 * Use this when you need to ensure fresh data from the API
 */
export async function fetchNodeTypes(): Promise<{
  data: NodeTypeDefinition[];
  isMock: boolean;
}> {
  return nodeRegistrySource.fetchNodeTypes();
}

/**
 * Async API for fetching a specific node type
 */
export async function fetchNodeType(type: string): Promise<{
  data: NodeTypeDefinition | undefined;
  isMock: boolean;
}> {
  return nodeRegistrySource.fetchNodeType(type);
}

/**
 * Re-export the source for direct access when needed
 */
export { nodeRegistrySource };

/**
 * Get the default value for a config field
 */
function getFieldDefault(field: ConfigField): unknown {
  if (field.default !== undefined) {
    return field.default;
  }
  // Return type-appropriate empty defaults for required fields without explicit defaults
  switch (field.type) {
    case 'string':
    case 'multiline':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'select':
      return field.options.length > 0 ? field.options[0].value : '';
    case 'json':
      return {};
    default:
      return undefined;
  }
}

/**
 * Get default data values for a node type based on its configFields
 * Returns an object with all fields that have default values set
 */
export function getDefaultNodeData(nodeType: string): Record<string, unknown> {
  const typeDef = getNodeTypeDefinition(nodeType);
  if (!typeDef?.configFields) {
    return {};
  }

  const defaults: Record<string, unknown> = {};
  for (const field of typeDef.configFields) {
    if (field.default !== undefined) {
      defaults[field.name] = field.default;
    }
  }
  return defaults;
}

/**
 * Validation error for a specific field
 */
export interface FieldValidationError {
  field: string;
  message: string;
}

/**
 * Check if a value is considered "empty" for validation purposes
 */
function isEmptyValue(value: unknown, fieldType: ConfigField['type']): boolean {
  if (value === undefined || value === null) return true;
  if (fieldType === 'string' || fieldType === 'multiline') {
    return (value as string).trim() === '';
  }
  if (fieldType === 'select') {
    return (value as string) === '';
  }
  // Numbers, booleans, and json are never considered "empty" if they have any value
  return false;
}

/**
 * Validate node data against its type's configFields schema
 * Returns an array of validation errors (empty array if valid)
 */
export function validateNodeData(
  nodeType: string,
  data: Record<string, unknown>
): FieldValidationError[] {
  const typeDef = getNodeTypeDefinition(nodeType);
  if (!typeDef?.configFields) {
    return [];
  }

  const errors: FieldValidationError[] = [];

  for (const field of typeDef.configFields) {
    const value = data[field.name];

    // Check required fields
    if (field.required && isEmptyValue(value, field.type)) {
      errors.push({
        field: field.name,
        message: `${field.label} is required`,
      });
      continue; // Skip further validation for this field
    }

    // Type-specific validation
    if (value !== undefined && value !== null && !isEmptyValue(value, field.type)) {
      if (field.type === 'number') {
        const numValue = value as number;
        if (field.min !== undefined && numValue < field.min) {
          errors.push({
            field: field.name,
            message: `${field.label} must be at least ${field.min}`,
          });
        }
        if (field.max !== undefined && numValue > field.max) {
          errors.push({
            field: field.name,
            message: `${field.label} must be at most ${field.max}`,
          });
        }
      }
    }
  }

  return errors;
}
