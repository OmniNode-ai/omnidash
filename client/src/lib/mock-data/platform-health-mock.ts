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
    const services = [
      { name: 'PostgreSQL', status: 'up', latency: Gen.randomInt(5, 30) },
      { name: 'OmniArchon', status: 'up', latency: Gen.randomInt(20, 80) },
      { name: 'Qdrant', status: 'up', latency: Gen.randomInt(10, 50) },
      { name: 'Kafka/Redpanda', status: 'up', latency: Gen.randomInt(15, 60) },
      { name: 'Redis Cache', status: 'up', latency: Gen.randomInt(2, 15) },
      { name: 'API Gateway', status: 'up', latency: Gen.randomInt(25, 100) },
    ];

    // Randomly degrade one service (10% chance)
    if (Math.random() < 0.1) {
      const idx = Gen.randomInt(0, services.length - 1);
      services[idx].status = 'degraded';
      services[idx].latency = Gen.randomInt(200, 500);
    }

    const allHealthy = services.every((s) => s.status === 'up');
    const status = allHealthy ? 'healthy' : 'degraded';
    const uptime = Gen.randomFloat(99.0, 99.99, 2);

    return {
      status,
      uptime,
      services,
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
      return {
        name,
        status: healthStatus,
        health: healthStatus === 'healthy' ? 'up' : healthStatus === 'degraded' ? 'degraded' : 'down',
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
        healthStatus: healthStatus === 'healthy' ? 'healthy' : healthStatus === 'degraded' ? 'degraded' : 'unhealthy',
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
