import type { NodeTypeDefinition } from './types';
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
