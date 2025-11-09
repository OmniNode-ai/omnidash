import { describe, it, expect, beforeEach, vi } from 'vitest';
import { knowledgeGraphSource } from '../knowledge-graph-source';
import type { GraphNode, GraphEdge, KnowledgeGraphData } from '../knowledge-graph-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('KnowledgeGraphSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchGraph', () => {
    it('should return graph data from API when successful', async () => {
      const mockNodes: GraphNode[] = [
        { id: 'node-1', label: 'Test Node 1', type: 'pattern', quality: 0.95 },
        { id: 'node-2', label: 'Test Node 2', type: 'service', status: 'healthy' },
        { id: 'node-3', label: 'Test Node 3', type: 'agent', activeRuns: 10 },
      ];

      const mockEdges: GraphEdge[] = [
        { source: 'node-1', target: 'node-2', type: 'uses', weight: 5 },
        { source: 'node-2', target: 'node-3', type: 'depends-on', weight: 8 },
      ];

      const mockGraphData = {
        nodes: mockNodes,
        edges: mockEdges,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(false);
      expect(result.nodes).toEqual(mockNodes);
      expect(result.edges).toEqual(mockEdges);
      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });

    it('should return graph data with custom limit parameter', async () => {
      const mockGraphData = {
        nodes: [
          { id: 'node-1', label: 'Node 1', type: 'pattern' },
        ],
        edges: [
          { source: 'node-1', target: 'node-2', type: 'uses' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('7d', 500);

      expect(result.isMock).toBe(false);
      expect(result.nodes).toEqual(mockGraphData.nodes);
      expect(result.edges).toEqual(mockGraphData.edges);
    });

    it('should handle empty nodes and edges from API', async () => {
      const mockGraphData = {
        nodes: [],
        edges: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(false);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should return empty arrays when API response has no nodes/edges properties', async () => {
      const mockGraphData = {};

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(false);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should return mock fallback data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(true);
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should return mock fallback data when API throws network error', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', new Error('Network error')],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(true);
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should return mock fallback with correct structure', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(null, { status: 404 })],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(true);

      // Verify fallback has pattern nodes
      const patternNodes = result.nodes.filter(n => n.type === 'pattern');
      expect(patternNodes.length).toBeGreaterThan(0);

      // Verify fallback has service nodes
      const serviceNodes = result.nodes.filter(n => n.type === 'service');
      expect(serviceNodes.length).toBeGreaterThan(0);

      // Verify node structure
      result.nodes.forEach(node => {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('label');
        expect(node).toHaveProperty('type');
        expect(typeof node.id).toBe('string');
        expect(typeof node.label).toBe('string');
        expect(typeof node.type).toBe('string');
      });

      // Verify edge structure
      result.edges.forEach(edge => {
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(typeof edge.source).toBe('string');
        expect(typeof edge.target).toBe('string');
      });
    });

    it('should return mock fallback with expected node types', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(true);

      // Verify pattern nodes exist
      const patterns = result.nodes.filter(n => n.type === 'pattern');
      expect(patterns.length).toBeGreaterThanOrEqual(3);
      expect(patterns.some(p => p.label === 'OAuth Authentication')).toBe(true);
      expect(patterns.some(p => p.label === 'Database Connection Pool')).toBe(true);
      expect(patterns.some(p => p.label === 'Error Handling Middleware')).toBe(true);

      // Verify service nodes exist
      const services = result.nodes.filter(n => n.type === 'service');
      expect(services.length).toBeGreaterThanOrEqual(3);
      expect(services.some(s => s.label === 'API Gateway')).toBe(true);
      expect(services.some(s => s.label === 'Agent Service')).toBe(true);
      expect(services.some(s => s.label === 'Intelligence Service')).toBe(true);
    });

    it('should return mock fallback with valid relationships', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(null, { status: 503 })],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(true);

      // Verify edges connect valid nodes
      const nodeIds = result.nodes.map(n => n.id);
      result.edges.forEach(edge => {
        expect(nodeIds).toContain(edge.source);
        expect(nodeIds).toContain(edge.target);
      });

      // Verify we have some edges
      expect(result.edges.length).toBeGreaterThan(0);

      // Verify all edges have required properties
      result.edges.forEach(edge => {
        expect(edge.source).toBeDefined();
        expect(edge.target).toBeDefined();
      });
    });

    it('should use default limit when not specified', async () => {
      const mockGraphData = {
        nodes: [{ id: 'node-1', label: 'Node 1', type: 'pattern' }],
        edges: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h');

      expect(result.isMock).toBe(false);
      expect(result.nodes.length).toBe(1);
    });

    it('should handle API response with extra properties', async () => {
      const mockGraphData = {
        nodes: [
          {
            id: 'node-1',
            label: 'Node 1',
            type: 'pattern',
            extraProp: 'extra value',
            metadata: { key: 'value' }
          },
        ],
        edges: [
          {
            source: 'node-1',
            target: 'node-2',
            type: 'uses',
            weight: 10,
            description: 'Test edge'
          },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      expect(result.isMock).toBe(false);
      expect(result.nodes[0]).toHaveProperty('extraProp', 'extra value');
      expect(result.nodes[0]).toHaveProperty('metadata');
      expect(result.edges[0]).toHaveProperty('weight', 10);
      expect(result.edges[0]).toHaveProperty('description', 'Test edge');
    });

    it('should handle different time range parameters', async () => {
      const mockGraphData = {
        nodes: [{ id: 'node-1', label: 'Node 1', type: 'pattern' }],
        edges: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      // Test with different time ranges
      const timeRanges = ['1h', '24h', '7d', '30d'];

      for (const timeRange of timeRanges) {
        const result = await knowledgeGraphSource.fetchGraph(timeRange, 100);
        expect(result.isMock).toBe(false);
        expect(result.nodes.length).toBe(1);
      }
    });
  });

  describe('Graph data structure validation', () => {
    it('should return KnowledgeGraphData with required properties', async () => {
      const mockGraphData = {
        nodes: [{ id: 'node-1', label: 'Node 1', type: 'pattern' }],
        edges: [{ source: 'node-1', target: 'node-2', type: 'uses' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      // Validate KnowledgeGraphData interface
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
      expect(result).toHaveProperty('isMock');
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
      expect(typeof result.isMock).toBe('boolean');
    });

    it('should validate GraphNode structure from API', async () => {
      const mockGraphData = {
        nodes: [
          { id: 'node-1', label: 'Test Node', type: 'pattern', customField: 'value' }
        ],
        edges: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      const node = result.nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('type');
      expect(typeof node.id).toBe('string');
      expect(typeof node.label).toBe('string');
      expect(typeof node.type).toBe('string');

      // Verify additional properties are preserved from API
      expect(node).toHaveProperty('customField', 'value');
    });

    it('should validate GraphEdge structure from API', async () => {
      const mockGraphData = {
        nodes: [],
        edges: [
          { source: 'node-1', target: 'node-2', type: 'uses', weight: 5 }
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/knowledge/graph', createMockResponse(mockGraphData)],
        ])
      );

      const result = await knowledgeGraphSource.fetchGraph('24h', 100);

      const edge = result.edges[0];
      expect(edge).toHaveProperty('source');
      expect(edge).toHaveProperty('target');
      expect(typeof edge.source).toBe('string');
      expect(typeof edge.target).toBe('string');

      // Verify optional properties from API
      expect(edge).toHaveProperty('type', 'uses');
      expect(edge).toHaveProperty('weight', 5);
    });
  });
});
