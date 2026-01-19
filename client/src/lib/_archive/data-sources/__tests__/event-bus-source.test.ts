/**
 * Tests for Event Bus Data Source
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBusSource } from '../event-bus-source';

// Mock fetch
global.fetch = vi.fn();

describe('EventBusSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryEvents', () => {
    it('should fetch events with filters', async () => {
      const mockEvents = [
        {
          event_type: 'omninode.intelligence.query.requested.v1',
          event_id: 'evt-1',
          timestamp: new Date().toISOString(),
          tenant_id: 'default-tenant',
          namespace: 'development',
          source: 'omniarchon',
          correlation_id: 'corr-123',
          schema_ref: 'registry://omninode/intelligence/query_requested/v1',
          payload: { query: 'test' },
          topic: 'default-tenant.omninode.intelligence.v1',
          partition: 0,
          offset: '100',
          processed_at: new Date().toISOString(),
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: mockEvents,
          count: 1,
          options: {},
        }),
      } as Response);

      const result = await eventBusSource.queryEvents({
        event_types: ['omninode.intelligence.query.requested.v1'],
        limit: 100,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].event_type).toBe('omninode.intelligence.query.requested.v1');
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/event-bus/events'));
    });

    it('should return mock data on error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await eventBusSource.queryEvents();

      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events[0]).toHaveProperty('event_type');
    });

    it('should handle empty response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [],
          count: 0,
          options: {},
        }),
      } as Response);

      const result = await eventBusSource.queryEvents();

      expect(result.events).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('getStatistics', () => {
    it('should fetch statistics', async () => {
      const mockStats = {
        total_events: 100,
        events_by_type: { type1: 50, type2: 50 },
        events_by_tenant: { tenant1: 100 },
        events_per_minute: 10,
        oldest_event: new Date().toISOString(),
        newest_event: new Date().toISOString(),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      } as Response);

      const result = await eventBusSource.getStatistics();

      expect(result.total_events).toBe(100);
      expect(result.events_by_type).toHaveProperty('type1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/event-bus/statistics')
      );
    });

    it('should return mock statistics on error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await eventBusSource.getStatistics();

      expect(result.total_events).toBeGreaterThan(0);
      expect(result.events_by_type).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should fetch status', async () => {
      const mockStatus = {
        active: true,
        connected: true,
        status: 'running',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus,
      } as Response);

      const result = await eventBusSource.getStatus();

      expect(result.active).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.status).toBe('running');
    });

    it('should return unknown status on error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await eventBusSource.getStatus();

      expect(result.active).toBe(false);
      expect(result.connected).toBe(false);
      expect(result.status).toBe('unknown');
    });
  });

  describe('getEventChain', () => {
    it('should fetch event chain by correlation ID', async () => {
      const mockEvents = [
        {
          event_type: 'omninode.intelligence.query.requested.v1',
          event_id: 'evt-1',
          timestamp: new Date().toISOString(),
          tenant_id: 'default-tenant',
          namespace: 'development',
          source: 'omniarchon',
          correlation_id: 'corr-123',
          schema_ref: 'registry://omninode/intelligence/query_requested/v1',
          payload: {},
          topic: 'default-tenant.omninode.intelligence.v1',
          partition: 0,
          offset: '100',
          processed_at: new Date().toISOString(),
        },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: mockEvents,
          count: 1,
          options: { correlation_id: 'corr-123' },
        }),
      } as Response);

      const result = await eventBusSource.getEventChain('corr-123');

      expect(result).toHaveLength(1);
      expect(result[0].correlation_id).toBe('corr-123');
    });
  });

  describe('Mock Data Filtering', () => {
    beforeEach(() => {
      // Force fetch to fail so we test mock data path
      vi.mocked(global.fetch).mockRejectedValue(new Error('Force mock data'));
    });

    it('should filter by time range (start_time)', async () => {
      // Mock events have timestamps: -60s, -50s, -40s from base (2024-01-15T10:00:00Z)
      // Start time before first event to ensure we get results
      const startTime = new Date('2024-01-15T09:58:30Z'); // -90s from base, before all events

      const result = await eventBusSource.queryEvents({
        start_time: startTime,
      });

      // Should get all events since they're all after start_time
      expect(result.events.length).toBeGreaterThan(0);
      result.events.forEach((event) => {
        expect(new Date(event.timestamp).getTime()).toBeGreaterThanOrEqual(startTime.getTime());
      });
    });

    it('should filter by time range (end_time)', async () => {
      const endTime = new Date('2024-01-15T09:59:30Z'); // -30s from base

      const result = await eventBusSource.queryEvents({
        end_time: endTime,
      });

      // Should only get events before -30s (the -60s and -50s events)
      expect(result.events.length).toBeGreaterThan(0);
      result.events.forEach((event) => {
        expect(new Date(event.timestamp).getTime()).toBeLessThanOrEqual(endTime.getTime());
      });
    });

    it('should filter by time range (both start and end)', async () => {
      const startTime = new Date('2024-01-15T09:59:30Z'); // -30s from base
      const endTime = new Date('2024-01-15T09:59:55Z'); // -5s from base

      const result = await eventBusSource.queryEvents({
        start_time: startTime,
        end_time: endTime,
      });

      result.events.forEach((event) => {
        const eventTime = new Date(event.timestamp).getTime();
        expect(eventTime).toBeGreaterThanOrEqual(startTime.getTime());
        expect(eventTime).toBeLessThanOrEqual(endTime.getTime());
      });
    });

    it('should sort by timestamp ascending', async () => {
      const result = await eventBusSource.queryEvents({
        order_by: 'timestamp',
        order_direction: 'asc',
      });

      expect(result.events.length).toBeGreaterThan(1);

      // Verify ascending order
      for (let i = 1; i < result.events.length; i++) {
        const prevTime = new Date(result.events[i - 1].timestamp).getTime();
        const currTime = new Date(result.events[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });

    it('should sort by timestamp descending', async () => {
      const result = await eventBusSource.queryEvents({
        order_by: 'timestamp',
        order_direction: 'desc',
      });

      expect(result.events.length).toBeGreaterThan(1);

      // Verify descending order
      for (let i = 1; i < result.events.length; i++) {
        const prevTime = new Date(result.events[i - 1].timestamp).getTime();
        const currTime = new Date(result.events[i].timestamp).getTime();
        expect(currTime).toBeLessThanOrEqual(prevTime);
      }
    });

    it('should sort by processed_at', async () => {
      const result = await eventBusSource.queryEvents({
        order_by: 'processed_at',
        order_direction: 'asc',
      });

      expect(result.events.length).toBeGreaterThan(1);

      // Verify ascending order by processed_at
      for (let i = 1; i < result.events.length; i++) {
        const prevTime = new Date(result.events[i - 1].processed_at).getTime();
        const currTime = new Date(result.events[i].processed_at).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });

    it('should apply offset pagination', async () => {
      const allResults = await eventBusSource.queryEvents({});
      const offsetResults = await eventBusSource.queryEvents({
        offset: 1,
      });

      expect(offsetResults.events.length).toBe(allResults.events.length - 1);
      // First event in offset results should be second event in all results
      expect(offsetResults.events[0].event_id).toBe(allResults.events[1].event_id);
    });

    it('should apply limit pagination', async () => {
      const result = await eventBusSource.queryEvents({
        limit: 2,
      });

      expect(result.events.length).toBeLessThanOrEqual(2);
    });

    it('should apply both offset and limit', async () => {
      const allResults = await eventBusSource.queryEvents({});
      const paginatedResults = await eventBusSource.queryEvents({
        offset: 1,
        limit: 1,
      });

      expect(paginatedResults.events.length).toBe(1);
      // Should get the second event from all results
      expect(paginatedResults.events[0].event_id).toBe(allResults.events[1].event_id);
    });

    it('should return total count before pagination', async () => {
      const allResults = await eventBusSource.queryEvents({});
      const paginatedResults = await eventBusSource.queryEvents({
        limit: 1,
      });

      // Count should reflect total matching events, not just returned slice
      expect(paginatedResults.count).toBe(allResults.count);
      expect(paginatedResults.events.length).toBe(1);
    });

    it('should combine filters, sorting, and pagination', async () => {
      const result = await eventBusSource.queryEvents({
        tenant_id: 'default-tenant',
        order_by: 'timestamp',
        order_direction: 'desc',
        limit: 2,
        offset: 0,
      });

      // Verify tenant filter
      result.events.forEach((event) => {
        expect(event.tenant_id).toBe('default-tenant');
      });

      // Verify sorting
      if (result.events.length > 1) {
        const firstTime = new Date(result.events[0].timestamp).getTime();
        const secondTime = new Date(result.events[1].timestamp).getTime();
        expect(firstTime).toBeGreaterThanOrEqual(secondTime);
      }

      // Verify limit
      expect(result.events.length).toBeLessThanOrEqual(2);
    });
  });
});
