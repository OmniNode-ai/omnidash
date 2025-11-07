/**
 * Mock Data Generator for Event Flow Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type { Event, EventMetrics, EventChartData } from '../data-sources/event-flow-source';

export class EventFlowMockData {
  /**
   * Generate mock events
   */
  static generateEvents(count: number = 100): Event[] {
    const events: Event[] = [];
    const eventTypes = [
      'agent-action',
      'routing-decision',
      'pattern-injection',
      'manifest-generation',
      'quality-assessment',
      'throughput',
      'cache-hit',
      'cache-miss',
      'error',
      'success',
    ];

    const sources = [
      'agent',
      'router',
      'intelligence',
      'api',
      'cache',
      'database',
      'queue',
    ];

    for (let i = 0; i < count; i++) {
      const type = Gen.randomItem(eventTypes);
      const source = Gen.randomItem(sources);
      const timestamp = Gen.pastTimestamp(60);

      let data: any = {};

      switch (type) {
        case 'agent-action':
          data = {
            agentId: Gen.agentName(),
            action: Gen.randomItem(['analyze', 'generate', 'review', 'refactor', 'test']),
            duration: Gen.randomInt(100, 5000),
            durationMs: Gen.randomInt(100, 5000),
            success: Math.random() > 0.1,
          };
          break;
        case 'routing-decision':
          data = {
            decision: Gen.agentName(),
            confidence: Gen.randomFloat(0.7, 0.99, 2),
            durationMs: Gen.randomInt(50, 500),
          };
          break;
        case 'pattern-injection':
          data = {
            patternId: `pattern-${Gen.randomInt(1, 100)}`,
            agentId: Gen.agentName(),
            success: Math.random() > 0.05,
            durationMs: Gen.randomInt(200, 2000),
          };
          break;
        case 'manifest-generation':
          data = {
            manifestId: Gen.uuid(),
            patternCount: Gen.randomInt(5, 50),
            durationMs: Gen.randomInt(500, 3000),
          };
          break;
        case 'throughput':
          data = {
            count: Gen.randomInt(1000, 2000),
            endpoint: Gen.randomItem([
              '/api/agents/execute',
              '/api/patterns/search',
              '/api/intelligence/query',
            ]),
            durationMs: Gen.randomInt(100, 1000),
          };
          break;
        case 'cache-hit':
        case 'cache-miss':
          data = {
            key: `cache-key-${Gen.randomInt(1, 100)}`,
            hitRate: Gen.randomFloat(0.5, 0.9, 2),
            durationMs: Gen.randomInt(1, 50),
          };
          break;
        case 'error':
          data = {
            errorType: Gen.randomItem(['timeout', 'validation', 'connection', 'not_found']),
            message: 'Operation failed',
            durationMs: Gen.randomInt(100, 2000),
          };
          break;
        case 'success':
          data = {
            operation: Gen.randomItem(['create', 'update', 'delete', 'query']),
            durationMs: Gen.randomInt(50, 1000),
          };
          break;
        default:
          data = { durationMs: Gen.randomInt(100, 1000) };
      }

      events.push({
        id: Gen.uuid(),
        timestamp,
        type,
        source,
        data,
      });
    }

    return events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Calculate metrics from events
   */
  static calculateMetrics(events: Event[]): EventMetrics {
    const typeCount = new Map<string, number>();
    let totalProcessingTime = 0;
    let processingTimeCount = 0;

    events.forEach((event) => {
      typeCount.set(event.type, (typeCount.get(event.type) || 0) + 1);
      if (event.data?.durationMs) {
        totalProcessingTime += event.data.durationMs;
        processingTimeCount++;
      }
    });

    const now = Date.now();
    const recentEvents = events.filter((e) => {
      const eventTime = new Date(e.timestamp).getTime();
      return now - eventTime < 60000;
    });

    return {
      totalEvents: events.length,
      uniqueTypes: typeCount.size,
      eventsPerMinute: recentEvents.length,
      avgProcessingTime:
        processingTimeCount > 0 ? Math.round(totalProcessingTime / processingTimeCount) : 0,
      topicCounts: typeCount,
    };
  }

  /**
   * Generate chart data from events
   */
  static generateChartData(events: Event[]): EventChartData {
    // Throughput chart
    const throughput = Gen.generateTimeSeries(20, 10, 100, 1);

    // Lag chart
    const lag = Gen.generateTimeSeries(20, 0.1, 5, 1);

    return { throughput, lag };
  }

  /**
   * Generate complete event flow data
   */
  static generateAll(eventCount: number = 100) {
    const events = this.generateEvents(eventCount);
    const metrics = this.calculateMetrics(events);
    const chartData = this.generateChartData(events);

    return {
      events,
      metrics,
      chartData,
      isMock: true,
    };
  }
}
