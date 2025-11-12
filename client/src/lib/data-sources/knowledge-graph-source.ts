// Knowledge Graph Data Source
import { USE_MOCK_DATA, KnowledgeGraphMockData } from '../mock-data';
import { ensureArray } from '../defensive-transform-logger';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  [key: string]: any;
}

export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
  [key: string]: any;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  isMock: boolean;
}

class KnowledgeGraphSource {
  async fetchGraph(timeRange: string, limit: number = 1000): Promise<KnowledgeGraphData> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return KnowledgeGraphMockData.generateAll(50, 80);
    }

    try {
      const omniarchonUrl = import.meta.env.VITE_INTELLIGENCE_SERVICE_URL || "http://localhost:8053";
      const response = await fetch(`${omniarchonUrl}/api/intelligence/knowledge/graph?limit=${limit}&timeWindow=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return {
          nodes: ensureArray('nodes', data.nodes, { context: 'knowledge-graph' }),
          edges: ensureArray('edges', data.edges, { context: 'knowledge-graph' }),
          isMock: false,
        };
      }
    } catch (err) {
      console.warn('Failed to fetch knowledge graph, using mock data', err);
    }

    // Mock fallback with pattern↔service relationships
    return {
      nodes: [
        { id: 'pattern-1', label: 'OAuth Authentication', type: 'pattern' },
        { id: 'pattern-2', label: 'Database Connection Pool', type: 'pattern' },
        { id: 'pattern-3', label: 'Error Handling Middleware', type: 'pattern' },
        { id: 'service-1', label: 'API Gateway', type: 'service' },
        { id: 'service-2', label: 'Agent Service', type: 'service' },
        { id: 'service-3', label: 'Intelligence Service', type: 'service' },
      ],
      edges: [
        { source: 'pattern-1', target: 'service-1', type: 'used-by' },
        { source: 'pattern-1', target: 'service-2', type: 'used-by' },
        { source: 'pattern-2', target: 'service-2', type: 'used-by' },
        { source: 'pattern-2', target: 'service-3', type: 'used-by' },
        { source: 'pattern-3', target: 'service-1', type: 'used-by' },
        { source: 'pattern-3', target: 'service-2', type: 'used-by' },
        { source: 'pattern-3', target: 'service-3', type: 'used-by' },
      ],
      isMock: true,
    };
  }
}

export const knowledgeGraphSource = new KnowledgeGraphSource();

