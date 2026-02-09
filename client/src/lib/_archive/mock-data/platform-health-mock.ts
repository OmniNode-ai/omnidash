/**
 * Mock Data Generator for Platform Health Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type { PlatformHealth, PlatformServices } from '../data-sources/platform-health-source';

export class PlatformHealthMockData {
  /**
   * Generate mock platform health data matching /api/intelligence/services/health response format
   * See server/intelligence-routes.ts line 3251 and server/service-health.ts
   */
  static generateHealth(): PlatformHealth {
    // Helper to generate status and ensure latency correlates with status
    const generateStatusAndLatency = (
      normalMin: number,
      normalMax: number
    ): { status: 'up' | 'warning' | 'down'; latencyMs: number } => {
      const status: 'up' | 'warning' | 'down' =
        Math.random() > 0.05 ? 'up' : Math.random() > 0.5 ? 'warning' : 'down';
      // If warning status, use degraded latency range (200-500ms)
      const latencyMs =
        status === 'warning' ? Gen.randomInt(200, 500) : Gen.randomInt(normalMin, normalMax);
      return { status, latencyMs };
    };

    const postgresHealth = generateStatusAndLatency(5, 30);
    const kafkaHealth = generateStatusAndLatency(15, 60);
    const omniarchonHealth = generateStatusAndLatency(20, 80);

    // Generate service health checks matching ServiceHealthCheck interface
    const services: PlatformHealth['services'] = [
      {
        service: 'PostgreSQL',
        status: postgresHealth.status,
        latencyMs: postgresHealth.latencyMs,
        details: {
          version: 'PostgreSQL 14.0',
          currentTime: new Date().toISOString(),
        },
      },
      {
        service: 'Kafka/Redpanda',
        status: kafkaHealth.status,
        latencyMs: kafkaHealth.latencyMs,
        details: {
          brokers: ['kafka-broker:9092'],
          topicCount: Gen.randomInt(15, 25),
        },
      },
      {
        service: 'Omniarchon',
        status: omniarchonHealth.status,
        latencyMs: omniarchonHealth.latencyMs,
        details: {
          url: 'http://localhost:8053',
          statusCode: 200,
        },
      },
      {
        service: 'Event Consumer',
        status: Math.random() > 0.05 ? 'up' : 'down',
        details: {
          isRunning: true,
          eventsProcessed: Gen.randomInt(1000, 5000),
          recentActionsCount: Gen.randomInt(50, 200),
        },
      },
    ];

    // Randomly degrade one service (10% chance)
    if (Math.random() < 0.1 && services.length > 0) {
      const idx = Gen.randomInt(0, services.length - 1);
      services[idx].status = 'warning';
      services[idx].latencyMs = Gen.randomInt(200, 500);
    }

    // Calculate summary
    const summary = {
      total: services.length,
      up: services.filter((s) => s.status === 'up').length,
      down: services.filter((s) => s.status === 'down').length,
      warning: services.filter((s) => s.status === 'warning').length,
    };

    // Calculate overall status
    const allUp = services.every((s) => s.status === 'up');
    const overallStatus: PlatformHealth['overallStatus'] = allUp ? 'healthy' : 'unhealthy';

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      services,
      summary,
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
