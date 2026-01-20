import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentNetworkSource } from '../agent-network-source';
import type { Agent, RoutingDecision } from '../agent-network-source';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../../tests/utils/mock-fetch';

describe('AgentNetworkSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchAgents', () => {
    it('should return agents from API with isMock: false', async () => {
      const mockAgents: Agent[] = [
        { id: 'agent-1', name: 'Agent One', category: 'Category A', description: 'First agent' },
        { id: 'agent-2', name: 'Agent Two', category: 'Category B', description: 'Second agent' },
      ];

      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(mockAgents)]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockAgents);
      expect(result.data.length).toBe(2);
    });

    it('should return empty array when API returns non-array data', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse({ agents: 'invalid' })]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should return mock data when API fails with error status', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(null, { status: 500 })]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty('id');
      expect(result.data[0]).toHaveProperty('name');
      expect(result.data[0]).toHaveProperty('category');
    });

    it('should return mock data when fetch throws network error', async () => {
      setupFetchMock(new Map([['/api/agents/agents', new Error('Network error')]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([
        { id: 'polymorphic-agent', name: 'Polymorphic Agent', category: 'Code Generation' },
        { id: 'code-reviewer', name: 'Code Reviewer', category: 'Review' },
        { id: 'test-generator', name: 'Test Generator', category: 'Testing' },
        { id: 'documentation-agent', name: 'Documentation Agent', category: 'Docs' },
      ]);
    });

    it('should return empty array when API returns empty array', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse([])]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle agents with minimal properties', async () => {
      const minimalAgents: Agent[] = [
        { id: 'agent-1', name: 'Agent One' },
        { id: 'agent-2', name: 'Agent Two' },
      ];

      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(minimalAgents)]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(minimalAgents);
      expect(result.data[0].category).toBeUndefined();
      expect(result.data[0].description).toBeUndefined();
    });

    it('should handle null response from API', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(null)]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle undefined response from API as parse error', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(undefined)]]));

      const result = await agentNetworkSource.fetchAgents();

      // undefined creates invalid JSON, triggers catch block and returns mock data
      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle large agent datasets', async () => {
      const largeAgentList: Agent[] = Array.from({ length: 100 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        category: `Category ${i % 5}`,
        description: `Description for agent ${i}`,
      }));

      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(largeAgentList)]]));

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data.length).toBe(100);
      expect(result.data[0].id).toBe('agent-0');
      expect(result.data[99].id).toBe('agent-99');
    });
  });

  describe('fetchRoutingDecisions', () => {
    it('should return routing decisions from API with isMock: false', async () => {
      const mockRoutingDecisions: RoutingDecision[] = [
        {
          fromAgent: 'agent-1',
          toAgent: 'agent-2',
          confidence: 0.95,
          reason: 'High confidence routing',
        },
        { toAgent: 'agent-3', confidence: 0.8, reason: 'Initial routing' },
      ];

      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(mockRoutingDecisions)]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockRoutingDecisions);
      expect(result.data.length).toBe(2);
    });

    it('should return empty array when API returns non-array data', async () => {
      setupFetchMock(
        new Map([['/api/agents/routing', createMockResponse({ routing: 'invalid' })]])
      );

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should return mock data when API fails with error status', async () => {
      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(null, { status: 404 })]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return mock data when fetch throws network error', async () => {
      setupFetchMock(new Map([['/api/agents/routing', new Error('Connection refused')]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return empty array when API returns empty array', async () => {
      setupFetchMock(new Map([['/api/agents/routing', createMockResponse([])]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle routing decisions with minimal properties', async () => {
      const minimalRoutingDecisions: RoutingDecision[] = [
        { toAgent: 'agent-1' },
        { toAgent: 'agent-2' },
      ];

      setupFetchMock(
        new Map([['/api/agents/routing', createMockResponse(minimalRoutingDecisions)]])
      );

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(minimalRoutingDecisions);
      expect(result.data[0].fromAgent).toBeUndefined();
      expect(result.data[0].confidence).toBeUndefined();
      expect(result.data[0].reason).toBeUndefined();
    });

    it('should handle routing decision without fromAgent', async () => {
      const routingDecisions: RoutingDecision[] = [
        { toAgent: 'agent-1', confidence: 0.9, reason: 'Direct routing' },
      ];

      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(routingDecisions)]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data[0].fromAgent).toBeUndefined();
      expect(result.data[0].toAgent).toBe('agent-1');
    });

    it('should handle null response from API', async () => {
      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(null)]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle undefined response from API as parse error', async () => {
      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(undefined)]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      // undefined creates invalid JSON, triggers catch block and returns mock data
      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle large routing decision datasets', async () => {
      const largeRoutingList: RoutingDecision[] = Array.from({ length: 100 }, (_, i) => ({
        fromAgent: `agent-${i}`,
        toAgent: `agent-${i + 1}`,
        confidence: Math.random(),
        reason: `Routing decision ${i}`,
      }));

      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(largeRoutingList)]]));

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data.length).toBe(100);
    });
  });

  describe('fetchAll', () => {
    it('should combine agents and routing decisions with both from API', async () => {
      const mockAgents: Agent[] = [
        { id: 'agent-1', name: 'Agent One', category: 'Category A' },
        { id: 'agent-2', name: 'Agent Two', category: 'Category B' },
      ];

      const mockRoutingDecisions: RoutingDecision[] = [
        { fromAgent: 'agent-1', toAgent: 'agent-2', confidence: 0.95 },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
          ['/api/agents/routing', createMockResponse(mockRoutingDecisions)],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.agents).toEqual(mockAgents);
      expect(result.routingDecisions).toEqual(mockRoutingDecisions);
      expect(result.isMock).toBe(false);
    });

    it('should set isMock to true if agents API fails', async () => {
      const mockRoutingDecisions: RoutingDecision[] = [{ toAgent: 'agent-1', confidence: 0.9 }];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(null, { status: 500 })],
          ['/api/agents/routing', createMockResponse(mockRoutingDecisions)],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.routingDecisions).toEqual(mockRoutingDecisions);
    });

    it('should set isMock to true if routing API fails', async () => {
      const mockAgents: Agent[] = [{ id: 'agent-1', name: 'Agent One' }];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
          ['/api/agents/routing', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
      expect(result.agents).toEqual(mockAgents);
      expect(result.routingDecisions).toEqual([]);
    });

    it('should set isMock to true if both APIs fail', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(null, { status: 500 })],
          ['/api/agents/routing', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.routingDecisions).toEqual([]);
    });

    it('should handle empty responses from both APIs', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse([])],
          ['/api/agents/routing', createMockResponse([])],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(false);
      expect(result.agents).toEqual([]);
      expect(result.routingDecisions).toEqual([]);
    });

    it('should fetch agents and routing decisions in parallel', async () => {
      const mockAgents: Agent[] = [{ id: 'agent-1', name: 'Agent One' }];

      const mockRoutingDecisions: RoutingDecision[] = [{ toAgent: 'agent-1' }];

      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (url.includes('/api/agents/agents')) {
          return createMockResponse(mockAgents);
        }
        if (url.includes('/api/agents/routing')) {
          return createMockResponse(mockRoutingDecisions);
        }
        return createMockResponse(null, { status: 404 });
      });

      global.fetch = fetchSpy as typeof fetch;

      const result = await agentNetworkSource.fetchAll();

      // Verify both endpoints were called
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.agents).toEqual(mockAgents);
      expect(result.routingDecisions).toEqual(mockRoutingDecisions);
    });

    it('should handle network errors in both API calls', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/agents', new Error('Network error')],
          ['/api/agents/routing', new Error('Network error')],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.routingDecisions).toEqual([]);
    });

    it('should combine data correctly when agents succeed and routing fails', async () => {
      const mockAgents: Agent[] = [
        { id: 'agent-1', name: 'Agent One', category: 'Testing' },
        { id: 'agent-2', name: 'Agent Two', category: 'Development' },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
          ['/api/agents/routing', new Error('Routing service down')],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
      expect(result.agents).toEqual(mockAgents);
      expect(result.routingDecisions).toEqual([]);
    });

    it('should combine data correctly when routing succeeds and agents fail', async () => {
      const mockRoutingDecisions: RoutingDecision[] = [
        { fromAgent: 'agent-1', toAgent: 'agent-2', confidence: 0.88 },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', new Error('Agent service down')],
          ['/api/agents/routing', createMockResponse(mockRoutingDecisions)],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.routingDecisions).toEqual(mockRoutingDecisions);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete success scenario', async () => {
      const mockAgents: Agent[] = [
        {
          id: 'polymorphic-agent',
          name: 'Polymorphic Agent',
          category: 'Code Generation',
          description: 'Generates code',
        },
        { id: 'test-agent', name: 'Test Agent', category: 'Testing', description: 'Creates tests' },
      ];

      const mockRoutingDecisions: RoutingDecision[] = [
        {
          fromAgent: 'polymorphic-agent',
          toAgent: 'test-agent',
          confidence: 0.95,
          reason: 'Code generation completed',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
          ['/api/agents/routing', createMockResponse(mockRoutingDecisions)],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(false);
      expect(result.agents).toHaveLength(2);
      expect(result.routingDecisions).toHaveLength(1);
      expect(result.agents[0].id).toBe('polymorphic-agent');
      expect(result.routingDecisions[0].fromAgent).toBe('polymorphic-agent');
    });

    it('should handle complete failure scenario', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(null, { status: 503 })],
          ['/api/agents/routing', createMockResponse(null, { status: 503 })],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
      expect(result.agents).toBeDefined();
      expect(result.routingDecisions).toBeDefined();
      expect(result.agents.length).toBeGreaterThan(0);
    });
  });
});
