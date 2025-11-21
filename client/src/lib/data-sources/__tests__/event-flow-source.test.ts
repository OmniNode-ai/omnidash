import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eventFlowSource } from '../event-flow-source';
import {
  createMockResponse,
  createMockFetchError,
  setupFetchMock,
  resetFetchMock,
} from '../../../tests/utils/mock-fetch';

// Mock the USE_MOCK_DATA flag to false so we can test real API paths
vi.mock('../../mock-data/config', () => ({
  USE_MOCK_DATA: false,
}));

describe('EventFlowSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchEvents', () => {
    it('should return real data when API succeeds', async () => {
      const mockEvents = [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          type: 'throughput',
          source: 'api',
          data: { count: 100 },
        },
        {
          id: '2',
          timestamp: new Date().toISOString(),
          type: 'pattern-injection',
          source: 'intelligence',
          data: { patternId: 'test-pattern' },
        },
      ];

      setupFetchMock(new Map([['/api/intelligence/events', createMockResponse(mockEvents)]]));

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.isMock).toBe(false);
      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.chartData).toBeDefined();
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(new Map([['/api/intelligence/events', createMockFetchError()]]));

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.isMock).toBe(true);
      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
    });

    it('should calculate metrics correctly', async () => {
      const mockEvents = [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          type: 'throughput',
          source: 'api',
          data: { durationMs: 100 },
        },
        {
          id: '2',
          timestamp: new Date().toISOString(),
          type: 'throughput',
          source: 'api',
          data: { durationMs: 200 },
        },
      ];

      setupFetchMock(new Map([['/api/intelligence/events', createMockResponse(mockEvents)]]));

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.metrics.totalEvents).toBe(2);
      expect(result.metrics.uniqueTypes).toBe(1);
    });

    it('should generate chart data correctly', async () => {
      const now = Date.now();
      const mockEvents = [
        {
          id: '1',
          timestamp: new Date(now).toISOString(),
          type: 'throughput',
          source: 'api',
          data: { count: 100 },
        },
        {
          id: '2',
          timestamp: new Date(now - 30000).toISOString(),
          type: 'throughput',
          source: 'api',
          data: { count: 120 },
        },
      ];

      setupFetchMock(new Map([['/api/intelligence/events', createMockResponse(mockEvents)]]));

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.chartData).toBeDefined();
      expect(result.chartData.throughput).toBeDefined();
      expect(Array.isArray(result.chartData.throughput)).toBe(true);
      expect(result.chartData.lag).toBeDefined();
      expect(Array.isArray(result.chartData.lag)).toBe(true);
    });

    it('should handle empty events array', async () => {
      setupFetchMock(new Map([['/api/intelligence/events', createMockResponse([])]]));

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.isMock).toBe(false);
      expect(result.events).toEqual([]);
      expect(result.metrics.totalEvents).toBe(0);
    });
  });
});
