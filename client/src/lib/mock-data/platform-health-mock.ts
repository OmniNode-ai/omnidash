/**
 * Mock Data Generator for Platform Health Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type { PlatformHealth, PlatformServices } from '../data-sources/platform-health-source';

export class PlatformHealthMockData {
  /**
   * Generate mock platform health data
   */
  static generateHealth(): PlatformHealth {
    const databaseUptime = Gen.randomFloat(99.5, 99.99, 2);
    const kafkaUptime = Gen.randomFloat(99.3, 99.98, 2);
    const databaseLatency = Gen.randomInt(5, 30);
    const kafkaLatency = Gen.randomInt(15, 60);

    const databaseStatus =
      Math.random() > 0.05 ? 'healthy' : Math.random() > 0.5 ? 'degraded' : 'down';
    const kafkaStatus =
      Math.random() > 0.05 ? 'healthy' : Math.random() > 0.5 ? 'degraded' : 'down';

    const services = [
      { name: 'PostgreSQL', status: 'up', latency_ms: databaseLatency, uptime: databaseUptime },
      {
        name: 'OmniArchon',
        status: 'up',
        latency_ms: Gen.randomInt(20, 80),
        uptime: Gen.randomFloat(99.0, 99.9, 2),
      },
      {
        name: 'Qdrant',
        status: 'up',
        latency_ms: Gen.randomInt(10, 50),
        uptime: Gen.randomFloat(99.2, 99.95, 2),
      },
      { name: 'Kafka/Redpanda', status: 'up', latency_ms: kafkaLatency, uptime: kafkaUptime },
      {
        name: 'Redis Cache',
        status: 'up',
        latency_ms: Gen.randomInt(2, 15),
        uptime: Gen.randomFloat(99.8, 99.99, 2),
      },
      {
        name: 'API Gateway',
        status: 'up',
        latency_ms: Gen.randomInt(25, 100),
        uptime: Gen.randomFloat(99.1, 99.9, 2),
      },
    ];

    // Randomly degrade one service (10% chance)
    if (Math.random() < 0.1) {
      const idx = Gen.randomInt(0, services.length - 1);
      services[idx].status = 'degraded';
      services[idx].latency_ms = Gen.randomInt(200, 500);
    }

    // Calculate overall status based on service health
    const hasDown = services.some((s) => s.status === 'down');
    const hasDegraded = services.some((s) => s.status === 'degraded');
    const overallStatus = hasDown ? 'down' : hasDegraded ? 'degraded' : 'up';

    // Calculate average uptime
    const avgUptime = services.reduce((sum, s) => sum + s.uptime, 0) / services.length;

    return {
      status: overallStatus,
      uptime: avgUptime,
      database: {
        name: 'PostgreSQL',
        status: databaseStatus,
        uptime: `${databaseUptime.toFixed(2)}%`,
        latency_ms: databaseLatency,
      },
      kafka: {
        name: 'Kafka/Redpanda',
        status: kafkaStatus,
        uptime: `${kafkaUptime.toFixed(2)}%`,
        latency_ms: kafkaLatency,
      },
      services: services.map((s) => ({
        name: s.name,
        status: s.status,
        latency_ms: s.latency_ms,
        uptime: s.uptime,
      })),
    };
  }

  /**
   * Generate mock platform services
   */
  static generateServices(): PlatformServices {
    const serviceNames = [
      'API Gateway',
      'Agent Service',
      'Intelligence Service',
      'Pattern Learning',
      'Event Consumer',
      'PostgreSQL',
      'Qdrant Vector DB',
      'Kafka/Redpanda',
      'Redis Cache',
      'WebSocket Server',
      'File Storage',
      'Authentication Service',
    ];

    const services = serviceNames.map((name) => {
      const healthStatus = Gen.healthStatus();
      // Map healthStatus to status: 'healthy' | 'degraded' | 'unhealthy'
      const status = healthStatus === 'down' ? 'unhealthy' : healthStatus;
      return {
        name,
        status,
        health:
          healthStatus === 'healthy' ? 'up' : healthStatus === 'degraded' ? 'degraded' : 'down',
      };
    });

    return { services };
  }

  /**
   * Generate CPU usage data
   */
  static generateCpuUsage(dataPoints: number = 20): Array<{ time: string; value: number }> {
    return Gen.generateTimeSeries(dataPoints, 20, 75, 1);
  }

  /**
   * Generate memory usage data
   */
  static generateMemoryUsage(dataPoints: number = 20): Array<{ time: string; value: number }> {
    return Gen.generateTimeSeries(dataPoints, 45, 85, 1);
  }

  /**
   * Generate service registry entries
   */
  static generateServiceRegistry() {
    const serviceNames = [
      'omnidash-api',
      'omnidash-agents',
      'omnidash-intelligence',
      'omnidash-patterns',
      'omnidash-events',
      'postgresql-primary',
      'postgresql-replica',
      'qdrant-cluster-1',
      'qdrant-cluster-2',
      'kafka-broker-1',
      'kafka-broker-2',
      'redis-master',
      'redis-replica',
    ];

    return serviceNames.map((serviceName) => {
      const healthStatus = Gen.healthStatus();
      return {
        id: Gen.uuid(),
        serviceName,
        serviceUrl: `http://192.168.86.200:${Gen.randomInt(8000, 9000)}`,
        serviceType: Gen.randomItem(['api', 'database', 'queue', 'cache', 'compute']),
        healthStatus:
          healthStatus === 'healthy'
            ? 'healthy'
            : healthStatus === 'degraded'
              ? 'degraded'
              : 'unhealthy',
        lastHealthCheck: Gen.pastTimestamp(15),
      };
    });
  }

  /**
   * Generate complete platform health data
   */
  static generateAll() {
    return {
      health: this.generateHealth(),
      services: this.generateServices(),
      cpuUsage: this.generateCpuUsage(20),
      memoryUsage: this.generateMemoryUsage(20),
      serviceRegistry: this.generateServiceRegistry(),
      isMock: true,
    };
  }
}
