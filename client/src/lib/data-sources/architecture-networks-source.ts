// Architecture Networks Data Source
import { USE_MOCK_DATA } from '../mock-data/config';

export interface ArchitectureSummary {
  totalNodes: number;
  totalEdges: number;
  services: number;
  patterns: number;
}

export interface ArchitectureNode {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

export interface ArchitectureEdge {
  source: string;
  target: string;
  type?: string;
  [key: string]: any;
}

export interface KnowledgeEntity {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

export interface EventFlow {
  events: Array<{
    id: string;
    timestamp: string;
    type: string;
    [key: string]: any;
  }>;
}

interface ArchitectureNetworksData {
  summary: ArchitectureSummary;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  knowledgeEntities: KnowledgeEntity[];
  eventFlow: EventFlow;
  isMock: boolean;
}

class ArchitectureNetworksSource {
  async fetchSummary(timeRange: string): Promise<{ data: ArchitectureSummary; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: {
          totalNodes: 8,
          totalEdges: 12,
          services: 6,
          patterns: 2,
        },
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/architecture/summary?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch architecture summary, using mock data', err);
    }

    return {
      data: {
        totalNodes: 8,
        totalEdges: 12,
        services: 6,
        patterns: 2,
      },
      isMock: true,
    };
  }

  async fetchNodes(timeRange: string): Promise<{ data: ArchitectureNode[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: [],
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/architecture/nodes?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch architecture nodes, using mock data', err);
    }

    // Seed realistic topology with 6-8 nodes and 10-12 edges
    return {
      data: [
        { id: 'node-1', name: 'API Gateway', type: 'service' },
        { id: 'node-2', name: 'Agent Service', type: 'service' },
        { id: 'node-3', name: 'Polymorphic Agent', type: 'agent' },
        { id: 'node-4', name: 'Code Reviewer', type: 'agent' },
        { id: 'node-5', name: 'PostgreSQL', type: 'database' },
        { id: 'node-6', name: 'Qdrant', type: 'database' },
        { id: 'node-7', name: 'Intelligence Service', type: 'service' },
        { id: 'node-8', name: 'Event Stream', type: 'service' },
      ],
      isMock: true,
    };
  }

  async fetchEdges(timeRange: string): Promise<{ data: ArchitectureEdge[]; isMock: boolean }> {
    try {
      const response = await fetch(`/api/knowledge/entities?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch architecture edges, using mock data', err);
    }

    // Seed edges connecting the nodes (10-12 edges)
    return {
      data: [
        { source: 'node-1', target: 'node-2', type: 'routes-to' },
        { source: 'node-2', target: 'node-3', type: 'delegates-to' },
        { source: 'node-2', target: 'node-4', type: 'delegates-to' },
        { source: 'node-3', target: 'node-5', type: 'queries' },
        { source: 'node-3', target: 'node-6', type: 'queries' },
        { source: 'node-4', target: 'node-5', type: 'queries' },
        { source: 'node-7', target: 'node-5', type: 'queries' },
        { source: 'node-7', target: 'node-6', type: 'queries' },
        { source: 'node-7', target: 'node-3', type: 'injects-patterns' },
        { source: 'node-7', target: 'node-4', type: 'injects-patterns' },
        { source: 'node-8', target: 'node-7', type: 'streams-to' },
        { source: 'node-1', target: 'node-8', type: 'publishes-to' },
      ],
      isMock: true,
    };
  }

  async fetchKnowledgeEntities(timeRange: string): Promise<{ data: KnowledgeEntity[]; isMock: boolean }> {
    try {
      const response = await fetch(`/api/knowledge/entities?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch knowledge entities, using mock data', err);
    }

    return {
      data: [],
      isMock: true,
    };
  }

  async fetchEventFlow(timeRange: string): Promise<{ data: EventFlow; isMock: boolean }> {
    try {
      const response = await fetch(`/api/events/flow?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch event flow, using mock data', err);
    }

    return {
      data: { events: [] },
      isMock: true,
    };
  }

  async fetchAll(timeRange: string): Promise<ArchitectureNetworksData> {
    const [summary, nodes, edges, entities, eventFlow] = await Promise.all([
      this.fetchSummary(timeRange),
      this.fetchNodes(timeRange),
      this.fetchEdges(timeRange),
      this.fetchKnowledgeEntities(timeRange),
      this.fetchEventFlow(timeRange),
    ]);

    return {
      summary: summary.data,
      nodes: nodes.data,
      edges: edges.data,
      knowledgeEntities: entities.data,
      eventFlow: eventFlow.data,
      isMock: summary.isMock || nodes.isMock || edges.isMock || entities.isMock || eventFlow.isMock,
    };
  }
}

export const architectureNetworksSource = new ArchitectureNetworksSource();

