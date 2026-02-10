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
  topicMatchesSuffix,
  normalizeToSuffix,
} from '@/lib/configs/event-bus-dashboard';
import { useEventBusStream } from '@/hooks/useEventBusStream';
import type {
  ProcessedEvent,
  TopicBreakdownItem,
  EventTypeBreakdownItem,
  TimeSeriesItem,
  BurstInfo,
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
import {
  Activity,
  RefreshCw,
  Filter,
  X,
  Pause,
  Play,
  Eye,
  EyeOff,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import {
  EventDetailPanel,
  type EventDetailPanelProps,
  type FilterRequest,
} from '@/components/event-bus/EventDetailPanel';
import { TopicSelector } from '@/components/event-bus/TopicSelector';

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
  burstInfo: BurstInfo;
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
 * Falls back to absolute date for events older than 24 hours.
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
// Chart Bucketing
// ============================================================================

/** Minimum share (0..1) for an event type to avoid being collapsed into "Other" */
const OTHER_THRESHOLD_SHARE = 0.03;
/** Minimum absolute count for an event type to avoid being collapsed into "Other" */
const OTHER_THRESHOLD_COUNT = 2;

/**
 * Aggregate small event-type slices into an "Other" bucket.
 * Types with <3% share OR <2 events get merged, unless that would merge everything.
 */
function bucketSmallTypes(
  items: Array<{ name: string; eventType: string; eventCount: number }>
): Array<{ name: string; eventType: string; eventCount: number }> {
  const total = items.reduce((sum, i) => sum + i.eventCount, 0);
  if (total === 0) return items;

  const kept: typeof items = [];
  let otherCount = 0;

  for (const item of items) {
    const share = item.eventCount / total;
    if (share < OTHER_THRESHOLD_SHARE || item.eventCount < OTHER_THRESHOLD_COUNT) {
      otherCount += item.eventCount;
    } else {
      kept.push(item);
    }
  }

  // If everything collapsed, just return original — don't show a single "Other" bar
  if (kept.length === 0) return items;

  if (otherCount > 0) {
    kept.push({ name: 'Other', eventType: 'other', eventCount: otherCount });
  }

  return kept;
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
    burstInfo,
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

  // Chart snapshot — prevents blank charts when old events expire from the
  // bounded buffer while a topic filter is active. Cleared on filter change.
  const chartSnapshotRef = useRef<{
    eventTypeBreakdownData: Array<{ name: string; eventType: string; eventCount: number }>;
    timeSeriesData: Array<{ time: number; timestamp: string; name: string; events: number }>;
  } | null>(null);

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
        burstInfo,
      };
      wasPausedRef.current = true;
    } else if (!isPaused && wasPausedRef.current) {
      // Transition: paused -> unpaused - clear snapshot
      pausedSnapshotRef.current = null;
      wasPausedRef.current = false;
    }
  }, [isPaused, events, topicBreakdown, eventTypeBreakdown, timeSeries, metrics, burstInfo]);

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
      burstInfo,
    };
  }, [isPaused, events, topicBreakdown, eventTypeBreakdown, timeSeries, metrics, burstInfo]);

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

  // Tick counter forces topicStatusData to recompute every 30 seconds so that
  // topic statuses properly decay from "active" to "silent" even when no new
  // events arrive.  Without this, the useMemo only runs when sourceData.events
  // changes, leaving stale "active" badges indefinitely.
  const [statusTick, setStatusTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStatusTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const topicStatusData = useMemo(() => {
    // statusTick is read here so the linter keeps it in the dep array; the
    // actual value is unused — it just forces a periodic recomputation.
    void statusTick;

    const now = Date.now();
    const MONITORING_WINDOW_MS = eventConfig.monitoring_window_ms;
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    const statusRows = monitoredTopics.map((topic) => {
      const topicEvents = sourceData.events.filter((e) => topicMatchesSuffix(e.topicRaw, topic));
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
      if (lastEventAt && now - new Date(lastEventAt).getTime() <= MONITORING_WINDOW_MS) {
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
  }, [sourceData.events, statusTick]);

  // Derive Topics Loaded KPI — count of topics with any events in the current buffer
  const activeTopicsCount = useMemo(
    () => topicStatusData.filter((t) => t.eventCount > 0).length,
    [topicStatusData]
  );

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

      const eventTypeBreakdownRaw = Object.entries(eventTypeCounts).map(([eventType, count]) => ({
        name: getEventTypeLabel(eventType),
        eventType,
        eventCount: count,
      }));
      const eventTypeBreakdownData = bucketSmallTypes(eventTypeBreakdownRaw);

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
        activeTopics: activeTopicsCount,
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
      if (filters.topic && !topicMatchesSuffix(event.topicRaw, filters.topic)) return false;
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

    const filteredEventTypeBreakdownRaw = Object.entries(eventTypeCounts).map(
      ([eventType, count]) => ({
        name: getEventTypeLabel(eventType),
        eventType,
        eventCount: count,
      })
    );
    const filteredEventTypeBreakdown = bucketSmallTypes(filteredEventTypeBreakdownRaw);

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

    // Cache non-empty chart data so charts don't go blank when old events
    // expire from the bounded buffer while a topic filter is active.
    if (filteredEventTypeBreakdown.length > 0) {
      chartSnapshotRef.current = {
        eventTypeBreakdownData: filteredEventTypeBreakdown,
        timeSeriesData: filteredTimeSeries,
      };
    }

    // Fall back to cached chart data when current computation yields nothing
    const effectiveBreakdown =
      filteredEventTypeBreakdown.length > 0
        ? filteredEventTypeBreakdown
        : (chartSnapshotRef.current?.eventTypeBreakdownData ?? []);
    const effectiveTimeSeries =
      filteredTimeSeries.length > 0
        ? filteredTimeSeries
        : (chartSnapshotRef.current?.timeSeriesData ?? []);

    return {
      totalEvents: filtered.length,
      eventsPerSecond: sourceData.eventsPerSecond,
      errorRate: sourceData.errorRate,
      activeTopics: activeTopicsCount,
      dlqCount: filtered.filter((e) => e.priority === 'critical').length,
      recentEvents: filtered.slice(0, maxEvents).map(toRecentEvent),
      liveEvents: filtered.slice(0, maxEvents).map(toLiveEvent),
      topicBreakdownData: filteredTopicBreakdown,
      eventTypeBreakdownData: effectiveBreakdown,
      timeSeriesData: effectiveTimeSeries,
      topicHealth: [],
    };
  }, [sourceData, filters, maxEvents, hideHeartbeats, activeTopicsCount]);

  // Clear chart snapshot when topic filter changes so stale data doesn't linger
  useEffect(() => {
    chartSnapshotRef.current = null;
  }, [filters.topic]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const clearFilters = useCallback(() => {
    setFilters({ topic: null, priority: null, search: '' });
  }, []);

  const handleFilterRequest = useCallback((filter: FilterRequest) => {
    switch (filter.type) {
      case 'topic':
        // Normalize env-prefixed topic to suffix so TopicSelector highlight matches
        setFilters((prev) => ({ ...prev, topic: normalizeToSuffix(filter.value) }));
        break;
      case 'source':
        setFilters((prev) => ({ ...prev, search: filter.value }));
        break;
      case 'search':
        setFilters((prev) => ({ ...prev, search: filter.value }));
        break;
    }
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

  const hasActiveFilters = filters.priority || filters.search || hideHeartbeats;
  const isConnected = connectionStatus === 'connected';

  // Labels for burst/staleness banners (stable — config is module-level constant)
  const burstLabel = `${Math.round(eventConfig.burst_window_ms / 1000)}s`;
  const monitoringLabel = `${Math.round(eventConfig.monitoring_window_ms / 60000)}-min`;

  // Staleness detection — computed from ALL events (unfiltered), excluding heartbeats
  const stalenessInfo = useMemo(() => {
    const STALENESS_THRESHOLD_MS = eventConfig.staleness_threshold_ms;
    const now = Date.now();
    const allEvents = sourceData.events;

    const nonHeartbeatEvents = allEvents.filter(
      (e) => !e.topicRaw.includes('heartbeat') && !e.eventType.toLowerCase().includes('heartbeat')
    );

    const hasOnlyHeartbeats = nonHeartbeatEvents.length === 0 && allEvents.length > 0;
    const hasNoEvents = allEvents.length === 0;

    if (hasNoEvents) return { stale: false, hasOnlyHeartbeats: false } as const;
    if (hasOnlyHeartbeats) return { stale: true, hasOnlyHeartbeats: true } as const;

    // Find the newest non-heartbeat event
    const newest = nonHeartbeatEvents.reduce(
      (latest, e) => (e.timestamp.getTime() > latest.timestamp.getTime() ? e : latest),
      nonHeartbeatEvents[0]
    );
    const ageMs = now - newest.timestamp.getTime();

    if (ageMs <= STALENESS_THRESHOLD_MS) return { stale: false, hasOnlyHeartbeats: false } as const;

    // Format the age
    let ageStr: string;
    if (ageMs < 3600000) ageStr = `${Math.floor(ageMs / 60000)}m`;
    else if (ageMs < 86400000) ageStr = `${Math.floor(ageMs / 3600000)}h`;
    else ageStr = `${Math.floor(ageMs / 86400000)}d`;

    return {
      stale: true,
      hasOnlyHeartbeats: false,
      ageStr,
      newestTopic: newest.topic,
      newestTimestamp: newest.timestamp.toLocaleString(),
    } as const;
  }, [sourceData.events, eventConfig.staleness_threshold_ms]);

  // ============================================================================
  // Burst / Staleness Banner
  // ============================================================================

  const burstBanner = useMemo(() => {
    const activeBurst = sourceData.burstInfo;

    if (stalenessInfo.stale) {
      return (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm">
            {stalenessInfo.hasOnlyHeartbeats ? (
              'Only heartbeats detected — no application events in the buffer'
            ) : (
              <>
                No new non-heartbeat events in{' '}
                <span className="font-semibold">{stalenessInfo.ageStr}</span>
                {' — '}producers may not be emitting.
                <span className="text-amber-300/70 ml-2">
                  Newest: {stalenessInfo.newestTimestamp} ({stalenessInfo.newestTopic})
                </span>
              </>
            )}
          </span>
        </div>
      );
    }

    if (activeBurst.errorSpike) {
      return (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-200">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-sm">
            Error spike detected:{' '}
            <span className="font-semibold">{activeBurst.shortWindowErrorRate.toFixed(1)}%</span>{' '}
            error rate in the last {burstLabel} ({monitoringLabel} avg:{' '}
            {activeBurst.baselineErrorRate.toFixed(1)}%)
          </span>
        </div>
      );
    }

    if (activeBurst.throughputBurst) {
      return (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-200">
          <Zap className="h-4 w-4 text-cyan-400 flex-shrink-0" />
          <span className="text-sm">
            Burst detected:{' '}
            <span className="font-semibold">
              {activeBurst.shortWindowRate.toFixed(1)} events/sec
            </span>{' '}
            in the last {burstLabel} ({monitoringLabel} avg: {activeBurst.baselineRate.toFixed(1)}
            /sec)
          </span>
        </div>
      );
    }

    return null;
  }, [sourceData.burstInfo, stalenessInfo, burstLabel, monitoringLabel]);

  // ============================================================================
  // Split dashboard config: KPIs, Charts, Table
  // ============================================================================

  const kpiConfig = useMemo(
    () => ({
      ...eventBusDashboardConfig,
      dashboard_id: 'event-bus-kpis',
      widgets: eventBusDashboardConfig.widgets.filter(
        (w) => w.config.config_kind === 'metric_card'
      ),
    }),
    []
  );

  const chartsConfig = useMemo(
    () => ({
      ...eventBusDashboardConfig,
      dashboard_id: 'event-bus-charts',
      widgets: eventBusDashboardConfig.widgets
        .filter((w) => w.config.config_kind === 'chart')
        .map((w) => ({ ...w, row: w.row - 1 })),
    }),
    []
  );

  const tableConfig = useMemo(
    () => ({
      ...eventBusDashboardConfig,
      dashboard_id: 'event-bus-table',
      widgets: eventBusDashboardConfig.widgets
        .filter((w) => w.config.config_kind === 'table')
        .map((w) => ({ ...w, row: 0 })),
    }),
    []
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
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

      {/* Priority Banners: Staleness > Error Spike > Throughput Burst */}
      {burstBanner}

      {/* Filters */}
      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Filters
            </span>
          </div>

          <Select
            value={filters.priority || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, priority: value === 'all' ? null : value }))
            }
          >
            <SelectTrigger className="w-[130px] h-8 text-xs">
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
              className="h-8 text-xs"
            />
          </div>

          <Button
            variant={hideHeartbeats ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHideHeartbeats(!hideHeartbeats)}
            className="gap-1.5 h-8 text-xs"
          >
            {hideHeartbeats ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Heartbeats
          </Button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Max:</span>
            <Select
              value={String(maxEvents)}
              onValueChange={(value) => setMaxEvents(Number(value))}
            >
              <SelectTrigger className="w-[80px] h-8 text-xs">
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
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-8 text-xs">
              <X className="h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
        </div>
      </Card>

      {/* KPI Metric Cards */}
      <DashboardRenderer
        config={kpiConfig}
        data={filteredData}
        isLoading={connectionStatus === 'connecting'}
      />

      {/* Topics + Charts — single row, fixed height so neither child can overflow */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[340px]">
        <TopicSelector
          topics={topicStatusData}
          selectedTopic={filters.topic}
          onSelectTopic={(topic) => setFilters((prev) => ({ ...prev, topic: topic }))}
        />

        <DashboardRenderer
          config={chartsConfig}
          data={filteredData}
          isLoading={connectionStatus === 'connecting'}
        />
      </div>

      {/* Context line + active filter banner */}
      <div className="space-y-2">
        {filters.topic && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-primary" />
              <span className="text-sm font-semibold">{getTopicLabel(filters.topic)}</span>
              <span className="text-[11px] text-muted-foreground font-mono">{filters.topic}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, topic: null }))}
              className="gap-1 h-6 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear filter
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground px-1">
          Showing last {Number(filteredData.totalEvents ?? 0).toLocaleString()} events, newest first
          {isPaused && <span className="text-amber-500 font-medium"> · paused</span>}
          {hideHeartbeats && <span> · heartbeats hidden</span>}
          {filters.topic && (
            <span>
              {' '}
              · <span className="font-medium">{getTopicLabel(filters.topic)}</span>
            </span>
          )}
          {filters.search && (
            <span>
              {' '}
              · search: "<span className="font-medium">{filters.search}</span>"
            </span>
          )}
        </div>
      </div>

      {/* Event Table */}
      <DashboardRenderer
        config={tableConfig}
        data={filteredData}
        isLoading={connectionStatus === 'connecting'}
        onWidgetRowClick={handleEventClick}
      />

      {/* Event Detail Panel */}
      <EventDetailPanel
        event={selectedEvent}
        open={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        onFilterRequest={handleFilterRequest}
      />
    </div>
  );
}
