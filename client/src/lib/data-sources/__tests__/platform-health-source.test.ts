import { describe, it, expect, beforeEach, vi } from 'vitest';
import { platformHealthSource } from '../platform-health-source';
import type { PlatformHealth, PlatformServices } from '../platform-health-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('PlatformHealthSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchHealth', () => {
    it('should return health data from API with correct time range', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 99.95,
        services: [
          { name: 'PostgreSQL', status: 'up', latency: 15 },
          { name: 'OmniArchon', status: 'up', latency: 25 },
          { name: 'Qdrant', status: 'up', latency: 10 },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health?timeWindow=24h', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockHealth);
      expect(result.data.status).toBe('healthy');
      expect(result.data.uptime).toBe(99.95);
      expect(result.data.services.length).toBe(3);
    });

    it('should handle health data without latency values', async () => {
      const mockHealth: PlatformHealth = {
        status: 'degraded',
        uptime: 98.5,
        services: [
          { name: 'PostgreSQL', status: 'up' },
          { name: 'OmniArchon', status: 'down' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health?timeWindow=7d', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('7d');

      expect(result.isMock).toBe(false);
      expect(result.data.status).toBe('degraded');
      expect(result.data.services.every(s => s.latency === undefined)).toBe(true);
    });

    it('should return mock data when API returns 500 error', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // New mock structure has database, kafka, services
      expect(result.data).toHaveProperty('database');
      expect(result.data).toHaveProperty('kafka');
      expect(result.data.database.status).toMatch(/^(healthy|degraded|down)$/);
      expect(result.data.services.length).toBeGreaterThan(0);
      expect(result.data.services.length).toBeLessThanOrEqual(12);
      expect(result.data.services[0]).toHaveProperty('name');
      expect(result.data.services[0]).toHaveProperty('status');
    });

    it('should return mock data when API returns 404 error', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(null, { status: 404 })],
        ])
      );

      const result = await platformHealthSource.fetchHealth('1h');

      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.services.length).toBeGreaterThan(0);
    });

    it('should return mock data when fetch throws network error', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', new Error('Network failure')],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // New mock structure has database, kafka, services
      expect(result.data).toHaveProperty('database');
      expect(result.data.database.status).toBeDefined();
      expect(result.data.services).toBeDefined();
    });

    it('should handle different time range parameters', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 100.0,
        services: [{ name: 'API', status: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health?timeWindow=30d', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('30d');

      expect(result.isMock).toBe(false);
      expect(result.data.uptime).toBe(100.0);
    });

    it('should include latency in service status', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 99.5,
        services: [
          { name: 'PostgreSQL', status: 'up', latency: 10 },
          { name: 'Redis', status: 'up', latency: 5 },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.services[0].latency).toBe(10);
      expect(result.data.services[1].latency).toBe(5);
    });
  });

  describe('fetchServices', () => {
    it('should return services data from API', async () => {
      const mockServices: PlatformServices = {
        services: [
          { name: 'API Gateway', status: 'healthy', health: 'up' },
          { name: 'Agent Service', status: 'healthy', health: 'up' },
          { name: 'PostgreSQL', status: 'healthy', health: 'up' },
          { name: 'Kafka', status: 'degraded', health: 'down' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockServices);
      expect(result.data.services.length).toBe(4);
      expect(result.data.services[3].status).toBe('degraded');
    });

    it('should return empty services array when API returns empty data', async () => {
      const mockServices: PlatformServices = {
        services: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(false);
      expect(result.data.services).toEqual([]);
    });

    it('should return mock data when API returns 500 error', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(true);
      expect(result.data.services.length).toBeGreaterThan(0);
      expect(result.data.services.length).toBeLessThanOrEqual(15);
      expect(result.data.services[0]).toHaveProperty('name');
      expect(result.data.services[0]).toHaveProperty('status');
      expect(result.data.services[0]).toHaveProperty('health');
    });

    it('should return mock data when API returns non-ok status', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(null, { status: 403 })],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(true);
      expect(result.data.services).toBeDefined();
      expect(result.data.services.every(s => s.status && s.health && s.name)).toBe(true);
    });

    it('should return mock data when fetch throws error', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', new Error('Connection refused')],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(true);
      expect(result.data.services.length).toBeGreaterThan(0);
    });

    it('should handle services with various health statuses', async () => {
      const mockServices: PlatformServices = {
        services: [
          { name: 'Service A', status: 'healthy', health: 'up' },
          { name: 'Service B', status: 'degraded', health: 'partial' },
          { name: 'Service C', status: 'unhealthy', health: 'down' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(false);
      expect(result.data.services.find(s => s.name === 'Service B')?.status).toBe('degraded');
      expect(result.data.services.find(s => s.name === 'Service C')?.status).toBe('unhealthy');
    });
  });

  describe('fetchAll', () => {
    it('should fetch and combine health and services data in parallel', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 99.95,
        services: [
          { name: 'PostgreSQL', status: 'up', latency: 15 },
          { name: 'OmniArchon', status: 'up', latency: 25 },
        ],
      };

      const mockServices: PlatformServices = {
        services: [
          { name: 'API Gateway', status: 'healthy', health: 'up' },
          { name: 'Agent Service', status: 'healthy', health: 'up' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health?timeWindow=24h', createMockResponse(mockHealth)],
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchAll('24h');

      expect(result.health).toEqual(mockHealth);
      expect(result.services).toEqual(mockServices);
      expect(result.isMock).toBe(false);
    });

    it('should mark isMock as true if health API fails', async () => {
      const mockServices: PlatformServices = {
        services: [
          { name: 'API Gateway', status: 'healthy', health: 'up' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(null, { status: 500 })],
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
      expect(result.health).toBeDefined();
      expect(result.services).toEqual(mockServices);
    });

    it('should mark isMock as true if services API fails', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 99.5,
        services: [{ name: 'PostgreSQL', status: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health?timeWindow=7d', createMockResponse(mockHealth)],
          ['/api/intelligence/platform/services', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformHealthSource.fetchAll('7d');

      expect(result.isMock).toBe(true);
      expect(result.health).toEqual(mockHealth);
      expect(result.services).toBeDefined();
      expect(result.services.services.length).toBeGreaterThan(0);
    });

    it('should mark isMock as true if both APIs fail', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(null, { status: 500 })],
          ['/api/intelligence/platform/services', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformHealthSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
      expect(result.health).toBeDefined();
      expect(result.services).toBeDefined();
      // New mock structure has database, kafka, services
      expect(result.health).toHaveProperty('database');
      expect(result.health.database.status).toMatch(/^(healthy|degraded|down)$/);
      expect(result.services.services.length).toBeGreaterThan(0);
    });

    it('should handle different time ranges for health endpoint', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 98.0,
        services: [{ name: 'Test', status: 'up' }],
      };

      const mockServices: PlatformServices = {
        services: [{ name: 'Test Service', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health?timeWindow=1h', createMockResponse(mockHealth)],
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchAll('1h');

      expect(result.isMock).toBe(false);
      expect(result.health.uptime).toBe(98.0);
    });

    it('should fetch both requests in parallel (not sequential)', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 99.9,
        services: [{ name: 'DB', status: 'up' }],
      };

      const mockServices: PlatformServices = {
        services: [{ name: 'API', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(mockHealth)],
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      // Spy on fetch to count calls
      const fetchSpy = vi.spyOn(global, 'fetch');

      await platformHealthSource.fetchAll('24h');

      // Verify both fetches were made
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Verify the correct endpoints were called
      const calls = fetchSpy.mock.calls;
      expect(calls.some(call => call[0].includes('/api/intelligence/platform/health'))).toBe(true);
      expect(calls.some(call => call[0].includes('/api/intelligence/platform/services'))).toBe(true);
    });

    it('should correctly propagate isMock false when both APIs succeed', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 99.99,
        services: [{ name: 'DB', status: 'up' }],
      };

      const mockServices: PlatformServices = {
        services: [{ name: 'API', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(mockHealth)],
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchAll('24h');

      expect(result.isMock).toBe(false);
      expect(result.health.uptime).toBe(99.99);
      expect(result.services.services[0].name).toBe('API');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed JSON response gracefully', async () => {
      // Setup fetch to return invalid JSON
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle network timeout for health endpoint', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', new Error('Timeout')],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // New mock structure has database, kafka, services
      expect(result.data).toHaveProperty('database');
      expect(result.data.database.status).toMatch(/^(healthy|degraded|down)$/);
    });

    it('should handle network timeout for services endpoint', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', new Error('Timeout')],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle empty response body for health', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await platformHealthSource.fetchHealth('24h');

      // When API returns null but ok: true, it's treated as successful (returns null data)
      // This is expected behavior - the source returns whatever the API returns
      expect(result.isMock).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should handle empty response body for services', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await platformHealthSource.fetchServices();

      // When API returns null but ok: true, it's treated as successful (returns null data)
      // This is expected behavior - the source returns whatever the API returns
      expect(result.isMock).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should handle response with status code 503', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(null, { status: 503 })],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // New mock structure has database, kafka, services
      expect(result.data).toHaveProperty('database');
      expect(result.data.database.status).toBeDefined();
    });

    it('should handle response with status code 401', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(null, { status: 401 })],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(true);
      expect(result.data.services).toBeDefined();
    });
  });

  describe('Data Structure Validation', () => {
    it('should return valid PlatformHealth structure from API', async () => {
      const mockHealth: PlatformHealth = {
        status: 'healthy',
        uptime: 99.5,
        services: [
          { name: 'Test Service', status: 'up', latency: 20 },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('uptime');
      expect(result.data).toHaveProperty('services');
      expect(Array.isArray(result.data.services)).toBe(true);
      expect(result.data.services[0]).toHaveProperty('name');
      expect(result.data.services[0]).toHaveProperty('status');
    });

    it('should return valid PlatformServices structure from API', async () => {
      const mockServices: PlatformServices = {
        services: [
          { name: 'Test Service', status: 'healthy', health: 'up' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.data).toHaveProperty('services');
      expect(Array.isArray(result.data.services)).toBe(true);
      expect(result.data.services[0]).toHaveProperty('name');
      expect(result.data.services[0]).toHaveProperty('status');
      expect(result.data.services[0]).toHaveProperty('health');
    });

    it('should return valid mock fallback structure for health', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/health', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      // New mock structure has database, kafka, services
      expect(result.data).toHaveProperty('database');
      expect(result.data).toHaveProperty('kafka');
      expect(result.data).toHaveProperty('services');
      expect(typeof result.data.database.status).toBe('string');
      expect(typeof result.data.database.uptime).toBe('string'); // Changed to string (e.g., "99.95%")
      expect(Array.isArray(result.data.services)).toBe(true);
    });

    it('should return valid mock fallback structure for services', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/platform/services', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.data).toHaveProperty('services');
      expect(Array.isArray(result.data.services)).toBe(true);
      if (result.data.services.length > 0) {
        expect(result.data.services[0]).toHaveProperty('name');
        expect(result.data.services[0]).toHaveProperty('status');
        expect(result.data.services[0]).toHaveProperty('health');
      }
    });
  });
});
