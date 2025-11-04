import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentNetworkSource } from '../agent-network-source';
import type { Agent, RoutingDecision } from '../agent-network-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('AgentNetworkSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchAgents', () => {
    it('should return real agents from API', async () => {
      const mockAgents: Agent[] = [
        {
          id: 'agent-1',
          name: 'agent-1',
          category: 'development',
          description: 'Test agent',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
        ])
      );

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockAgents);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/registry', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentNetworkSource.fetchAgents();

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  describe('fetchRoutingDecisions', () => {
    it('should return routing decisions from API', async () => {
      const mockDecisions: RoutingDecision[] = [
        {
          toAgent: 'agent-1',
          confidence: 0.92,
          reason: 'test request',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/routing', createMockResponse(mockDecisions)],
        ])
      );

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockDecisions);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/routing', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentNetworkSource.fetchRoutingDecisions();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]); // Returns empty array when API fails
    });
  });

  describe('fetchAll', () => {
    it('should combine agents and routing decisions', async () => {
      const mockAgents: Agent[] = [
        {
          id: 'agent-1',
          name: 'agent-1',
          category: 'development',
          description: 'Test',
        },
      ];
      const mockDecisions: RoutingDecision[] = [
        {
          toAgent: 'agent-1',
          confidence: 0.92,
          reason: 'test',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
          ['/api/agents/routing', createMockResponse(mockDecisions)],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.agents).toEqual(mockAgents);
      expect(result.routingDecisions).toEqual(mockDecisions);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any source fails', async () => {
      const mockAgents: Agent[] = [];

      setupFetchMock(
        new Map([
          ['/api/agents/registry', createMockResponse(mockAgents)],
          ['/api/intelligence/routing/decisions', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentNetworkSource.fetchAll();

      expect(result.isMock).toBe(true);
    });
  });
});

