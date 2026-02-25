import { describe, it, expect, beforeEach, vi } from 'vitest';
import { architectureNetworksSource } from '../architecture-networks-source';
import type {
  ArchitectureSummary,
  ArchitectureNode,
  ArchitectureEdge,
  KnowledgeEntity,
  EventFlow,
} from '../architecture-networks-source';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../../tests/utils/mock-fetch';

describe('ArchitectureNetworksSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchSummary', () => {
    it('should return architecture summary from API', async () => {
      const mockSummary: ArchitectureSummary = {
        totalNodes: 12,
        totalEdges: 18,
        services: 6,
        patterns: 4,
      };

      setupFetchMock(new Map([['/api/architecture/summary', createMockResponse(mockSummary)]]));

      const result = await architectureNetworksSource.fetchSummary('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockSummary);
    });

    it('should validate summary values are in acceptable ranges', async () => {
      const mockSummary: ArchitectureSummary = {
        totalNodes: 15,
        totalEdges: 25,
        services: 8,
        patterns: 6,
      };

      setupFetchMock(new Map([['/api/architecture/summary', createMockResponse(mockSummary)]]));

      const result = await architectureNetworksSource.fetchSummary('7d');

      expect(result.data.totalNodes).toBeGreaterThanOrEqual(0);
      expect(result.data.totalEdges).toBeGreaterThanOrEqual(0);
      expect(result.data.services).toBeGreaterThanOrEqual(0);
      expect(result.data.patterns).toBeGreaterThanOrEqual(0);
      // Edges should typically be more than or equal to nodes-1 in a connected graph
      expect(result.data.totalEdges).toBeGreaterThanOrEqual(result.data.totalNodes - 1);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([['/api/architecture/summary', createMockResponse(null, { status: 500 })]])
      );

      const result = await architectureNetworksSource.fetchSummary('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalNodes).toBe(8);
      expect(result.data.totalEdges).toBe(12);
      expect(result.data.services).toBe(6);
      expect(result.data.patterns).toBe(2);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(
        new Map([['/api/architecture/summary', new Error('Network connection failed')]])
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await architectureNetworksSource.fetchSummary('30d');

      expect(result.isMock).toBe(true);
      expect(result.data.totalNodes).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch architecture summary, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchNodes', () => {
    it('should return architecture nodes from API', async () => {
      const mockNodes: ArchitectureNode[] = [
        { id: 'node-1', name: 'Service A', type: 'service' },
        { id: 'node-2', name: 'Agent B', type: 'agent' },
        { id: 'node-3', name: 'Database C', type: 'database' },
      ];

      setupFetchMock(new Map([['/api/architecture/nodes', createMockResponse(mockNodes)]]));

      const result = await architectureNetworksSource.fetchNodes('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockNodes);
      expect(result.data.length).toBe(3);
    });

    it('should validate node structure', async () => {
      const mockNodes: ArchitectureNode[] = [
        { id: 'node-1', name: 'API Gateway', type: 'service', metadata: { version: '1.0' } },
        { id: 'node-2', name: 'Polymorphic Agent', type: 'agent', status: 'active' },
      ];

      setupFetchMock(new Map([['/api/architecture/nodes', createMockResponse(mockNodes)]]));

      const result = await architectureNetworksSource.fetchNodes('7d');

      result.data.forEach((node) => {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('name');
        expect(node).toHaveProperty('type');
        expect(node.id).toBeTruthy();
        expect(node.name).toBeTruthy();
        expect(node.type).toBeTruthy();
      });
    });

    it('should return empty array when API returns non-array', async () => {
      setupFetchMock(new Map([['/api/architecture/nodes', createMockResponse({ nodes: [] })]]));

      const result = await architectureNetworksSource.fetchNodes('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([['/api/architecture/nodes', createMockResponse(null, { status: 500 })]])
      );

      const result = await architectureNetworksSource.fetchNodes('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBe(8); // Mock has 8 nodes
      expect(result.data.every((node) => node.id && node.name && node.type)).toBe(true);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/architecture/nodes', new Error('Connection timeout')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await architectureNetworksSource.fetchNodes('30d');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch architecture nodes, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchEdges', () => {
    it('should return architecture edges from API', async () => {
      const mockEdges: ArchitectureEdge[] = [
        { source: 'node-1', target: 'node-2', type: 'routes-to' },
        { source: 'node-2', target: 'node-3', type: 'queries' },
        { source: 'node-1', target: 'node-3', type: 'delegates-to' },
      ];

      setupFetchMock(new Map([['/api/architecture/edges', createMockResponse(mockEdges)]]));

      const result = await architectureNetworksSource.fetchEdges('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockEdges);
      expect(result.data.length).toBe(3);
    });

    it('should validate edge structure', async () => {
      const mockEdges: ArchitectureEdge[] = [
        { source: 'node-1', target: 'node-2', type: 'routes-to', weight: 5 },
        { source: 'node-3', target: 'node-4', type: 'queries' },
      ];

      setupFetchMock(new Map([['/api/architecture/edges', createMockResponse(mockEdges)]]));

      const result = await architectureNetworksSource.fetchEdges('7d');

      result.data.forEach((edge) => {
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(edge.source).toBeTruthy();
        expect(edge.target).toBeTruthy();
        // Source and target should be different
        expect(edge.source).not.toBe(edge.target);
      });
    });

    it('should return empty array when API returns non-array', async () => {
      setupFetchMock(new Map([['/api/architecture/edges', createMockResponse({ edges: [] })]]));

      const result = await architectureNetworksSource.fetchEdges('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([['/api/architecture/edges', createMockResponse(null, { status: 500 })]])
      );

      const result = await architectureNetworksSource.fetchEdges('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBe(12); // Mock has 12 edges
      expect(result.data.every((edge) => edge.source && edge.target)).toBe(true);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/architecture/edges', new Error('API unreachable')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await architectureNetworksSource.fetchEdges('30d');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch architecture edges, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchKnowledgeEntities', () => {
    it('should return knowledge entities from API', async () => {
      const mockEntities: KnowledgeEntity[] = [
        { id: 'entity-1', name: 'Entity A', type: 'concept' },
        { id: 'entity-2', name: 'Entity B', type: 'pattern' },
      ];

      setupFetchMock(new Map([['/api/knowledge/entities', createMockResponse(mockEntities)]]));

      const result = await architectureNetworksSource.fetchKnowledgeEntities('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockEntities);
    });

    it('should validate entity structure', async () => {
      const mockEntities: KnowledgeEntity[] = [
        { id: 'entity-1', name: 'Code Pattern', type: 'pattern', confidence: 0.95 },
      ];

      setupFetchMock(new Map([['/api/knowledge/entities', createMockResponse(mockEntities)]]));

      const result = await architectureNetworksSource.fetchKnowledgeEntities('7d');

      result.data.forEach((entity) => {
        expect(entity).toHaveProperty('id');
        expect(entity).toHaveProperty('name');
        expect(entity).toHaveProperty('type');
        expect(entity.id).toBeTruthy();
        expect(entity.name).toBeTruthy();
        expect(entity.type).toBeTruthy();
      });
    });

    it('should return empty array when API returns non-array', async () => {
      setupFetchMock(new Map([['/api/knowledge/entities', createMockResponse({ entities: [] })]]));

      const result = await architectureNetworksSource.fetchKnowledgeEntities('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should return mock data (empty array) when API fails', async () => {
      setupFetchMock(
        new Map([['/api/knowledge/entities', createMockResponse(null, { status: 500 })]])
      );

      const result = await architectureNetworksSource.fetchKnowledgeEntities('24h');

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/knowledge/entities', new Error('Network error')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await architectureNetworksSource.fetchKnowledgeEntities('30d');

      expect(result.isMock).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch knowledge entities, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchEventFlow', () => {
    it('should return event flow from API', async () => {
      const mockEventFlow: EventFlow = {
        events: [
          { id: 'event-1', timestamp: '2024-01-01T00:00:00Z', type: 'routing' },
          { id: 'event-2', timestamp: '2024-01-01T00:01:00Z', type: 'execution' },
        ],
      };

      setupFetchMock(new Map([['/api/events/flow', createMockResponse(mockEventFlow)]]));

      const result = await architectureNetworksSource.fetchEventFlow('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockEventFlow);
      expect(result.data.events.length).toBe(2);
    });

    it('should validate event structure', async () => {
      const mockEventFlow: EventFlow = {
        events: [
          { id: 'event-1', timestamp: '2024-01-01T00:00:00Z', type: 'routing', agentId: 'agent-1' },
          { id: 'event-2', timestamp: '2024-01-01T00:01:00Z', type: 'execution' },
        ],
      };

      setupFetchMock(new Map([['/api/events/flow', createMockResponse(mockEventFlow)]]));

      const result = await architectureNetworksSource.fetchEventFlow('7d');

      result.data.events.forEach((event) => {
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('type');
        expect(event.id).toBeTruthy();
        expect(event.timestamp).toBeTruthy();
        expect(event.type).toBeTruthy();
      });
    });

    it('should return empty events when API fails', async () => {
      setupFetchMock(new Map([['/api/events/flow', createMockResponse(null, { status: 500 })]]));

      const result = await architectureNetworksSource.fetchEventFlow('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.events).toEqual([]);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/events/flow', new Error('Connection failed')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await architectureNetworksSource.fetchEventFlow('30d');

      expect(result.isMock).toBe(true);
      expect(result.data.events).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch event flow, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchAll', () => {
    it('should combine all architecture data sources', async () => {
      const mockSummary: ArchitectureSummary = {
        totalNodes: 10,
        totalEdges: 15,
        services: 5,
        patterns: 3,
      };
      const mockNodes: ArchitectureNode[] = [
        { id: 'node-1', name: 'Service A', type: 'service' },
        { id: 'node-2', name: 'Agent B', type: 'agent' },
      ];
      const mockEdges: ArchitectureEdge[] = [
        { source: 'node-1', target: 'node-2', type: 'routes-to' },
      ];
      const mockEntities: KnowledgeEntity[] = [
        { id: 'entity-1', name: 'Pattern A', type: 'pattern' },
      ];
      const mockEventFlow: EventFlow = {
        events: [{ id: 'event-1', timestamp: '2024-01-01T00:00:00Z', type: 'routing' }],
      };

      setupFetchMock(
        new Map([
          ['/api/architecture/summary', createMockResponse(mockSummary)],
          ['/api/architecture/nodes', createMockResponse(mockNodes)],
          ['/api/architecture/edges', createMockResponse(mockEdges)],
          ['/api/knowledge/entities', createMockResponse(mockEntities)],
          ['/api/events/flow', createMockResponse(mockEventFlow)],
        ])
      );

      const result = await architectureNetworksSource.fetchAll('24h');

      expect(result.summary).toEqual(mockSummary);
      expect(result.nodes).toEqual(mockNodes);
      expect(result.edges).toEqual(mockEdges);
      expect(result.knowledgeEntities).toEqual(mockEntities);
      expect(result.eventFlow).toEqual(mockEventFlow);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any source fails', async () => {
      const mockSummary: ArchitectureSummary = {
        totalNodes: 10,
        totalEdges: 15,
        services: 5,
        patterns: 3,
      };
      const mockNodes: ArchitectureNode[] = [{ id: 'node-1', name: 'Service A', type: 'service' }];

      setupFetchMock(
        new Map([
          ['/api/architecture/summary', createMockResponse(mockSummary)],
          ['/api/architecture/nodes', createMockResponse(mockNodes)],
          ['/api/architecture/edges', createMockResponse(null, { status: 500 })],
          ['/api/knowledge/entities', createMockResponse([])],
          ['/api/events/flow', createMockResponse({ events: [] })],
        ])
      );

      const result = await architectureNetworksSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
    });

    it('should validate all data is present even when using mock', async () => {
      setupFetchMock(
        new Map([
          ['/api/architecture/summary', createMockResponse(null, { status: 500 })],
          ['/api/architecture/nodes', createMockResponse(null, { status: 500 })],
          ['/api/architecture/edges', createMockResponse(null, { status: 500 })],
          ['/api/knowledge/entities', createMockResponse(null, { status: 500 })],
          ['/api/events/flow', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await architectureNetworksSource.fetchAll('7d');

      expect(result.isMock).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.knowledgeEntities).toBeDefined();
      expect(result.eventFlow).toBeDefined();
      // Verify mock data has reasonable values
      expect(result.summary.totalNodes).toBeGreaterThan(0);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);
    });
  });
});
