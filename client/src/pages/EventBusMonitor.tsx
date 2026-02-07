/**
 * Event Bus Monitor Dashboard
 *
 * Real-time Kafka event stream visualization for ONEX platform.
 * Uses useEventBusStream hook for live event streaming and displays
 * events through the contract-driven dashboard renderer.
 *
 * Features:
 * - Real-time event streaming via WebSocket
 * - Topic health monitoring
 * - Event filtering and search
 * - Throughput and error rate metrics
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  eventBusDashboardConfig,
  getEventMonitoringConfig,
  getTopicLabel,
  getTopicMetadata,
  getEventTypeLabel,
  getMonitoredTopics,
} from '@/lib/configs/event-bus-dashboard';
import { useEventBusStream } from '@/hooks/useEventBusStream';
import type {
  ProcessedEvent,
  TopicBreakdownItem,
  EventTypeBreakdownItem,
  TimeSeriesItem,
} from '@/hooks/useEventBusStream.types';
import { TIME_SERIES_BUCKET_MS } from '@/hooks/useEventBusStream.utils';
import type { DashboardData } from '@/lib/dashboard-schema';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, RefreshCw, Filter, X, Pause, Play, Eye, EyeOff } from 'lucide-react';
import {
  EventDetailPanel,
  type EventDetailPanelProps,
} from '@/components/event-bus/EventDetailPanel';
import { TopicSelector, type TopicStatusRow } from '@/components/event-bus/TopicSelector';

// ============================================================================
// Types
// ============================================================================

interface FilterState {
  topic: string | null;
  priority: string | null;
  search: string;
}

interface PausedSnapshot {
  events: ProcessedEvent[];
  topicBreakdown: TopicBreakdownItem[];
  eventTypeBreakdown: EventTypeBreakdownItem[];
  timeSeries: TimeSeriesItem[];
  totalEvents: number;
  eventsPerSecond: number;
  errorRate: number;
  activeTopics: number;
}

// ============================================================================
// Constants
// ============================================================================

const eventConfig = getEventMonitoringConfig();
const monitoredTopics = getMonitoredTopics();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a timestamp as a relative time string (e.g., "5s ago", "2m ago").
 * Falls back to absolute time for events older than 1 hour.
 */
function formatRelativeTime(timestamp: string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'just now';
  if (diffMs < 1000) return 'just now';
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return date.toLocaleDateString();
}

/**
 * Map event priority to UI type for EventFeed display.
 */
function mapPriorityToType(priority: string): 'info' | 'success' | 'warning' | 'error' {
  switch (priority) {
    case 'critical':
      return 'error';
    case 'high':
      return 'warning';
    case 'normal':
      return 'info';
    case 'low':
      return 'success';
    default:
      return 'info';
  }
}

/**
 * Convert ProcessedEvent to live event format for EventFeed widget.
 */
function toLiveEvent(event: ProcessedEvent) {
  return {
    id: event.id,
    timestamp: event.timestampRaw,
    type: mapPriorityToType(event.priority),
    severity: mapPriorityToType(event.priority),
    message: `${event.eventType} from ${event.source}`,
    source: event.topicRaw,
    topicRaw: event.topicRaw,
    topic: event.topic,
    priority: event.priority,
    eventType: event.eventType,
  };
}

/**
 * Convert ProcessedEvent to recent event format for table.
 */
function toRecentEvent(event: ProcessedEvent) {
  return {
    id: event.id,
    topic: event.topic,
    topicRaw: event.topicRaw,
    eventType: getEventTypeLabel(event.eventType),
    summary: event.summary,
    source: event.source,
    timestamp: formatRelativeTime(event.timestampRaw),
    timestampSort: event.timestampRaw,
    priority: event.priority,
    correlationId: event.correlationId,
    payload: event.payload,
  };
}

// ============================================================================
// Component
// ============================================================================

