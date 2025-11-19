import { MetricCard } from '@/components/MetricCard';
import { RealtimeChart } from '@/components/RealtimeChart';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { ExportButton } from '@/components/ExportButton';
import { SectionHeader } from '@/components/SectionHeader';
import { Activity, Zap, Database, TrendingUp, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { MockBadge } from '@/components/MockBadge';
import { ensureTimeSeries } from '@/components/mockUtils';
import { useState, useMemo } from 'react';
import { eventFlowSource, eventBusSource, type EventBusEvent } from '@/lib/data-sources';
import { POLLING_INTERVAL_MEDIUM, getPollingInterval } from '@/lib/constants/query-config';
import { EventStatisticsPanel } from '@/components/event-bus/EventStatisticsPanel';
import { EventSearchBar } from '@/components/event-bus/EventSearchBar';
import { EventTypeBadge } from '@/components/event-bus/EventTypeBadge';
import { EventBusHealthIndicator } from '@/components/event-bus/EventBusHealthIndicator';
import type { EventQueryOptions } from '@/lib/data-sources';
import type { QueryObserverOptions } from '@tanstack/react-query';

// Event stream interface matching omniarchon endpoint
interface EventStreamItem {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

interface EventStreamResponse {
  events: EventStreamItem[];
  total: number;
}

type QueryBehaviorOverrides = {
  eventBus?: Pick<QueryObserverOptions, 'refetchInterval' | 'refetchOnWindowFocus' | 'staleTime'>;
  legacy?: Pick<QueryObserverOptions, 'refetchInterval' | 'refetchOnWindowFocus' | 'staleTime'>;
};

type EventFlowProps = {
  /**
   * Internal/testing hook to override query behaviour (polling, focus refetch, etc.).
   * Production code should rely on the defaults defined here.
   */
  queryBehaviorOverrides?: QueryBehaviorOverrides;
};

export default function EventFlow({ queryBehaviorOverrides }: EventFlowProps = {}) {
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });
  const [useEventBus, setUseEventBus] = useState(true); // Toggle between old and new API
  const [eventBusFilters, setEventBusFilters] = useState<EventQueryOptions>({
    limit: 100,
    order_by: 'timestamp',
    order_direction: 'desc',
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Calculate time range for event bus
  const timeRangeDates = useMemo(() => {
    const now = new Date();
    let start: Date;

    switch (timeRange) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end: now };
  }, [timeRange]);

  // Extract timestamp values for stable dependencies
  const startTimeMs = timeRangeDates.start.getTime();
  const endTimeMs = timeRangeDates.end.getTime();

  // Calculate effective start/end times: prefer EventSearchBar filters, fallback to page-level TimeRangeSelector
  const effectiveStartTime = eventBusFilters.start_time ?? timeRangeDates.start;
  const effectiveEndTime = eventBusFilters.end_time ?? timeRangeDates.end;
  const effectiveStartTimeMs = effectiveStartTime.getTime();
  const effectiveEndTimeMs = effectiveEndTime.getTime();

  // Create stable query key to prevent infinite loops
  const eventBusQueryKey = useMemo(() => {
    return [
      'event-bus-events',
      eventBusFilters.event_types?.join(','),
      eventBusFilters.correlation_id,
      eventBusFilters.tenant_id,
      eventBusFilters.namespace,
      eventBusFilters.source,
      eventBusFilters.limit,
      eventBusFilters.offset,
      eventBusFilters.order_by,
      eventBusFilters.order_direction,
      effectiveStartTimeMs,
      effectiveEndTimeMs,
    ];
  }, [
    eventBusFilters.event_types,
    eventBusFilters.correlation_id,
    eventBusFilters.tenant_id,
    eventBusFilters.namespace,
    eventBusFilters.source,
    eventBusFilters.limit,
    eventBusFilters.offset,
    eventBusFilters.order_by,
    eventBusFilters.order_direction,
    effectiveStartTimeMs,
    effectiveEndTimeMs,
  ]);

  const {
    data: eventBusData,
    isLoading: isLoadingBus,
    isError: isErrorBus,
    error: errorBus,
    dataUpdatedAt: busUpdatedAt,
  } = useQuery({
    queryKey: eventBusQueryKey,
    queryFn: () =>
      eventBusSource.queryEvents({
        ...eventBusFilters,
        // Prefer EventSearchBar time range if set, otherwise use page-level TimeRangeSelector
        start_time: effectiveStartTime,
        end_time: effectiveEndTime,
      }),
    refetchInterval: (queryBehaviorOverrides?.eventBus?.refetchInterval ??
      getPollingInterval(POLLING_INTERVAL_MEDIUM)) as number | false,
    refetchOnWindowFocus: (queryBehaviorOverrides?.eventBus?.refetchOnWindowFocus ?? true) as
      | boolean
      | 'always',
    staleTime: (queryBehaviorOverrides?.eventBus?.staleTime ?? 30_000) as number,
    enabled: useEventBus,
  });

  // Fetch events with TanStack Query and polling using old data source (fallback)
  const {
    data: eventFlowData,
    isLoading: isLoadingOld,
    isError: isErrorOld,
    error: errorOld,
    dataUpdatedAt: oldUpdatedAt,
  } = useQuery({
    queryKey: ['events', 'stream'],
    queryFn: () => eventFlowSource.fetchEvents(100),
    refetchInterval: (queryBehaviorOverrides?.legacy?.refetchInterval ??
      getPollingInterval(POLLING_INTERVAL_MEDIUM)) as number | false,
    refetchOnWindowFocus: (queryBehaviorOverrides?.legacy?.refetchOnWindowFocus ?? true) as
      | boolean
      | 'always',
    staleTime: queryBehaviorOverrides?.legacy?.staleTime as number | undefined,
    enabled: !useEventBus,
  });

  const isLoading = useEventBus ? isLoadingBus : isLoadingOld;
  const isError = useEventBus ? isErrorBus : isErrorOld;
  const error = useEventBus ? errorBus : errorOld;
  const dataUpdatedAt = useEventBus ? busUpdatedAt : oldUpdatedAt;

  // Transform event bus events to expected format
  const eventBusEvents: EventStreamItem[] = useMemo(() => {
    if (!eventBusData?.events) return [];
    return eventBusData.events.map((e: EventBusEvent) => ({
      id: e.event_id,
      type: e.event_type,
      timestamp: e.timestamp,
      data: {
        ...e.payload,
        correlationId: e.correlation_id,
        causationId: e.causation_id,
        source: e.source,
        tenant_id: e.tenant_id,
        namespace: e.namespace,
      },
    }));
  }, [eventBusData]);

  // Derive event types from event bus events for EventSearchBar
  const eventTypes = useMemo(() => {
    if (!useEventBus || !eventBusData?.events) return [];
    const types = new Set<string>();
    eventBusData.events.forEach((e: EventBusEvent) => types.add(e.event_type));
    return Array.from(types).sort();
  }, [useEventBus, eventBusData]);

  // Transform to expected format
  const data: EventStreamResponse = useEventBus
    ? {
        events: eventBusEvents,
        total: eventBusEvents.length,
      }
    : eventFlowData
      ? {
          events: eventFlowData.events.map((e) => ({
            id: e.id,
            type: e.type,
            timestamp: e.timestamp,
            data: e.data,
          })),
          total: eventFlowData.events.length,
        }
      : { events: [], total: 0 };

  // Calculate metrics from event bus data
  // Use eventBusData.count instead of events.length to avoid dependency on array reference
  const eventBusMetrics = useMemo(() => {
    if (!eventBusData || !useEventBus) return null;
    const events = eventBusData.events || [];
    const eventCount = eventBusData.count ?? events.length;
    const typeCounts = new Map<string, number>();
    events.forEach((e) => {
      typeCounts.set(e.event_type, (typeCounts.get(e.event_type) || 0) + 1);
    });
    // Use effective time range (respects EventSearchBar or falls back to page-level selector)
    const windowMs = effectiveEndTimeMs - effectiveStartTimeMs;
    // Calculate total topic count from the actual displayed events for accurate percentages
    const totalTopicCount =
      Array.from(typeCounts.values()).reduce((sum, count) => sum + count, 0) || 1;
    return {
      totalEvents: eventCount,
      uniqueTypes: typeCounts.size,
      eventsPerMinute: windowMs > 0 ? eventCount / (windowMs / 60000) : 0,
      avgProcessingTime: 0, // Not available from event bus
      topicCounts: typeCounts,
      totalTopicCount, // Add this for accurate percentage calculations
    };
  }, [eventBusData, useEventBus, effectiveStartTimeMs, effectiveEndTimeMs]);

  // Use metrics and chart data from data source
  const metrics = useMemo(() => {
    if (useEventBus && eventBusMetrics) {
      return eventBusMetrics;
    }
    if (!eventFlowData?.metrics) {
      return {
        totalEvents: 0,
        uniqueTypes: 0,
        eventsPerMinute: 0,
        avgProcessingTime: 0,
        topicCounts: new Map<string, number>(),
      };
    }
    return eventFlowData.metrics;
  }, [useEventBus, eventBusMetrics, eventFlowData]);

  // Use chart data from data source (only for legacy API)
  const throughputDataRaw = useEventBus ? [] : eventFlowData?.chartData?.throughput || [];
  const { data: throughputData, isMock: isThroughputMock } = ensureTimeSeries(
    throughputDataRaw,
    10,
    6
  );

  const lagDataRaw = useEventBus ? [] : eventFlowData?.chartData?.lag || [];
  const { data: lagData, isMock: isLagMock } = ensureTimeSeries(lagDataRaw, 3, 1.2);

  // Convert topic counts to array for display
  const topics = useMemo(() => {
    return Array.from(metrics.topicCounts.entries())
      .map(([name, count]) => ({
        id: name,
        name,
        messagesPerSec: Math.round(count / 60), // Rough estimate
        consumers: 1, // Not available from stream
        lag: 0, // Not available from stream
      }))
      .slice(0, 5); // Top 5 topics
  }, [metrics.topicCounts]);

  const topicShareDenominator = useMemo(() => {
    const total = Array.from(metrics.topicCounts.values()).reduce((sum, count) => sum + count, 0);
    return total || 1;
  }, [metrics.topicCounts]);

  // Format last update time
  const lastUpdateTime = new Date(dataUpdatedAt).toLocaleTimeString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Event Flow"
          description={`Real-time event stream${dataUpdatedAt ? ` • Last updated: ${lastUpdateTime}` : ''}`}
          details="Event Flow provides real-time visibility into all events flowing through the Kafka event bus. Monitor event throughput, processing lag, event types, and recent events. This dashboard is essential for debugging event-driven workflows, tracking system activity, and identifying performance bottlenecks in the event pipeline."
          level="h1"
        />
        <div className="flex items-center gap-2">
          <EventBusHealthIndicator showLabel={false} />
          <Button variant="outline" size="sm" onClick={() => setUseEventBus(!useEventBus)}>
            {useEventBus ? 'Using Event Bus API' : 'Using Legacy API'}
          </Button>
        </div>
      </div>

      {useEventBus && (
        <>
          <EventSearchBar
            eventTypes={eventTypes}
            hideTimeRange={true}
            onFilterChange={(filters) => {
              setEventBusFilters((prev) => {
                const next = { ...prev, ...filters };
                // Remove undefined values so cleared filters are actually removed
                Object.keys(next).forEach((key) => {
                  if (next[key as keyof typeof next] === undefined) {
                    delete next[key as keyof typeof next];
                  }
                });
                return next;
              });
            }}
          />
          <EventStatisticsPanel />
        </>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={{ events: data?.events, metrics, throughputData, lagData, topics }}
            filename={`event-flow-${timeRange}-${new Date().toISOString().split('T')[0]}`}
            disabled={!data || isError}
          />
        </div>
      </div>

      {isError && (
        <Card className="p-4 border-destructive">
          <p className="text-sm text-destructive">
            Error loading events: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Make sure omniarchon is running at http://localhost:8053
          </p>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          label="Total Events"
          value={isLoading ? '...' : metrics.totalEvents.toString()}
          icon={Activity}
          status={isError ? 'error' : 'healthy'}
        />
        <MetricCard
          label="Event Types"
          value={isLoading ? '...' : metrics.uniqueTypes.toString()}
          icon={Database}
          status={isError ? 'error' : 'healthy'}
        />
        <MetricCard
          label="Events/min"
          value={isLoading ? '...' : metrics.eventsPerMinute.toString()}
          icon={Zap}
          status={isError ? 'error' : 'healthy'}
        />
        <MetricCard
          label="Avg Processing"
          value={isLoading ? '...' : `${metrics.avgProcessingTime}ms`}
          icon={Clock}
          status={isError ? 'error' : 'healthy'}
        />
      </div>

      {!useEventBus && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            {isThroughputMock && <MockBadge label="MOCK DATA: Event Throughput" />}
            <RealtimeChart
              title="Event Throughput (by minute)"
              data={throughputData}
              color="hsl(var(--chart-4))"
              showArea
            />
          </div>
          <div>
            {isLagMock && <MockBadge label="MOCK DATA: Event Lag" />}
            <RealtimeChart title="Event Lag (seconds)" data={lagData} color="hsl(var(--chart-5))" />
          </div>
        </div>
      )}

      {useEventBus && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-semibold">Throughput & Lag Metrics</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Detailed throughput and consumer lag metrics are coming soon for Event Bus mode. These
            metrics will provide real-time visibility into event processing rates and consumer lag
            across topics.
          </p>
        </Card>
      )}

      {!isLoading && topics.length > 0 && (
        <Card className="p-6">
          <h3 className="text-base font-semibold mb-4">Event Types (Top 5)</h3>
          <div className="space-y-4">
            {topics.map((topic) => (
              <div
                key={topic.id}
                className="flex items-center gap-4 p-4 rounded-lg border border-card-border hover-elevate"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm font-mono">{topic.name}</h4>
                    <Badge variant="secondary">{metrics.topicCounts.get(topic.name)} events</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Estimated rate:{' '}
                      <span className="font-mono text-foreground">{topic.messagesPerSec}/s</span>
                    </span>
                  </div>
                </div>

                <div className="w-32">
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-status-healthy transition-all"
                      style={{
                        width: `${Math.min(((metrics.topicCounts.get(topic.name) || 0) / topicShareDenominator) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!isLoading && data?.events && data.events.length > 0 && (
        <Card className="p-6">
          <h3 className="text-base font-semibold mb-4">Recent Events (Last 10)</h3>
          <div className="space-y-3">
            {data.events.slice(0, 10).map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-4 p-3 rounded-lg border border-card-border hover-elevate text-sm"
              >
                <div className="flex-shrink-0 w-16 text-xs text-muted-foreground font-mono">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {useEventBus ? (
                      <EventTypeBadge eventType={event.type} />
                    ) : (
                      <Badge variant="outline" className="font-mono text-xs">
                        {event.type}
                      </Badge>
                    )}
                    {event.data?.correlationId && (
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        ID:{' '}
                        {event.data.correlationId.length > 8
                          ? `${event.data.correlationId.slice(0, 8)}...`
                          : event.data.correlationId}
                      </span>
                    )}
                  </div>
                  {event.data && Object.keys(event.data).length > 0 && (
                    <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(event.data, null, 2).slice(0, 200)}
                      {JSON.stringify(event.data).length > 200 ? '...' : ''}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!isLoading && (!data?.events || data.events.length === 0) && !isError && (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            No events found. Waiting for new events...
          </p>
        </Card>
      )}
    </div>
  );
}
