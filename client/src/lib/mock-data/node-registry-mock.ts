/**
 * Node Registry Mock Data
 *
 * Provides mock node type definitions for the workflow builder.
 * In production, these would be fetched from /api/workflow/node-types
 */

import type { NodeTypeDefinition } from '@/components/workflow-builder/models/types';

// Import the static JSON data
import nodeTypesJson from '@/components/workflow-builder/models/nodeTypes.json';

/**
 * Mock data class for node registry
 * Follows the same pattern as other mock data classes in the codebase
 */
export class NodeRegistryMockData {
  /**
   * Get all node type definitions
   */
  static getNodeTypes(): NodeTypeDefinition[] {
    return nodeTypesJson as NodeTypeDefinition[];
  }

  /**
   * Get a specific node type by its type identifier
   */
  static getNodeType(type: string): NodeTypeDefinition | undefined {
    const nodeTypes = this.getNodeTypes();
    return nodeTypes.find((nt) => nt.type === type);
  }

  /**
   * Get node types filtered by a predicate
   */
  static getNodeTypesFiltered(
    predicate: (nodeType: NodeTypeDefinition) => boolean
  ): NodeTypeDefinition[] {
    return this.getNodeTypes().filter(predicate);
  }

  /**
   * Get node types that have specific input/output counts
   * Useful for filtering by node complexity
   */
  static getNodeTypesByPortCount(options: {
    minInputs?: number;
    maxInputs?: number;
    minOutputs?: number;
    maxOutputs?: number;
  }): NodeTypeDefinition[] {
    return this.getNodeTypes().filter((nt) => {
      const inputCount = nt.inputs.length;
      const outputCount = nt.outputs.length;

      if (options.minInputs !== undefined && inputCount < options.minInputs) return false;
      if (options.maxInputs !== undefined && inputCount > options.maxInputs) return false;
      if (options.minOutputs !== undefined && outputCount < options.minOutputs) return false;
      if (options.maxOutputs !== undefined && outputCount > options.maxOutputs) return false;

      return true;
    });
  }
}
