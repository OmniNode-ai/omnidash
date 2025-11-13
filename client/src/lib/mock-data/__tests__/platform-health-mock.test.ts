import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlatformHealthMockData } from '../platform-health-mock';
import { MockDataGenerator } from '../config';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlatformHealthMockData', () => {
  it('generates health data with degraded service when random threshold hit', () => {
    vi.spyOn(MockDataGenerator, 'randomFloat').mockImplementation(() => 99.9);
    vi.spyOn(MockDataGenerator, 'randomInt').mockImplementation((min, max) => {
      if (min === 0 && max === 5) {
        return 0; // degrade first service
      }
      if (min === 200 && max === 500) {
        return 250;
      }
      return 10;
    });
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // database healthy
      .mockReturnValueOnce(0.3) // kafka healthy
      .mockReturnValueOnce(0.05); // trigger degraded service branch

    const health = PlatformHealthMockData.generateHealth();

    expect(health).toHaveProperty('status', 'degraded');
    expect(health.database?.name).toBe('PostgreSQL');
    expect(health.kafka?.name).toBe('Kafka/Redpanda');
    expect(health.services.some(service => service.status === 'degraded')).toBe(true);
    expect(health.services.every(service => typeof service.latency_ms === 'number')).toBe(true);
  });

  it('maps service health statuses correctly', () => {
    let call = 0;
    const statuses: Array<'healthy' | 'degraded' | 'down'> = ['healthy', 'degraded', 'down'];
    vi.spyOn(MockDataGenerator, 'healthStatus').mockImplementation(() => statuses[(call++) % statuses.length]);

    const result = PlatformHealthMockData.generateServices();

    expect(result.services.length).toBeGreaterThan(0);
    expect(result.services[0].status).toBe('healthy');
    expect(result.services[1].status).toBe('degraded');
    expect(result.services[2].status).toBe('unhealthy');
  });

  it('generates full platform mock snapshot with registry and time series', () => {
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
