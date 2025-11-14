import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { SectionHeader } from "@/components/SectionHeader";
import { Activity, Zap, Database, TrendingUp, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MockBadge } from "@/components/MockBadge";
import { ensureTimeSeries } from "@/components/mockUtils";
import { useState, useMemo } from "react";
import { eventFlowSource, eventBusSource, type EventBusEvent } from "@/lib/data-sources";
import { POLLING_INTERVAL_MEDIUM } from "@/lib/constants/query-config";
import { EventStatisticsPanel } from "@/components/event-bus/EventStatisticsPanel";
import { EventSearchBar } from "@/components/event-bus/EventSearchBar";
import { EventTypeBadge } from "@/components/event-bus/EventTypeBadge";
import { EventBusHealthIndicator } from "@/components/event-bus/EventBusHealthIndicator";
import type { EventQueryOptions } from "@/lib/data-sources";

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

export default function EventFlow() {
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

  // Fetch events from event bus (new API)
  const { data: eventBusData, isLoading: isLoadingBus, isError: isErrorBus, error: errorBus, dataUpdatedAt: busUpdatedAt } = useQuery({
    queryKey: ['event-bus-events', { ...eventBusFilters, ...timeRangeDates }],
    queryFn: () => eventBusSource.queryEvents({
      ...eventBusFilters,
      start_time: timeRangeDates.start,
      end_time: timeRangeDates.end,
    }),
    refetchInterval: POLLING_INTERVAL_MEDIUM,
    refetchOnWindowFocus: true,
    enabled: useEventBus,
  });

  // Fetch events with TanStack Query and polling using old data source (fallback)
  const { data: eventFlowData, isLoading: isLoadingOld, isError: isErrorOld, error: errorOld, dataUpdatedAt: oldUpdatedAt } = useQuery({
    queryKey: ['events', 'stream'],
    queryFn: () => eventFlowSource.fetchEvents(100),
    refetchInterval: POLLING_INTERVAL_MEDIUM,
    refetchOnWindowFocus: true,
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

  // Transform to expected format
  const data: EventStreamResponse = useEventBus ? {
    events: eventBusEvents,
    total: eventBusEvents.length,
  } : (eventFlowData ? {
    events: eventFlowData.events.map(e => ({
      id: e.id,
      type: e.type,
      timestamp: e.timestamp,
      data: e.data,
    })),
    total: eventFlowData.events.length,
  } : { events: [], total: 0 });

  // Calculate metrics from event bus data
  const eventBusMetrics = useMemo(() => {
    if (!eventBusData?.events || !useEventBus) return null;
    const events = eventBusData.events;
    const typeCounts = new Map<string, number>();
    events.forEach(e => {
      typeCounts.set(e.event_type, (typeCounts.get(e.event_type) || 0) + 1);
    });
    return {
      totalEvents: events.length,
      uniqueTypes: typeCounts.size,
      eventsPerMinute: events.length / ((timeRangeDates.end.getTime() - timeRangeDates.start.getTime()) / 60000),
      avgProcessingTime: 0, // Not available from event bus
      topicCounts: typeCounts,
    };
  }, [eventBusData, useEventBus, timeRangeDates]);

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
  const throughputDataRaw = useEventBus ? [] : (eventFlowData?.chartData?.throughput || []);
  const { data: throughputData, isMock: isThroughputMock } = ensureTimeSeries(throughputDataRaw, 10, 6);

  const lagDataRaw = useEventBus ? [] : (eventFlowData?.chartData?.lag || []);
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

  const totalThroughput = topics.reduce((sum, t) => sum + t.messagesPerSec, 0);

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUseEventBus(!useEventBus)}
          >
            {useEventBus ? 'Using Event Bus API' : 'Using Legacy API'}
          </Button>
        </div>
      </div>

      {useEventBus && (
        <>
          <EventSearchBar
            eventTypes={[]}
            onFilterChange={(filters) => setEventBusFilters({ ...eventBusFilters, ...filters })}
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
          value={isLoading ? "..." : metrics.totalEvents.toString()}
          icon={Activity}
          status={isError ? "error" : "healthy"}
        />
        <MetricCard
          label="Event Types"
          value={isLoading ? "..." : metrics.uniqueTypes.toString()}
          icon={Database}
          status={isError ? "error" : "healthy"}
        />
        <MetricCard
          label="Events/min"
          value={isLoading ? "..." : metrics.eventsPerMinute.toString()}
          icon={Zap}
          status={isError ? "error" : "healthy"}
        />
        <MetricCard
          label="Avg Processing"
          value={isLoading ? "..." : `${metrics.avgProcessingTime}ms`}
          icon={Clock}
          status={isError ? "error" : "healthy"}
        />
      </div>

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
          <RealtimeChart
            title="Event Lag (seconds)"
            data={lagData}
            color="hsl(var(--chart-5))"
          />
        </div>
      </div>

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
                    <span>Estimated rate: <span className="font-mono text-foreground">{topic.messagesPerSec}/s</span></span>
                  </div>
                </div>

                <div className="w-32">
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-status-healthy transition-all"
                      style={{ width: `${Math.min((metrics.topicCounts.get(topic.name) || 0) / metrics.totalEvents * 100, 100)}%` }}
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
                        ID: {event.data.correlationId.slice(0, 8)}...
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
