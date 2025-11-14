/**
 * Event Bus Data Source
 * 
 * Client-side data source for querying events from the event bus API.
 * Provides methods to query events, get statistics, and check status.
 */

import { USE_MOCK_DATA } from '../mock-data/config';

export interface EventBusEvent {
  event_type: string;
  event_id: string;
  timestamp: string;
  tenant_id: string;
  namespace: string;
  source: string;
  correlation_id?: string;
  causation_id?: string;
  schema_ref: string;
  payload: Record<string, any>;
  topic: string;
  partition: number;
  offset: string;
  processed_at: string;
  stored_at?: string;
}

export interface EventQueryOptions {
  event_types?: string[];
  tenant_id?: string;
  namespace?: string;
  correlation_id?: string;
  start_time?: Date;
  end_time?: Date;
  limit?: number;
  offset?: number;
  order_by?: 'timestamp' | 'processed_at';
  order_direction?: 'asc' | 'desc';
}

export interface EventStatistics {
  total_events: number;
  events_by_type: Record<string, number>;
  events_by_tenant: Record<string, number>;
  events_per_minute: number;
  oldest_event: string | null;
  newest_event: string | null;
}

export interface EventBusStatus {
  active: boolean;
  connected: boolean;
  status: 'running' | 'stopped';
}

export interface EventQueryResponse {
  events: EventBusEvent[];
  count: number;
  options: EventQueryOptions;
}

class EventBusSource {
  /**
   * Query events with filters
   */
  async queryEvents(options: EventQueryOptions = {}): Promise<EventQueryResponse> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return this.getMockEvents(options);
    }

    try {
      const params = new URLSearchParams();
      
      if (options.event_types && options.event_types.length > 0) {
        params.append('event_types', options.event_types.join(','));
      }
      if (options.tenant_id) {
        params.append('tenant_id', options.tenant_id);
      }
      if (options.namespace) {
        params.append('namespace', options.namespace);
      }
      if (options.correlation_id) {
        params.append('correlation_id', options.correlation_id);
      }
      if (options.start_time) {
        params.append('start_time', options.start_time.toISOString());
      }
      if (options.end_time) {
        params.append('end_time', options.end_time.toISOString());
      }
      if (options.limit) {
        params.append('limit', options.limit.toString());
      }
      if (options.offset) {
        params.append('offset', options.offset.toString());
      }
      if (options.order_by) {
        params.append('order_by', options.order_by);
      }
      if (options.order_direction) {
        params.append('order_direction', options.order_direction);
      }

      const response = await fetch(`/api/event-bus/events?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        events: data.events || [],
        count: data.count || 0,
        options: data.options || options,
      };
    } catch (error) {
      console.warn('Failed to fetch events from event bus, using mock data', error);
      return this.getMockEvents(options);
    }
  }

  /**
   * Get event statistics
   */
  async getStatistics(timeRange?: { start: Date; end: Date }): Promise<EventStatistics> {
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    if (USE_MOCK_DATA && !isTestEnv) {
      return this.getMockStatistics();
    }

    try {
      const params = new URLSearchParams();
      if (timeRange) {
        params.append('start', timeRange.start.toISOString());
        params.append('end', timeRange.end.toISOString());
      }

      const response = await fetch(`/api/event-bus/statistics?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch statistics: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.warn('Failed to fetch statistics from event bus, using mock data', error);
      return this.getMockStatistics();
    }
  }

  /**
   * Get event bus status
   */
  async getStatus(): Promise<EventBusStatus> {
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        active: true,
        connected: true,
        status: 'running',
      };
    }

    try {
      const response = await fetch('/api/event-bus/status');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.warn('Failed to fetch event bus status, using mock data', error);
      return {
        active: false,
        connected: false,
        status: 'stopped',
      };
    }
  }

  /**
   * Get event chain by correlation_id
   */
  async getEventChain(correlationId: string): Promise<EventBusEvent[]> {
    const result = await this.queryEvents({ correlation_id: correlationId });
    return result.events;
  }

  /**
   * Generate mock events for development/testing
   */
  private getMockEvents(options: EventQueryOptions): EventQueryResponse {
    const now = Date.now();
    const mockEvents: EventBusEvent[] = [
      {
        event_type: 'omninode.intelligence.query.requested.v1',
        event_id: `evt-${now}-1`,
        timestamp: new Date(now - 60000).toISOString(),
        tenant_id: 'default-tenant',
        namespace: 'development',
        source: 'omniarchon',
        correlation_id: 'corr-123',
        schema_ref: 'registry://omninode/intelligence/query_requested/v1',
        payload: { query: 'find authentication patterns', user_id: 'user-123' },
        topic: 'default-tenant.omninode.intelligence.v1',
        partition: 0,
        offset: '100',
        processed_at: new Date(now - 60000).toISOString(),
      },
      {
        event_type: 'omninode.intelligence.query.completed.v1',
        event_id: `evt-${now}-2`,
        timestamp: new Date(now - 50000).toISOString(),
        tenant_id: 'default-tenant',
        namespace: 'development',
        source: 'omniarchon',
        correlation_id: 'corr-123',
        causation_id: `evt-${now}-1`,
        schema_ref: 'registry://omninode/intelligence/query_completed/v1',
        payload: { results: 5, duration_ms: 120 },
        topic: 'default-tenant.omninode.intelligence.v1',
        partition: 0,
        offset: '101',
        processed_at: new Date(now - 50000).toISOString(),
      },
      {
        event_type: 'omninode.agent.execution.started.v1',
        event_id: `evt-${now}-3`,
        timestamp: new Date(now - 40000).toISOString(),
        tenant_id: 'default-tenant',
        namespace: 'development',
        source: 'polymorphic-agent',
        correlation_id: 'corr-456',
        schema_ref: 'registry://omninode/agent/execution_started/v1',
        payload: { agent_id: 'agent-api-architect', task: 'code-review' },
        topic: 'default-tenant.omninode.agent.v1',
        partition: 0,
        offset: '200',
        processed_at: new Date(now - 40000).toISOString(),
      },
    ];

    // Apply filters
    let filtered = mockEvents;
    if (options.event_types && options.event_types.length > 0) {
      filtered = filtered.filter(e => options.event_types!.includes(e.event_type));
    }
    if (options.correlation_id) {
      filtered = filtered.filter(e => e.correlation_id === options.correlation_id);
    }
    if (options.tenant_id) {
      filtered = filtered.filter(e => e.tenant_id === options.tenant_id);
    }
    if (options.namespace) {
      filtered = filtered.filter(e => e.namespace === options.namespace);
    }

    // Apply limit
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return {
      events: filtered,
      count: filtered.length,
      options,
    };
  }

  /**
   * Generate mock statistics
   */
  private getMockStatistics(): EventStatistics {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    return {
      total_events: 1250,
      events_by_type: {
        'omninode.intelligence.query.requested.v1': 150,
        'omninode.intelligence.query.completed.v1': 145,
        'omninode.agent.execution.started.v1': 200,
        'omninode.agent.execution.completed.v1': 195,
        'omninode.code.pattern.discovered.v1': 100,
        'omninode.metadata.artifact.created.v1': 80,
      },
      events_by_tenant: {
        'default-tenant': 1200,
        'tenant-2': 50,
      },
      events_per_minute: 20.8,
      oldest_event: oneHourAgo.toISOString(),
      newest_event: now.toISOString(),
    };
  }
}

export const eventBusSource = new EventBusSource();

