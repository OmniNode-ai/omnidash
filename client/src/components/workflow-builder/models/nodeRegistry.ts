import type { NodeTypeDefinition } from './types';

// Node type definitions loaded from external JSON
// In production, this could be fetched from a backend registry API
import nodeTypesJson from './nodeTypes.json';

// Cast the imported JSON to our typed definitions
export const NODE_TYPE_DEFINITIONS: NodeTypeDefinition[] = nodeTypesJson as NodeTypeDefinition[];

// Create a lookup map for quick access
export const NODE_TYPE_MAP = new Map<string, NodeTypeDefinition>(
  NODE_TYPE_DEFINITIONS.map((def) => [def.type, def])
);

// Get a node type definition by type
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