export default function EventBusMonitor() {
  // Max events state - controls how many events the hook retains
  const [maxEvents, setMaxEvents] = useState(eventConfig.max_events);

  // Stream hook provides events, metrics, and connection management
  const {
    events,
    metrics,
    topicBreakdown,
    eventTypeBreakdown,
    timeSeries,
    connectionStatus,
    stats,
    connect,
  } = useEventBusStream({
    maxItems: maxEvents,
  });

  // UI state
  const [filters, setFilters] = useState<FilterState>({
    topic: null,
    priority: null,
    search: '',
  });
  const [selectedEvent, setSelectedEvent] = useState<EventDetailPanelProps['event']>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hideHeartbeats, setHideHeartbeats] = useState(false);

  // Paused snapshot - captures state when pausing
  const pausedSnapshotRef = useRef<PausedSnapshot | null>(null);
  // Track previous pause state to detect transitions
  const wasPausedRef = useRef(false);

  // Capture snapshot only on transition from unpaused -> paused
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) {
      // Transition: unpaused -> paused - capture snapshot once
      pausedSnapshotRef.current = {
        events,
        topicBreakdown,
        eventTypeBreakdown,
        timeSeries,
        totalEvents: metrics.totalEvents,
        eventsPerSecond: metrics.eventsPerSecond,
        errorRate: metrics.errorRate,
        activeTopics: metrics.activeTopics,
      };
      wasPausedRef.current = true;
    } else if (!isPaused && wasPausedRef.current) {
      // Transition: paused -> unpaused - clear snapshot
      pausedSnapshotRef.current = null;
      wasPausedRef.current = false;
    }
  }, [isPaused, events, topicBreakdown, eventTypeBreakdown, timeSeries, metrics]);

  // Use paused snapshot or live data
  const sourceData = useMemo(() => {
    if (isPaused && pausedSnapshotRef.current) {
      return pausedSnapshotRef.current;
    }
    return {
      events,
      topicBreakdown,
      eventTypeBreakdown,
      timeSeries,
      totalEvents: metrics.totalEvents,
      eventsPerSecond: metrics.eventsPerSecond,
      errorRate: metrics.errorRate,
      activeTopics: metrics.activeTopics,
    };
  }, [isPaused, events, topicBreakdown, eventTypeBreakdown, timeSeries, metrics]);

  // Last update time for display
  const lastUpdate = useMemo(() => {
    if (stats.lastEventAt) {
      return new Date(stats.lastEventAt);
    }
    return new Date();
  }, [stats.lastEventAt]);

  // ============================================================================
  // Topic Status Data
  // ============================================================================

  const topicStatusData = useMemo(() => {
    const now = Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    const statusRows = monitoredTopics.map((topic) => {
      const topicEvents = sourceData.events.filter((e) => e.topicRaw === topic);
      const eventCount = topicEvents.length;
      const lastEvent = topicEvents.length > 0 ? topicEvents[0] : null;
      const lastEventAt = lastEvent ? lastEvent.timestampRaw : null;

      let lastEventFormatted: string;
      if (!lastEventAt) {
        lastEventFormatted = 'never';
      } else {
        const diffMs = now - new Date(lastEventAt).getTime();
        if (diffMs > TWENTY_FOUR_HOURS_MS) {
          lastEventFormatted = '>24h ago';
        } else {
          lastEventFormatted = formatRelativeTime(lastEventAt);
        }
      }

      let status: 'active' | 'silent' | 'error';
      if (lastEventAt && now - new Date(lastEventAt).getTime() <= FIVE_MINUTES_MS) {
        status = 'active';
      } else {
        status = 'silent';
      }

      return {
        topic,
        label: getTopicLabel(topic),
        category: getTopicMetadata(topic)?.category || 'unknown',
        eventCount,
        lastEventAt,
        lastEventFormatted,
        status,
      };
    });

    // Sort: active first, then silent; within each group, by eventCount desc
    statusRows.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return b.eventCount - a.eventCount;
    });

    return statusRows;
  }, [sourceData.events]);

  // ============================================================================
  // Filtered Data
  // ============================================================================

  const filteredData = useMemo((): DashboardData => {
    const { events: srcEvents } = sourceData;

    // Quick path: no filters active - but still compute charts from displayed events
    if (!filters.topic && !filters.priority && !filters.search && !hideHeartbeats) {
      const displayedEvents = srcEvents.slice(0, maxEvents);
      const liveEvents = displayedEvents.map(toLiveEvent);
      const recentEvents = displayedEvents.map(toRecentEvent);

      // Compute chart data from displayed events (respects maxEvents)
      const topicCounts: Record<string, number> = {};
      const eventTypeCounts: Record<string, number> = {};
      const timeBuckets: Record<number, number> = {};

      for (const event of displayedEvents) {
        topicCounts[event.topicRaw] = (topicCounts[event.topicRaw] || 0) + 1;
        eventTypeCounts[event.normalizedType] = (eventTypeCounts[event.normalizedType] || 0) + 1;
        const bucketTime =
          Math.floor(event.timestamp.getTime() / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;
        timeBuckets[bucketTime] = (timeBuckets[bucketTime] || 0) + 1;
      }

      const topicBreakdownData = Object.entries(topicCounts).map(([topic, count]) => ({
        name: getTopicLabel(topic),
        topic,
        eventCount: count,
      }));

      const eventTypeBreakdownData = Object.entries(eventTypeCounts).map(([eventType, count]) => ({
        name: getEventTypeLabel(eventType),
        eventType,
        eventCount: count,
      }));

      const timeSeriesData = Object.entries(timeBuckets)
        .map(([time, count]) => {
          const date = new Date(Number(time));
          const formattedTime = `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
          return {
            time: Number(time),
            timestamp: formattedTime,
            name: formattedTime,
            events: count,
          };
        })
        .sort((a, b) => a.time - b.time);

      return {
        totalEvents: displayedEvents.length,
        eventsPerSecond: sourceData.eventsPerSecond,
        errorRate: sourceData.errorRate,
        activeTopics: topicBreakdownData.length,
        dlqCount: displayedEvents.filter((e) => e.priority === 'critical').length,
        recentEvents,
        liveEvents,
        topicBreakdownData,
        eventTypeBreakdownData,
        timeSeriesData,
        topicHealth: [],
      };
    }

    // Filter events
    const filtered = srcEvents.filter((event) => {
      if (
        hideHeartbeats &&
        (event.topicRaw.includes('heartbeat') ||
          event.eventType.toLowerCase().includes('heartbeat'))
      )
        return false;
      if (filters.topic && event.topicRaw !== filters.topic) return false;
      if (filters.priority && event.priority !== filters.priority) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          event.eventType.toLowerCase().includes(searchLower) ||
          event.source.toLowerCase().includes(searchLower) ||
          event.topic.toLowerCase().includes(searchLower) ||
          event.summary.toLowerCase().includes(searchLower) ||
          (event.parsedDetails?.toolName?.toLowerCase().includes(searchLower) ?? false) ||
          (event.parsedDetails?.nodeId?.toLowerCase().includes(searchLower) ?? false) ||
          (event.parsedDetails?.selectedAgent?.toLowerCase().includes(searchLower) ?? false) ||
          (event.parsedDetails?.actionName?.toLowerCase().includes(searchLower) ?? false);
        if (!matchesSearch) return false;
      }
      return true;
    });

    // Recalculate breakdowns from filtered events
    const topicCounts: Record<string, number> = {};
    const eventTypeCounts: Record<string, number> = {};
    const timeBuckets: Record<number, number> = {};

    for (const event of filtered) {
      topicCounts[event.topicRaw] = (topicCounts[event.topicRaw] || 0) + 1;
      eventTypeCounts[event.normalizedType] = (eventTypeCounts[event.normalizedType] || 0) + 1;
      const bucketTime =
        Math.floor(event.timestamp.getTime() / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;
      timeBuckets[bucketTime] = (timeBuckets[bucketTime] || 0) + 1;
    }

    const filteredTopicBreakdown = Object.entries(topicCounts).map(([topic, count]) => ({
      name: getTopicLabel(topic),
      topic,
      eventCount: count,
    }));

    const filteredEventTypeBreakdown = Object.entries(eventTypeCounts).map(
      ([eventType, count]) => ({
        name: getEventTypeLabel(eventType),
        eventType,
        eventCount: count,
      })
    );

    const filteredTimeSeries = Object.entries(timeBuckets)
      .map(([time, count]) => {
        const date = new Date(Number(time));
        const formattedTime = `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        return {
          time: Number(time),
          timestamp: formattedTime,
          name: formattedTime,
          events: count,
        };
      })
      .sort((a, b) => a.time - b.time);

    return {
      totalEvents: filtered.length,
      eventsPerSecond: sourceData.eventsPerSecond,
      errorRate: sourceData.errorRate,
      activeTopics: filteredTopicBreakdown.length,
      dlqCount: filtered.filter((e) => e.priority === 'critical').length,
      recentEvents: filtered.slice(0, maxEvents).map(toRecentEvent),
      liveEvents: filtered.slice(0, maxEvents).map(toLiveEvent),
      topicBreakdownData: filteredTopicBreakdown,
      eventTypeBreakdownData: filteredEventTypeBreakdown,
      timeSeriesData: filteredTimeSeries,
      topicHealth: [],
    };
  }, [sourceData, filters, maxEvents, hideHeartbeats]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const clearFilters = useCallback(() => {
    setFilters({ topic: null, priority: null, search: '' });
  }, []);

  const handleEventClick = useCallback((widgetId: string, row: Record<string, unknown>) => {
    if (widgetId === 'table-recent-events') {
      setSelectedEvent({
        id: String(row.id || ''),
        topic: String(row.topic || ''),
        topicRaw: String(row.topicRaw || row.topic || ''),
        eventType: String(row.eventType || ''),
        source: String(row.source || ''),
        timestamp: String(row.timestamp || ''),
        priority: String(row.priority || 'normal'),
        correlationId: row.correlationId ? String(row.correlationId) : undefined,
        payload: row.payload ? String(row.payload) : undefined,
      });
      setIsPanelOpen(true);
    }
  }, []);

  // ============================================================================
  // Derived State
  // ============================================================================

  const hasActiveFilters = filters.topic || filters.priority || filters.search || hideHeartbeats;
  const isConnected = connectionStatus === 'connected';
  const eventCount = stats.totalReceived;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            {eventBusDashboardConfig.name}
          </h1>
          <p className="text-muted-foreground mt-1">{eventBusDashboardConfig.description}</p>
        </div>

        <div className="flex items-center gap-4">
          {isConnected && (
            <Badge variant="default" className="bg-green-600 hover:bg-green-700 gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-100"></span>
              </span>
              Live Data
            </Badge>
          )}

          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{eventCount.toLocaleString()}</span> events
          </div>

          <div className="text-sm text-muted-foreground">
            Updated: {lastUpdate.toLocaleTimeString()}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="gap-2"
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            )}
          </Button>

          {!isConnected && connectionStatus !== 'connecting' && (
            <Button variant="outline" size="sm" onClick={connect} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Reconnect
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <Select
            value={filters.topic || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, topic: value === 'all' ? null : value }))
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Topics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Topics</SelectItem>
              {monitoredTopics.map((topic) => (
                <SelectItem key={topic} value={topic}>
                  {getTopicLabel(topic)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.priority || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, priority: value === 'all' ? null : value }))
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1 max-w-xs">
            <Input
              placeholder="Search events..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              className="h-9"
            />
          </div>

          <Button
            variant={hideHeartbeats ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHideHeartbeats(!hideHeartbeats)}
            className="gap-1.5"
          >
            {hideHeartbeats ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Heartbeats
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Max events:</span>
            <Select
              value={String(maxEvents)}
              onValueChange={(value) => setMaxEvents(Number(value))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventConfig.max_events_options.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}

          <div className="flex items-center gap-2">
            {filters.topic && (
              <Badge variant="secondary" className="gap-1">
                Topic: {getTopicLabel(filters.topic)}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setFilters((prev) => ({ ...prev, topic: null }))}
                />
              </Badge>
            )}
            {filters.priority && (
              <Badge variant="secondary" className="gap-1">
                Priority: {filters.priority}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setFilters((prev) => ({ ...prev, priority: null }))}
                />
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Topic Selector */}
      <TopicSelector
        topics={topicStatusData}
        selectedTopic={filters.topic}
        onSelectTopic={(topic) => setFilters((prev) => ({ ...prev, topic: topic }))}
      />

      {/* Context Header -- only shown when a topic is selected */}
      {filters.topic && (
        <Card className="p-3 flex items-center justify-between border-l-4 border-l-primary bg-accent/30">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Events for: {getTopicLabel(filters.topic)}</span>
            <span className="text-xs text-muted-foreground font-mono">({filters.topic})</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters((prev) => ({ ...prev, topic: null }))}
            className="gap-1 h-7"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </Card>
      )}

      {/* Dashboard Renderer */}
      <DashboardRenderer
        config={eventBusDashboardConfig}
        data={filteredData}
        isLoading={connectionStatus === 'connecting'}
        onWidgetRowClick={handleEventClick}
      />

      {/* Event Detail Panel */}
      <EventDetailPanel event={selectedEvent} open={isPanelOpen} onOpenChange={setIsPanelOpen} />
    </div>
  );
}
