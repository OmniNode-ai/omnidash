// Platform Health Data Source
import { USE_MOCK_DATA, PlatformHealthMockData } from '../mock-data';
import {
  platformHealthSchema,
  platformServicesSchema,
  safeParseResponse,
} from '../schemas/api-response-schemas';

export interface PlatformHealth {
  status: string;
  uptime: number;
  database?: {
    name: string;
    status: string;
    uptime: string;
    latency_ms: number;
  };
  kafka?: {
    name: string;
    status: string;
    uptime: string;
    latency_ms: number;
  };
  services: Array<{
    name: string;
    status: string;
    latency?: number;
    latency_ms?: number;
    uptime?: number;
  }>;
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
      const omniarchonUrl =
        import.meta.env.VITE_INTELLIGENCE_SERVICE_URL || 'http://localhost:8053';
      const response = await fetch(
        `${omniarchonUrl}/api/intelligence/platform/health?timeWindow=${timeRange}`
      );
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
