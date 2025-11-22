import { describe, it, expect, beforeEach, vi } from 'vitest';
import { platformHealthSource } from '../platform-health-source';
import type { PlatformHealth, PlatformServices } from '../platform-health-source';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../tests/utils/mock-fetch';

describe('PlatformHealthSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchHealth', () => {
    it('should return health data from API with correct time range', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [
          { service: 'PostgreSQL', status: 'up', latencyMs: 15 },
          { service: 'OmniArchon', status: 'up', latencyMs: 25 },
          { service: 'Qdrant', status: 'up', latencyMs: 10 },
        ],
        summary: {
          total: 3,
          up: 3,
          down: 0,
          warning: 0,
        },
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health?timeWindow=24h', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockHealth);
      expect(result.data.overallStatus).toBe('healthy');
      expect(result.data.timestamp).toBeDefined();
      expect(result.data.services.length).toBe(3);
    });

    it('should handle health data without latency values', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'unhealthy',
        services: [
          { service: 'PostgreSQL', status: 'up' },
          { service: 'OmniArchon', status: 'down' },
        ],
        summary: {
          total: 2,
          up: 1,
          down: 1,
          warning: 0,
        },
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health?timeWindow=7d', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('7d');

      expect(result.isMock).toBe(false);
      expect(result.data.overallStatus).toBe('unhealthy');
      expect(result.data.services.every((s) => s.latencyMs === undefined)).toBe(true);
    });

    it('should return mock data when API returns 500 error', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/services/health', createMockResponse(null, { status: 500 })]])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // Mock data should match PlatformHealth interface
      expect(result.data).toHaveProperty('overallStatus');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('services');
      expect(result.data.overallStatus).toMatch(/^(healthy|unhealthy|error)$/);
      expect(result.data.services.length).toBeGreaterThan(0);
      expect(result.data.services.length).toBeLessThanOrEqual(12);
      expect(result.data.services[0]).toHaveProperty('service');
      expect(result.data.services[0]).toHaveProperty('status');
    });

    it('should return mock data when API returns 404 error', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/services/health', createMockResponse(null, { status: 404 })]])
      );

      const result = await platformHealthSource.fetchHealth('1h');

      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.services.length).toBeGreaterThan(0);
    });

    it('should return mock data when fetch throws network error', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/services/health', new Error('Network failure')]])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // Mock data should match PlatformHealth interface
      expect(result.data).toHaveProperty('overallStatus');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('services');
      expect(result.data.overallStatus).toBeDefined();
      expect(result.data.services).toBeDefined();
    });

    it('should handle different time range parameters', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [{ service: 'API', status: 'up' }],
        summary: {
          total: 1,
          up: 1,
          down: 0,
          warning: 0,
        },
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health?timeWindow=30d', createMockResponse(mockHealth)],
        ])
      );

      const result = await platformHealthSource.fetchHealth('30d');

      expect(result.isMock).toBe(false);
      expect(result.data.timestamp).toBeDefined();
    });

    it('should include latency in service status', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [
          { service: 'PostgreSQL', status: 'up', latencyMs: 10 },
          { service: 'Redis', status: 'up', latencyMs: 5 },
        ],
        summary: {
          total: 2,
          up: 2,
          down: 0,
          warning: 0,
        },
      };

      setupFetchMock(
        new Map([['/api/intelligence/services/health', createMockResponse(mockHealth)]])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.services[0].latencyMs).toBe(10);
      expect(result.data.services[1].latencyMs).toBe(5);
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
        new Map([['/api/intelligence/platform/services', createMockResponse(mockServices)]])
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
        new Map([['/api/intelligence/platform/services', createMockResponse(mockServices)]])
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
      expect(result.data.services.every((s) => s.status && s.health && s.name)).toBe(true);
    });

    it('should return mock data when fetch throws error', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/platform/services', new Error('Connection refused')]])
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
        new Map([['/api/intelligence/platform/services', createMockResponse(mockServices)]])
      );

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(false);
      expect(result.data.services.find((s) => s.name === 'Service B')?.status).toBe('degraded');
      expect(result.data.services.find((s) => s.name === 'Service C')?.status).toBe('unhealthy');
    });
  });

  describe('fetchAll', () => {
    it('should fetch and combine health and services data in parallel', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [
          { service: 'PostgreSQL', status: 'up', latencyMs: 15 },
          { service: 'OmniArchon', status: 'up', latencyMs: 25 },
        ],
        summary: {
          total: 2,
          up: 2,
          down: 0,
          warning: 0,
        },
      };

      const mockServices: PlatformServices = {
        services: [
          { name: 'API Gateway', status: 'healthy', health: 'up' },
          { name: 'Agent Service', status: 'healthy', health: 'up' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health?timeWindow=24h', createMockResponse(mockHealth)],
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
        services: [{ name: 'API Gateway', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health', createMockResponse(null, { status: 500 })],
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
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [{ service: 'PostgreSQL', status: 'up' }],
        summary: {
          total: 1,
          up: 1,
          down: 0,
          warning: 0,
        },
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health?timeWindow=7d', createMockResponse(mockHealth)],
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
          ['/api/intelligence/services/health', createMockResponse(null, { status: 500 })],
          ['/api/intelligence/platform/services', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformHealthSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
      expect(result.health).toBeDefined();
      expect(result.services).toBeDefined();
      // Mock structure should match PlatformHealth interface
      expect(result.health).toHaveProperty('overallStatus');
      expect(result.health).toHaveProperty('timestamp');
      expect(result.health).toHaveProperty('services');
      expect(result.health.overallStatus).toMatch(/^(healthy|unhealthy|error)$/);
      expect(result.services.services.length).toBeGreaterThan(0);
    });

    it('should handle different time ranges for health endpoint', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [{ service: 'Test', status: 'up' }],
        summary: {
          total: 1,
          up: 1,
          down: 0,
          warning: 0,
        },
      };

      const mockServices: PlatformServices = {
        services: [{ name: 'Test Service', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health?timeWindow=1h', createMockResponse(mockHealth)],
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchAll('1h');

      expect(result.isMock).toBe(false);
      expect(result.health.timestamp).toBeDefined();
    });

    it('should fetch both requests in parallel (not sequential)', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [{ service: 'DB', status: 'up' }],
        summary: {
          total: 1,
          up: 1,
          down: 0,
          warning: 0,
        },
      };

      const mockServices: PlatformServices = {
        services: [{ name: 'API', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health', createMockResponse(mockHealth)],
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
      expect(calls.some((call) => call[0].includes('/api/intelligence/services/health'))).toBe(
        true
      );
      expect(calls.some((call) => call[0].includes('/api/intelligence/platform/services'))).toBe(
        true
      );
    });

    it('should correctly propagate isMock false when both APIs succeed', async () => {
      const mockHealth: PlatformHealth = {
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [{ service: 'DB', status: 'up' }],
        summary: {
          total: 1,
          up: 1,
          down: 0,
          warning: 0,
        },
      };

      const mockServices: PlatformServices = {
        services: [{ name: 'API', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/services/health', createMockResponse(mockHealth)],
          ['/api/intelligence/platform/services', createMockResponse(mockServices)],
        ])
      );

      const result = await platformHealthSource.fetchAll('24h');

      expect(result.isMock).toBe(false);
      expect(result.health.timestamp).toBeDefined();
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
      setupFetchMock(new Map([['/api/intelligence/services/health', new Error('Timeout')]]));

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // Mock data should match PlatformHealth interface
      expect(result.data).toHaveProperty('overallStatus');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('services');
      expect(result.data.overallStatus).toMatch(/^(healthy|unhealthy|error)$/);
    });

    it('should handle network timeout for services endpoint', async () => {
      setupFetchMock(new Map([['/api/intelligence/platform/services', new Error('Timeout')]]));

      const result = await platformHealthSource.fetchServices();

      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should fall back to mock data when API returns null', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await platformHealthSource.fetchHealth('24h');

      // When API returns null, Zod validation fails, falls back to mock data
      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('overallStatus');
      expect(result.data).toHaveProperty('services');
    });

    it('should fall back to mock data when API returns null for services', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await platformHealthSource.fetchServices();

      // When API returns null, Zod validation fails, falls back to mock data
      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('services');
    });

    it('should handle response with status code 503', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/services/health', createMockResponse(null, { status: 503 })]])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.isMock).toBe(true);
      // Mock data should match PlatformHealth interface
      expect(result.data).toHaveProperty('overallStatus');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('services');
      expect(result.data.overallStatus).toBeDefined();
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
        timestamp: '2024-01-15T10:30:00Z',
        overallStatus: 'healthy',
        services: [{ service: 'Test Service', status: 'up', latencyMs: 20 }],
        summary: {
          total: 1,
          up: 1,
          down: 0,
          warning: 0,
        },
      };

      setupFetchMock(
        new Map([['/api/intelligence/services/health', createMockResponse(mockHealth)]])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      expect(result.data).toHaveProperty('overallStatus');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('services');
      expect(Array.isArray(result.data.services)).toBe(true);
      expect(result.data.services[0]).toHaveProperty('service');
      expect(result.data.services[0]).toHaveProperty('status');
    });

    it('should return valid PlatformServices structure from API', async () => {
      const mockServices: PlatformServices = {
        services: [{ name: 'Test Service', status: 'healthy', health: 'up' }],
      };

      setupFetchMock(
        new Map([['/api/intelligence/platform/services', createMockResponse(mockServices)]])
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
        new Map([['/api/intelligence/services/health', createMockResponse(null, { status: 500 })]])
      );

      const result = await platformHealthSource.fetchHealth('24h');

      // Mock data should match PlatformHealth interface
      expect(result.data).toHaveProperty('overallStatus');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('services');
      expect(typeof result.data.overallStatus).toBe('string');
      expect(typeof result.data.timestamp).toBe('string');
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
