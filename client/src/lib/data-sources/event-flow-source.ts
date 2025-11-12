// Event Flow Data Source
import { USE_MOCK_DATA } from '../mock-data/config';
import { ensureNumeric, ensureArray } from '../defensive-transform-logger';

export interface Event {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  data: any;
}

export interface EventMetrics {
  totalEvents: number;
  uniqueTypes: number;
  eventsPerMinute: number;
  avgProcessingTime: number;
  topicCounts: Map<string, number>;
}

export interface EventChartData {
  throughput: Array<{ time: string; value: number }>;
  lag: Array<{ time: string; value: number }>;
}

interface EventFlowData {
  events: Event[];
  metrics: EventMetrics;
  chartData: EventChartData;
  isMock: boolean;
}

class EventFlowSource {
  calculateMetrics(events: Event[]): EventMetrics {
    const typeCount = new Map<string, number>();
    let totalProcessingTime = 0;
    let processingTimeCount = 0;

    events.forEach((event, index) => {
      const currentCount = typeCount.get(event.type);
      if (currentCount === undefined) {
        typeCount.set(event.type, 1);
      } else {
        typeCount.set(event.type, currentCount + 1);
      }

      if (event.data?.durationMs !== undefined) {
        const duration = ensureNumeric(
          'durationMs',
          event.data.durationMs,
          0,
          { id: event.id || index, context: 'event-metrics-duration' }
        );
        totalProcessingTime += duration;
        processingTimeCount++;
      }
    });

    const now = Date.now();
    const recentEvents = events.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      return (now - eventTime) < 60000;
    });

    return {
      totalEvents: events.length,
      uniqueTypes: typeCount.size,
      eventsPerMinute: recentEvents.length,
      avgProcessingTime: processingTimeCount > 0 ? Math.round(totalProcessingTime / processingTimeCount) : 0,
      topicCounts: typeCount,
    };
  }

  generateChartData(events: Event[]): EventChartData {
    // Throughput chart - group by minute
    const minuteCounts = new Map<string, number>();
    events.forEach(event => {
      const time = new Date(event.timestamp);
      const minute = `${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`;
      const currentCount = minuteCounts.get(minute);
      if (currentCount === undefined) {
        minuteCounts.set(minute, 1);
      } else {
        minuteCounts.set(minute, currentCount + 1);
      }
    });

    const throughput = Array.from(minuteCounts.entries())
      .slice(-20)
      .map(([time, value]) => ({ time, value }));

    // Lag chart - last 20 events
    const now = Date.now();
    const lag = events
      .slice(-20)
      .map(event => {
        const eventTime = new Date(event.timestamp).getTime();
        const lagSeconds = Math.max(0, (now - eventTime) / 1000);
        return {
          time: new Date(event.timestamp).toLocaleTimeString(),
          value: lagSeconds,
        };
      });

    return { throughput, lag };
  }

  async fetchEvents(limit: number = 100): Promise<EventFlowData> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      const now = Date.now();
      const mockEvents: Event[] = [
        { id: '1', timestamp: new Date(now).toISOString(), type: 'throughput', source: 'api', data: { count: 1250, endpoint: '/api/agents/execute' } },
        { id: '2', timestamp: new Date(now - 30000).toISOString(), type: 'pattern-injection', source: 'intelligence', data: { patternId: 'auth-pattern', agentId: 'polymorphic-agent', success: true } },
        { id: '3', timestamp: new Date(now - 60000).toISOString(), type: 'routing-decision', source: 'router', data: { decision: 'code-reviewer', confidence: 0.94 } },
        { id: '4', timestamp: new Date(now - 90000).toISOString(), type: 'agent-action', source: 'agent', data: { agentId: 'code-reviewer', action: 'code-review', duration: 1200 } },
        { id: '5', timestamp: new Date(now - 120000).toISOString(), type: 'throughput', source: 'api', data: { count: 1180, endpoint: '/api/agents/execute' } },
        { id: '6', timestamp: new Date(now - 150000).toISOString(), type: 'cache-hit', source: 'cache', data: { hitRate: 0.67, key: 'agent-config:polymorphic-agent' } },
      ];

      return {
        events: mockEvents,
        metrics: this.calculateMetrics(mockEvents),
        chartData: this.generateChartData(mockEvents),
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/intelligence/events/stream?limit=${limit}`);
      if (response.ok) {
        const eventsData = await response.json();
        // Ensure we always get an array, with logging for unexpected formats
        const events = Array.isArray(eventsData)
          ? eventsData
          : ensureArray('events', eventsData.events, { context: 'event-flow-fetch' });

        return {
          events,
          metrics: this.calculateMetrics(events),
          chartData: this.generateChartData(events),
          isMock: false,
        };
      }
    } catch (err) {
      console.warn('Failed to fetch events, using mock data', err);
    }

    // Mock fallback with comprehensive sample events
    const now = Date.now();
    const mockEvents: Event[] = [
      { id: '1', timestamp: new Date(now).toISOString(), type: 'throughput', source: 'api', data: { count: 1250, endpoint: '/api/agents/execute' } },
      { id: '2', timestamp: new Date(now - 30000).toISOString(), type: 'pattern-injection', source: 'intelligence', data: { patternId: 'auth-pattern', agentId: 'polymorphic-agent', success: true } },
      { id: '3', timestamp: new Date(now - 60000).toISOString(), type: 'routing-decision', source: 'router', data: { decision: 'code-reviewer', confidence: 0.94 } },
      { id: '4', timestamp: new Date(now - 90000).toISOString(), type: 'agent-action', source: 'agent', data: { agentId: 'code-reviewer', action: 'code-review', duration: 1200 } },
      { id: '5', timestamp: new Date(now - 120000).toISOString(), type: 'throughput', source: 'api', data: { count: 1180, endpoint: '/api/agents/execute' } },
      { id: '6', timestamp: new Date(now - 150000).toISOString(), type: 'cache-hit', source: 'cache', data: { hitRate: 0.67, key: 'agent-config:polymorphic-agent' } },
    ];

    return {
      events: mockEvents,
      metrics: this.calculateMetrics(mockEvents),
      chartData: this.generateChartData(mockEvents),
      isMock: true,
    };
  }
}

export const eventFlowSource = new EventFlowSource();

