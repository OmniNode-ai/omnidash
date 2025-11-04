/**
 * Comprehensive Service Health Checker
 * Tests all external service connections and provides diagnostic information
 */

import { intelligenceDb } from './storage';
import { sql } from 'drizzle-orm';
import { eventConsumer } from './event-consumer';
import { Kafka } from 'kafkajs';

export interface ServiceHealthCheck {
  service: string;
  status: 'up' | 'down' | 'warning';
  latencyMs?: number;
  error?: string;
  details?: Record<string, any>;
}

export async function checkAllServices(): Promise<ServiceHealthCheck[]> {
  const checks: ServiceHealthCheck[] = [];

  // 1. PostgreSQL Database Check
  checks.push(await checkPostgreSQL());

  // 2. Kafka/Redpanda Check
  checks.push(await checkKafka());

  // 3. Omniarchon Intelligence Service Check
  checks.push(await checkOmniarchon());

  // 4. Event Consumer Check
  checks.push(await checkEventConsumer());

  return checks;
}

async function checkPostgreSQL(): Promise<ServiceHealthCheck> {
  const startTime = Date.now();
  try {
    const result = await intelligenceDb.execute(sql`SELECT 1 as check, NOW() as current_time, version() as pg_version`);
    const latency = Date.now() - startTime;
    
    // Parse result (handle different return types)
    const rows = Array.isArray(result) ? result : (result?.rows || result || []);
    const firstRow = rows[0] || {};
    
    return {
      service: 'PostgreSQL',
      status: latency < 1000 ? 'up' : 'warning',
      latencyMs: latency,
      details: {
        version: firstRow.pg_version?.substring(0, 50) || 'unknown',
        currentTime: firstRow.current_time,
      },
    };
  } catch (error) {
    return {
      service: 'PostgreSQL',
      status: 'down',
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkKafka(): Promise<ServiceHealthCheck> {
  const startTime = Date.now();
  const brokers = (process.env.KAFKA_BROKERS || '192.168.86.200:9092').split(',');
  
  try {
    // Create a test Kafka client
    const kafka = new Kafka({
      brokers,
      clientId: 'omnidash-health-check',
      connectionTimeout: 3000,
      requestTimeout: 3000,
    });

    // Try to connect (simple connection test)
    const admin = kafka.admin();
    await admin.connect();
    const latency = Date.now() - startTime;
    
    // Try to list topics to verify full connectivity
    try {
      const topics = await admin.listTopics();
      await admin.disconnect();

      return {
        service: 'Kafka/Redpanda',
        status: 'up',
        latencyMs: latency,
        details: {
          brokers: brokers,
          topicCount: topics.length,
        },
      };
    } catch (listError) {
      await admin.disconnect();
      // Connection worked but listing failed - still consider it up
      return {
        service: 'Kafka/Redpanda',
        status: 'up',
        latencyMs: latency,
        details: {
          brokers: brokers,
          note: 'Connected but topic listing failed',
        },
      };
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      service: 'Kafka/Redpanda',
      status: 'down',
      latencyMs: latency,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        brokers: brokers,
      },
    };
  }
}

async function checkOmniarchon(): Promise<ServiceHealthCheck> {
  const startTime = Date.now();
  const omniarchonUrl = process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8053';
  
  try {
    const response = await fetch(`${omniarchonUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      let healthData: any = {};
      try {
        healthData = await response.json();
      } catch {
        // If JSON parse fails, just check status
      }

      return {
        service: 'Omniarchon',
        status: 'up',
        latencyMs: latency,
        details: {
          url: omniarchonUrl,
          statusCode: response.status,
          health: healthData,
        },
      };
    } else {
      return {
        service: 'Omniarchon',
        status: 'down',
        latencyMs: latency,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          url: omniarchonUrl,
        },
      };
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      service: 'Omniarchon',
      status: 'down',
      latencyMs: latency,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        url: omniarchonUrl,
      },
    };
  }
}

async function checkEventConsumer(): Promise<ServiceHealthCheck> {
  try {
    const health = eventConsumer.getHealthStatus();
    
    return {
      service: 'Event Consumer',
      status: health.status === 'healthy' ? 'up' : 'down',
      details: {
        isRunning: eventConsumer['isRunning'] || false,
        eventsProcessed: health.eventsProcessed || 0,
        recentActionsCount: health.recentActionsCount || 0,
      },
    };
  } catch (error) {
    return {
      service: 'Event Consumer',
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

