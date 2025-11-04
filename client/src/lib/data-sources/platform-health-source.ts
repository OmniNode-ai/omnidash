// Platform Health Data Source
export interface PlatformHealth {
  status: string;
  uptime: number;
  services: Array<{
    name: string;
    status: string;
    latency?: number;
  }>;
}

export interface PlatformServices {
  services: Array<{
    name: string;
    status: string;
    health: string;
  }>;
}

interface PlatformHealthData {
  health: PlatformHealth;
  services: PlatformServices;
  isMock: boolean;
}

class PlatformHealthSource {
  async fetchHealth(timeRange: string): Promise<{ data: PlatformHealth; isMock: boolean }> {
    try {
      const omniarchonUrl = import.meta.env.VITE_INTELLIGENCE_SERVICE_URL || "http://localhost:8053";
      const response = await fetch(`${omniarchonUrl}/api/intelligence/platform/health?timeWindow=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch platform health, using mock data', err);
    }

    return {
      data: {
        status: 'healthy',
        uptime: 99.9,
        services: [
          { name: 'PostgreSQL', status: 'up' },
          { name: 'OmniArchon', status: 'up' },
          { name: 'Qdrant', status: 'up' },
        ]
      },
      isMock: true,
    };
  }

  async fetchServices(): Promise<{ data: PlatformServices; isMock: boolean }> {
    try {
      const response = await fetch('http://localhost:3000/api/intelligence/platform/services');
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch platform services, using mock data', err);
    }

    return {
      data: {
        services: [
          { name: 'API Gateway', status: 'healthy', health: 'up' },
          { name: 'Agent Service', status: 'healthy', health: 'up' },
          { name: 'PostgreSQL', status: 'healthy', health: 'up' },
        ]
      },
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



