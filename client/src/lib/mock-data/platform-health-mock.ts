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
    // Generate database service with realistic metrics
    const database = {
      name: 'PostgreSQL',
      status: Gen.healthStatus(),
      uptime: `${Gen.randomFloat(99.8, 99.99, 2)}%`,
      latency_ms: Gen.randomInt(5, 30)
    };

    // Generate Kafka service with realistic metrics
    const kafka = {
      name: 'Kafka/Redpanda',
      status: Math.random() < 0.95 ? ('healthy' as const) : ('degraded' as const),
      uptime: `${Gen.randomFloat(99.5, 99.95, 2)}%`,
      latency_ms: Gen.randomInt(15, 60)
    };

    // Generate 8-12 other services with realistic variations
    const serviceNames = [
      { name: 'OmniArchon', baseLatency: 20, latencyRange: 60 },
      { name: 'Qdrant', baseLatency: 10, latencyRange: 40 },
      { name: 'Redis Cache', baseLatency: 2, latencyRange: 13 },
      { name: 'API Gateway', baseLatency: 25, latencyRange: 75 },
      { name: 'Consul', baseLatency: 15, latencyRange: 45 },
      { name: 'Vault', baseLatency: 20, latencyRange: 50 },
      { name: 'OnexTree', baseLatency: 30, latencyRange: 70 },
      { name: 'Metadata Service', baseLatency: 18, latencyRange: 42 },
    ];

    const services = serviceNames.map(svc => {
      // 10% chance of degraded service, 2% chance of down
      const isDegraded = Math.random() < 0.1;
      const isDown = Math.random() < 0.02;

      let status: 'healthy' | 'degraded' | 'down';
      let uptime: string;
      let latency_ms: number;

      if (isDown) {
        status = 'down';
        uptime = `${Gen.randomFloat(95, 98, 2)}%`;
        latency_ms = 0; // No response
      } else if (isDegraded) {
        status = 'degraded';
        uptime = `${Gen.randomFloat(98.5, 99.5, 2)}%`;
        latency_ms = Gen.randomInt(svc.baseLatency * 3, svc.baseLatency * 8);
      } else {
        status = 'healthy';
        uptime = `${Gen.randomFloat(99.7, 99.99, 2)}%`;
        latency_ms = Gen.randomInt(svc.baseLatency, svc.baseLatency + svc.latencyRange);
      }

      return {
        name: svc.name,
        status,
        uptime,
        latency_ms
      };
    });

    return {
      database,
      kafka,
      services,
    } as any;
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
    const services = [
      { name: 'PostgreSQL Primary', type: 'database', url: 'postgres://192.168.86.200:5436', port: 5436 },
      { name: 'PostgreSQL Replica', type: 'database', url: 'postgres://192.168.86.200:5437', port: 5437 },
      { name: 'Kafka/Redpanda', type: 'message_queue', url: 'kafka://192.168.86.200:9092', port: 9092 },
      { name: 'OmniArchon Intelligence', type: 'api', url: 'http://192.168.86.200:8053', port: 8053 },
      { name: 'OmniArchon Search', type: 'api', url: 'http://192.168.86.200:8055', port: 8055 },
      { name: 'OmniArchon Bridge', type: 'api', url: 'http://192.168.86.200:8054', port: 8054 },
      { name: 'Qdrant Vector Store', type: 'vector_db', url: 'http://localhost:6333', port: 6333 },
      { name: 'Redis Cache Master', type: 'cache', url: 'redis://localhost:6379', port: 6379 },
      { name: 'Redis Cache Replica', type: 'cache', url: 'redis://localhost:6380', port: 6380 },
      { name: 'Consul Service Discovery', type: 'orchestration', url: 'http://192.168.86.200:28500', port: 28500 },
      { name: 'Vault Secrets Manager', type: 'security', url: 'http://192.168.86.200:8200', port: 8200 },
      { name: 'OnexTree Indexing', type: 'api', url: 'http://192.168.86.200:8058', port: 8058 },
      { name: 'Metadata Stamping Service', type: 'api', url: 'http://192.168.86.200:8057', port: 8057 },
    ];

    return services.map((service) => {
      const healthStatus = Gen.healthStatus();
      // Calculate last health check within the last 2 minutes
      const secondsAgo = Gen.randomInt(5, 120);
      const lastCheck = new Date(Date.now() - secondsAgo * 1000).toISOString();

      return {
        id: Gen.uuid(),
        name: service.name,
        serviceName: service.name,
        url: service.url,
        serviceUrl: service.url,
        type: service.type,
        serviceType: service.type,
        status: healthStatus,
        healthStatus: healthStatus === 'down' ? 'unhealthy' : healthStatus,
        lastCheck,
        lastHealthCheck: lastCheck,
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
