import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardSection } from "@/components/DashboardSection";
import { Activity, Zap, Database, Clock, Download, CalendarIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MockDataBadge } from "@/components/MockDataBadge";
import { ensureTimeSeries } from "@/components/mockUtils";
import { useState, useMemo } from "react";
import { eventFlowSource } from "@/lib/data-sources";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

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
  const [pollingInterval] = useState(30000); // 30 seconds
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Fetch events with TanStack Query and polling using data source
  const { data: eventFlowData, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['events', 'stream'],
    queryFn: () => eventFlowSource.fetchEvents(100),
    refetchInterval: pollingInterval,
    refetchOnWindowFocus: true,
  });

  // Transform to expected format
  const data: EventStreamResponse = eventFlowData ? {
    events: eventFlowData.events.map(e => ({
      id: e.id,
      type: e.type,
      timestamp: e.timestamp,
      data: e.data,
    })),
    total: eventFlowData.events.length,
  } : { events: [], total: 0 };

  // Use metrics and chart data from data source
  const metrics = useMemo(() => {
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
  }, [eventFlowData]);

  // Use chart data from data source
  const throughputDataRaw = eventFlowData?.chartData?.throughput || [];
  const { data: throughputData, isMock: isThroughputMock } = ensureTimeSeries(throughputDataRaw, 10, 6);

  const lagDataRaw = eventFlowData?.chartData?.lag || [];
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

  // Check if using mock data
  const usingMockData = isThroughputMock || isLagMock;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading event flow data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* STANDARD HEADER PATTERN */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Event Flow</h1>
          <p className="ty-subtitle">
            Real-time event stream from omniarchon intelligence infrastructure
            {dataUpdatedAt ? ` • Last updated: ${lastUpdateTime}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {usingMockData && <MockDataBadge />}
          <Button variant="outline" size="sm" disabled={!data || isError}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>

          {/* TIME RANGE CONTROLS WITH DIVIDER */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
            <Button
              variant={timeRange === "1h" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("1h")}
            >
              1H
            </Button>
            <Button
              variant={timeRange === "24h" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("24h")}
            >
              24H
            </Button>
            <Button
              variant={timeRange === "7d" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("7d")}
            >
              7D
            </Button>
            <Button
              variant={timeRange === "30d" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("30d")}
            >
              30D
            </Button>

            {/* Custom date range picker */}
            <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
              <PopoverTrigger asChild>
                <Button
                  variant={timeRange === "custom" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                >
                  <CalendarIcon className="h-4 w-4" />
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={(range) => {
                    setCustomRange(range);
                    if (range?.from && range?.to) {
                      handleTimeRangeChange("custom");
                      setShowCustomPicker(false);
                    }
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Show selected custom range */}
            {timeRange === "custom" && customRange?.from && customRange?.to && (
              <span className="text-sm text-muted-foreground">
                {format(customRange.from, "MMM d")} - {format(customRange.to, "MMM d, yyyy")}
              </span>
            )}
          </div>
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

      {/* METRIC CARDS IN DASHBOARDSECTION */}
      <DashboardSection title="Event Stream Metrics">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Events"
            value={metrics.totalEvents.toString()}
            icon={Activity}
            status={isError ? "error" : "healthy"}
          />
          <MetricCard
            label="Event Types"
            value={metrics.uniqueTypes.toString()}
            icon={Database}
            status={isError ? "error" : "healthy"}
          />
          <MetricCard
            label="Events/min"
            value={metrics.eventsPerMinute.toString()}
            icon={Zap}
            status={isError ? "error" : "healthy"}
          />
          <MetricCard
            label="Avg Processing"
            value={`${metrics.avgProcessingTime}ms`}
            icon={Clock}
            status={isError ? "error" : "healthy"}
          />
        </div>
      </DashboardSection>

      <div className="grid grid-cols-2 gap-6">
        <div>
          {isThroughputMock && <MockDataBadge label="Mock Data: Event Throughput" />}
          <RealtimeChart
            title="Event Throughput (by minute)"
            data={throughputData}
            color="hsl(var(--chart-4))"
            showArea
          />
        </div>
        <div>
          {isLagMock && <MockDataBadge label="Mock Data: Event Lag" />}
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
