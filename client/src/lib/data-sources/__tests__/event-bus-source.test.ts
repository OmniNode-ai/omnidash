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
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/event-bus/events')
      );
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
        events_by_type: { 'type1': 50, 'type2': 50 },
        events_by_tenant: { 'tenant1': 100 },
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

    it('should return stopped status on error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await eventBusSource.getStatus();

      expect(result.active).toBe(false);
      expect(result.connected).toBe(false);
      expect(result.status).toBe('stopped');
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
});

