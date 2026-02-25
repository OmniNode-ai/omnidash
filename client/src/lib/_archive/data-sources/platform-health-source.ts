// Platform Health Data Source
import { USE_MOCK_DATA, PlatformHealthMockData } from '../mock-data';
import {
  platformHealthSchema,
  platformServicesSchema,
  safeParseResponse,
} from '../../schemas/api-response-schemas';

// Platform health response from /api/intelligence/services/health
// See server/intelligence-routes.ts line 3251 and server/service-health.ts
export interface PlatformHealth {
  timestamp: string;
  overallStatus: 'healthy' | 'unhealthy' | 'error';
  services: Array<{
    service: string; // Service name (e.g., "PostgreSQL", "Kafka/Redpanda", "OmniIntelligence")
    status: 'up' | 'down' | 'warning';
    latencyMs?: number;
    error?: string;
    details?: Record<string, any>;
  }>;
  summary?: {
    total: number;
    up: number;
    down: number;
    warning: number;
  };
  error?: string; // Present when overallStatus is 'error'
}

export interface PlatformServices {
  services: Array<{
    id?: string;
    name: string;
    status: string;
    health: string;
    serviceUrl?: string;
    serviceType?: string;
    lastHealthCheck?: string | null;
  }>;
}

interface PlatformHealthData {
  health: PlatformHealth;
  services: PlatformServices;
  isMock: boolean;
}

class PlatformHealthSource {
  async fetchHealth(timeRange: string): Promise<{ data: PlatformHealth; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return { data: PlatformHealthMockData.generateHealth(), isMock: true };
    }

    try {
      // Use relative path - all intelligence APIs are served by the same Express backend (port 3000)
      // See server/intelligence-routes.ts line 3251 for endpoint implementation
      const response = await fetch(`/api/intelligence/services/health?timeWindow=${timeRange}`);
      if (response.ok) {
        const rawData = await response.json();
        // Validate API response with Zod schema
        const data = safeParseResponse(platformHealthSchema, rawData, 'platform-health');
        if (data) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch platform health, using mock data', err);
    }

    return {
      data: PlatformHealthMockData.generateHealth(),
      isMock: true,
    };
  }

  async fetchServices(): Promise<{ data: PlatformServices; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return { data: PlatformHealthMockData.generateServices(), isMock: true };
    }

    try {
      // Use relative path - all intelligence APIs are served by the same Express backend (port 3000)
      // See server/intelligence-routes.ts line 2908 for endpoint implementation
      const response = await fetch('/api/intelligence/platform/services');
      if (response.ok) {
        const rawData = await response.json();
        // Validate API response with Zod schema
        const data = safeParseResponse(platformServicesSchema, rawData, 'platform-services');
        if (data) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch platform services, using mock data', err);
    }

    return {
      data: PlatformHealthMockData.generateServices(),
      isMock: true,
    };
  }

  async fetchAll(timeRange: string): Promise<PlatformHealthData> {
    const [health, services] = await Promise.all([
      this.fetchHealth(timeRange),
      this.fetchServices(),
    ]);

    return {
      health: health.data,
      services: services.data,
      isMock: health.isMock || services.isMock,
    };
  }
}

export const platformHealthSource = new PlatformHealthSource();
