import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { Activity, Zap, Database, TrendingUp, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";

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

// Fetch events from omniarchon
async function fetchEvents(limit: number = 100): Promise<EventStreamResponse> {
  const response = await fetch(`http://localhost:8053/api/intelligence/events/stream?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }
  return response.json();
}

export default function EventFlow() {
  const [pollingInterval] = useState(30000); // 30 seconds
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Fetch events with TanStack Query and polling
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['events', 'stream'],
    queryFn: () => fetchEvents(100),
    refetchInterval: pollingInterval,
    refetchOnWindowFocus: true,
  });

  // Calculate metrics from real event data
  const metrics = useMemo(() => {
    if (!data?.events) {
      return {
        totalEvents: 0,
        uniqueTypes: 0,
        eventsPerMinute: 0,
        avgProcessingTime: 0,
        topicCounts: new Map<string, number>(),
      };
    }

    const events = data.events;
    const typeCount = new Map<string, number>();
    let totalProcessingTime = 0;
    let processingTimeCount = 0;

    events.forEach(event => {
      typeCount.set(event.type, (typeCount.get(event.type) || 0) + 1);
      if (event.data?.durationMs) {
        totalProcessingTime += event.data.durationMs;
        processingTimeCount++;
      }
    });

    // Calculate events per minute from last 100 events
    const now = Date.now();
    const recentEvents = events.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      return (now - eventTime) < 60000; // Last minute
    });

    return {
      totalEvents: events.length,
      uniqueTypes: typeCount.size,
      eventsPerMinute: recentEvents.length,
      avgProcessingTime: processingTimeCount > 0 ? Math.round(totalProcessingTime / processingTimeCount) : 0,
      topicCounts: typeCount,
    };
  }, [data]);

  // Generate chart data from events
  const throughputData = useMemo(() => {
    if (!data?.events) return [];

    // Group events by minute
    const minuteCounts = new Map<string, number>();
    data.events.forEach(event => {
      const time = new Date(event.timestamp);
      const minute = `${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`;
      minuteCounts.set(minute, (minuteCounts.get(minute) || 0) + 1);
    });

    return Array.from(minuteCounts.entries())
      .slice(-20)
      .map(([time, value]) => ({ time, value }));
  }, [data]);

  // Calculate average lag from event timestamps
  const lagData = useMemo(() => {
    if (!data?.events) return [];

    const now = Date.now();
    return data.events
      .slice(-20)
      .map(event => {
        const eventTime = new Date(event.timestamp).getTime();
        const lag = Math.max(0, (now - eventTime) / 1000); // seconds
        return {
          time: new Date(event.timestamp).toLocaleTimeString(),
          value: lag,
        };
      });
  }, [data]);

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
        <div>
          <h1 className="text-3xl font-semibold mb-2">Event Flow</h1>
          <p className="text-muted-foreground">
            Real-time event stream from omniarchon intelligence infrastructure
            {dataUpdatedAt && (
              <span className="ml-2 text-xs">
                • Last updated: {lastUpdateTime}
              </span>
            )}
          </p>
        </div>
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
        <RealtimeChart
          title="Event Throughput (by minute)"
          data={throughputData}
          color="hsl(var(--chart-4))"
          showArea
        />
        <RealtimeChart
          title="Event Lag (seconds)"
          data={lagData}
          color="hsl(var(--chart-5))"
        />
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
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="font-mono text-xs">
                      {event.type}
                    </Badge>
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
