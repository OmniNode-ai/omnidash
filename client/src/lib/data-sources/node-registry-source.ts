/**
 * Node Registry Data Source
 *
 * Provides node type definitions for the workflow builder.
 * Supports both mock mode (using static JSON) and HTTP mode (fetching from API).
 *
 * API Endpoint (future): GET /api/workflow/node-types
 */

import { USE_MOCK_DATA, NodeRegistryMockData } from '../mock-data';
import type { NodeTypeDefinition } from '@/components/workflow-builder/models/types';

// Re-export the type for convenience
export type { NodeTypeDefinition };

/**
 * Response wrapper that includes whether data is from mock or real API
 */
interface NodeRegistryResponse<T> {
  data: T;
  isMock: boolean;
}

/**
 * Node Registry Source
 *
 * Abstracts the data source for workflow node types.
 * When USE_MOCK_DATA is true, returns static JSON data.
 * When false, attempts to fetch from the API with fallback to mock.
 *
 * Note: Caching is handled by TanStack Query at the component level,
 * following the same pattern as other data sources in this codebase.
 */
class NodeRegistrySource {
  /**
   * Fetch all node type definitions
   */
  async fetchNodeTypes(): Promise<NodeRegistryResponse<NodeTypeDefinition[]>> {
    // Return mock data if flag is enabled
    if (USE_MOCK_DATA) {
      return {
        data: NodeRegistryMockData.getNodeTypes(),
        isMock: true,
      };
    }

    // Try fetching from API
    try {
      const response = await fetch('/api/workflow/node-types');
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch node types from API, falling back to mock data', err);
    }

    // Fallback to mock data if API fails
    return {
      data: NodeRegistryMockData.getNodeTypes(),
      isMock: true,
    };
  }

  /**
   * Fetch a specific node type by its type identifier
   */
  async fetchNodeType(type: string): Promise<NodeRegistryResponse<NodeTypeDefinition | undefined>> {
    const { data, isMock } = await this.fetchNodeTypes();
    const nodeType = data.find((nt) => nt.type === type);
    return { data: nodeType, isMock };
  }

  /**
   * Get all node types synchronously (uses mock data)
   * Useful for initial render before async fetch completes
   */
  getNodeTypesSync(): NodeTypeDefinition[] {
    return NodeRegistryMockData.getNodeTypes();
  }

  /**
   * Get a specific node type synchronously
   */
  getNodeTypeSync(type: string): NodeTypeDefinition | undefined {
    return NodeRegistryMockData.getNodeType(type);
  }

  /**
   * Check if we're using mock data
   */
  isUsingMockData(): boolean {
    return USE_MOCK_DATA;
  }
}

// Export singleton instance
export const nodeRegistrySource = new NodeRegistrySource();
