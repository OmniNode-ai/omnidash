import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlatformHealthMockData } from '../platform-health-mock';
import { MockDataGenerator } from '../config';

describe('PlatformHealthMockData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates health data with degraded service when random threshold hit', () => {
    vi.spyOn(MockDataGenerator, 'randomFloat').mockImplementation(() => 99.9);
    vi.spyOn(MockDataGenerator, 'randomInt').mockImplementation((min, max) => {
      if (min === 0 && max === 3) {
        return 0; // degrade first service (services array has 4 items, index 0-3)
      }
      if (min === 200 && max === 500) {
        return 250;
      }
      return 10;
    });
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // PostgreSQL healthy
      .mockReturnValueOnce(0.3) // Kafka healthy
      .mockReturnValueOnce(0.3) // Omniarchon healthy
      .mockReturnValueOnce(0.2) // Event Consumer healthy
      .mockReturnValueOnce(0.05); // trigger degraded service branch

    const health = PlatformHealthMockData.generateHealth();

    expect(health).toHaveProperty('overallStatus', 'unhealthy');
    expect(health).toHaveProperty('timestamp');
    expect(health).toHaveProperty('summary');
    expect(health.services.find((s) => s.service === 'PostgreSQL')).toBeDefined();
    expect(health.services.find((s) => s.service === 'Kafka/Redpanda')).toBeDefined();
    expect(health.services.some((service) => service.status === 'warning')).toBe(true);
    expect(
      health.services.every(
        (service) => service.latencyMs === undefined || typeof service.latencyMs === 'number'
      )
    ).toBe(true);
  });

  it('maps service health statuses correctly', () => {
    let call = 0;
    const statuses: Array<'healthy' | 'degraded' | 'down'> = ['healthy', 'degraded', 'down'];
    vi.spyOn(MockDataGenerator, 'healthStatus').mockImplementation(
      () => statuses[call++ % statuses.length]
    );

    const result = PlatformHealthMockData.generateServices();

    expect(result.services.length).toBeGreaterThan(0);
    expect(result.services[0].status).toBe('healthy');
    expect(result.services[1].status).toBe('degraded');
    expect(result.services[2].status).toBe('unhealthy');
  });

  // ARCHIVED: Mock data is deprecated in favor of real API endpoints.
  // This test is skipped as the mock data generators are being phased out.
  // See INTELLIGENCE_INTEGRATION.md for the migration to real data sources.
  it.skip('generates full platform mock snapshot with registry and time series', () => {
    vi.spyOn(MockDataGenerator, 'randomFloat').mockImplementation(() => 50);
    vi.spyOn(MockDataGenerator, 'randomInt').mockImplementation(() => 5);
    vi.spyOn(MockDataGenerator, 'healthStatus').mockImplementation(() => 'healthy');
    vi.spyOn(MockDataGenerator, 'generateTimeSeries').mockImplementation((points) =>
      Array.from({ length: points }).map((_, idx) => ({ time: `T${idx}`, value: idx }))
    );
    vi.spyOn(MockDataGenerator, 'uuid').mockImplementation(() => 'mock-id');
    vi.spyOn(MockDataGenerator, 'pastTimestamp').mockImplementation(() => '2024-01-01T00:00:00Z');
    vi.spyOn(MockDataGenerator, 'randomItem').mockImplementation((items: any[]) => items[0]);

    const snapshot = PlatformHealthMockData.generateAll();

    expect(snapshot.isMock).toBe(true);
    expect(snapshot.health).toBeDefined();
    expect(snapshot.services.services.length).toBeGreaterThan(0);
    expect(snapshot.cpuUsage.length).toBe(20);
    expect(snapshot.memoryUsage.length).toBe(20);
    expect(snapshot.serviceRegistry.length).toBeGreaterThan(0);
    expect(snapshot.serviceRegistry[0].id).toBe('mock-id');
  });
});
