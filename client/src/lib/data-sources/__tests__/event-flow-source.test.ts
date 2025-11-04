import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eventFlowSource } from '../event-flow-source';
import type { Event, EventMetrics, EventChartData } from '../event-flow-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('EventFlowSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchEvents', () => {
    it('should return real events from API', async () => {
      const mockEvents: Event[] = [
        {
          id: 'event-1',
          timestamp: '2024-01-01T00:00:00Z',
          type: 'throughput',
          source: 'api',
          data: { count: 100 },
        },
        {
          id: 'event-2',
          timestamp: '2024-01-01T00:01:00Z',
          type: 'pattern-injection',
          source: 'intelligence',
          data: { patternId: 'pattern-1' },
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/events/stream', createMockResponse(mockEvents)],
        ])
      );

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.isMock).toBe(false);
      expect(result.events).toEqual(mockEvents);
      expect(result.metrics.totalEvents).toBe(2);
      expect(result.metrics.uniqueTypes).toBe(2);
    });

    it('should calculate metrics correctly', async () => {
      const mockEvents: Event[] = [
        {
          id: 'event-1',
          timestamp: new Date().toISOString(),
          type: 'throughput',
          source: 'api',
          data: { durationMs: 100 },
        },
        {
          id: 'event-2',
          timestamp: new Date(Date.now() - 30000).toISOString(),
          type: 'throughput',
          source: 'api',
          data: { durationMs: 200 },
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/events/stream', createMockResponse(mockEvents)],
        ])
      );

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.metrics.totalEvents).toBe(2);
      expect(result.metrics.uniqueTypes).toBe(1);
      expect(result.metrics.eventsPerMinute).toBe(2); // Both within last minute
      expect(result.metrics.avgProcessingTime).toBe(150); // (100 + 200) / 2
    });

    it('should generate chart data correctly', async () => {
      const now = Date.now();
      const mockEvents: Event[] = [
        {
          id: 'event-1',
          timestamp: new Date(now - 60000).toISOString(),
          type: 'throughput',
          source: 'api',
          data: {},
        },
        {
          id: 'event-2',
          timestamp: new Date(now).toISOString(),
          type: 'throughput',
          source: 'api',
          data: {},
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/events/stream', createMockResponse(mockEvents)],
        ])
      );

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.chartData.throughput.length).toBeGreaterThan(0);
      expect(result.chartData.lag.length).toBe(2); // Last 2 events
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/events/stream', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.isMock).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.metrics.totalEvents).toBeGreaterThan(0);
    });
  });

  describe('calculateMetrics', () => {
    it('should handle empty events array', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/events/stream', createMockResponse([])],
        ])
      );

      const result = await eventFlowSource.fetchEvents(100);

      expect(result.metrics.totalEvents).toBe(0);
      expect(result.metrics.uniqueTypes).toBe(0);
      expect(result.metrics.eventsPerMinute).toBe(0);
    });
  });
});



