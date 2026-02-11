/**
 * Event Bus Monitor Dashboard (OMN-2095)
 *
 * Real-time Kafka event stream visualization for ONEX platform.
 * Uses server-side projection for event aggregation and the
 * useProjectionStream hook for efficient data fetching.
 *
 * Architecture: pure renderer — all buffering, deduplication, sorting,
 * and time-series computation happen server-side in EventBusProjection.
 * The client handles UI concerns: filtering, pausing, search, display.
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
import { useProjectionStream } from '@/hooks/useProjectionStream';
import type { ProjectionEvent } from '@/hooks/useProjectionStream.types';
import {
  fetchEventBusSnapshot,
  type EventBusPayload,
} from '@/lib/data-sources/event-bus-projection-source';
import { extractParsedDetails, type ParsedDetails } from '@/components/event-bus/eventDetailUtils';
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
import { Activity, Filter, X, Pause, Play, Eye, EyeOff, AlertTriangle } from 'lucide-react';
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

/** Display-oriented event derived from ProjectionEvent */
interface DisplayEvent {
  id: string;
  topic: string;
  topicRaw: string;
  eventType: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  timestamp: Date;
  timestampRaw: string;
  source: string;
  correlationId?: string;
  payload: string;
  summary: string;
  normalizedType: string;
  parsedDetails: ParsedDetails | null;
}

interface PausedSnapshot {
  events: DisplayEvent[];
  topicBreakdown: Record<string, number>;
  eventTypeBreakdown: Record<string, number>;
  timeSeries: Array<{ bucketKey: number; count: number }>;
  eventsPerSecond: number;
  errorCount: number;
  activeTopics: number;
  totalEvents: number;
}

// ============================================================================
// Constants
// ============================================================================

const eventConfig = getEventMonitoringConfig();
const monitoredTopics = getMonitoredTopics();
const TIME_SERIES_BUCKET_MS = 15_000;

// ============================================================================
// Mapping: ProjectionEvent → DisplayEvent
// ============================================================================

function mapSeverityToPriority(
  severity: ProjectionEvent['severity']
): 'critical' | 'high' | 'normal' | 'low' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'error':
      return 'high';
    case 'warning':
      return 'normal';
    case 'info':
      return 'low';
  }
}

function toDisplayEvent(event: ProjectionEvent): DisplayEvent {
  const payloadStr = JSON.stringify(event.payload);
  const parsedDetails = extractParsedDetails(payloadStr, event.type);
  const normalizedType = computeNormalizedType(event.type, parsedDetails);

  // Use a single fallback time so timestamp and timestampRaw are always consistent
  const effectiveTimeMs = event.eventTimeMs > 0 ? event.eventTimeMs : Date.now();
  const timestampRaw = new Date(effectiveTimeMs).toISOString();

  return {
    id: event.id,
    topic: getTopicLabel(event.topic),
    topicRaw: event.topic,
    eventType: event.type,
    priority: mapSeverityToPriority(event.severity),
    timestamp: new Date(effectiveTimeMs),
    timestampRaw,
    source: event.source || 'system',
    correlationId: event.payload?.correlationId as string | undefined,
    payload: payloadStr,
    summary: generateSummary(event.type, parsedDetails, event),
    normalizedType,
    parsedDetails,
  };
}

function computeNormalizedType(eventType: string, details: ParsedDetails | null): string {
  if (details?.toolName) return details.toolName;
  if (details?.selectedAgent) return `route:${details.selectedAgent}`;
  if (/^v\d+$/.test(eventType)) {
    return details?.actionName || details?.actionType || 'unknown';
  }
  return eventType;
}

function generateSummary(
  eventType: string,
  details: ParsedDetails | null,
  event: ProjectionEvent
): string {
  if (!details) {
    const actionName = event.payload?.actionType || event.payload?.action_type;
    if (actionName && typeof actionName === 'string') {
      return actionName.length > 60 ? actionName.slice(0, 57) + '...' : actionName;
    }
    return eventType.length > 60 ? eventType.slice(0, 57) + '...' : eventType;
  }

  if (details.toolName) {
    const filePath = findFilePath(event.payload);
    if (filePath) {
      return `${details.toolName} ${filePath.split('/').pop() || filePath}`;
    }
    return details.toolName;
  }

  if (details.nodeId) {
    return `${details.nodeId} — ${details.healthStatus || details.status || 'healthy'}`;
  }

  if (details.selectedAgent) {
    const conf = details.confidence;
    const confStr = typeof conf === 'number' ? ` (${Math.round(conf * 100)}%)` : '';
    return `Selected ${details.selectedAgent}${confStr}`;
  }

  if (details.error) {
    const errorType = details.actionType || 'Error';
    const msg = details.error.length > 50 ? details.error.slice(0, 47) + '...' : details.error;
    return `${errorType}: ${msg}`;
  }

  if (details.actionName) {
    return details.actionName.length > 60
      ? details.actionName.slice(0, 57) + '...'
      : details.actionName;
  }

  return eventType.length > 60 ? eventType.slice(0, 57) + '...' : eventType;
}

function findFilePath(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.file_path === 'string') return payload.file_path;
  if (typeof payload.filePath === 'string') return payload.filePath;
  for (const key of ['content', 'details', 'data']) {
    const nested = payload[key];
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>;
      if (typeof n.file_path === 'string') return n.file_path;
      if (typeof n.filePath === 'string') return n.filePath;
    }
  }
  return undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

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

function toLiveEvent(event: DisplayEvent) {
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

function toRecentEvent(event: DisplayEvent) {
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

const OTHER_THRESHOLD_SHARE = 0.03;
const OTHER_THRESHOLD_COUNT = 2;

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
  const [maxEvents, setMaxEvents] = useState(eventConfig.max_events);

  // Server-side projection replaces useEventBusStream
  const {
    data: snapshot,
    isLoading,
    isConnected: wsConnected,
  } = useProjectionStream<EventBusPayload>('event-bus', fetchEventBusSnapshot, {
    limit: maxEvents,
    refetchInterval: 2000,
  });

  // Map ProjectionEvents to display format (memoized).
  // Keyed on cursor + totalEventsIngested rather than the events array reference,
  // which changes on every poll cycle even when data hasn't changed.
  // Edge cases handled:
  //   cursor 0→0: benign — "no events" both before and after reset.
  //   cursor N→reset→N: detected via totalEventsIngested, which resets to 0
  //     on server restart and re-increments independently of cursor. Even if
  //     cursor happens to reach the same value N, totalEventsIngested will differ.
  const displayEvents = useMemo((): DisplayEvent[] => {
    if (!snapshot?.payload?.events) return [];
    return snapshot.payload.events.map(toDisplayEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.cursor, snapshot?.payload?.totalEventsIngested]);

  // Extract aggregates from snapshot
  const snapshotPayload = snapshot?.payload;
  const eventsPerSecond = snapshotPayload?.eventsPerSecond ?? 0;
  const errorCount = snapshotPayload?.errorCount ?? 0;
  const activeTopicsCount = snapshotPayload?.activeTopics ?? 0;

  // Connection status: require both snapshot data AND WebSocket connectivity
  // to show "connected". This prevents false "Live Data" when Kafka is down
  // but the snapshot endpoint still returns stale/empty data.
  const isConnected = !isLoading && !!snapshot && wsConnected;

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

  // Paused snapshot
  const pausedSnapshotRef = useRef<PausedSnapshot | null>(null);
  const wasPausedRef = useRef(false);

  // Chart snapshot cache
  const chartSnapshotRef = useRef<{
    eventTypeBreakdownData: Array<{ name: string; eventType: string; eventCount: number }>;
    timeSeriesData: Array<{ time: number; timestamp: string; name: string; events: number }>;
  } | null>(null);

  // Capture snapshot on pause transition
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) {
      pausedSnapshotRef.current = {
        events: displayEvents,
        topicBreakdown: snapshotPayload?.topicBreakdown ?? {},
        eventTypeBreakdown: snapshotPayload?.eventTypeBreakdown ?? {},
        timeSeries: snapshotPayload?.timeSeries ?? [],
        eventsPerSecond,
        errorCount,
        activeTopics: activeTopicsCount,
        totalEvents: displayEvents.length,
      };
      wasPausedRef.current = true;
    } else if (!isPaused && wasPausedRef.current) {
      pausedSnapshotRef.current = null;
      wasPausedRef.current = false;
    }
  }, [isPaused, displayEvents, snapshotPayload, eventsPerSecond, errorCount, activeTopicsCount]);

  // Source data (paused or live)
  const sourceData = useMemo(() => {
    if (isPaused && pausedSnapshotRef.current) {
      return pausedSnapshotRef.current;
    }
    return {
      events: displayEvents,
      topicBreakdown: snapshotPayload?.topicBreakdown ?? {},
      eventTypeBreakdown: snapshotPayload?.eventTypeBreakdown ?? {},
      timeSeries: snapshotPayload?.timeSeries ?? [],
      eventsPerSecond,
      errorCount,
      activeTopics: activeTopicsCount,
      totalEvents: displayEvents.length,
    };
  }, [isPaused, displayEvents, snapshotPayload, eventsPerSecond, errorCount, activeTopicsCount]);

  // Last update time
  const lastUpdate = useMemo(() => {
    if (snapshot?.snapshotTimeMs) {
      return new Date(snapshot.snapshotTimeMs);
    }
    return new Date();
  }, [snapshot?.snapshotTimeMs]);

  // ============================================================================
  // Topic Status Data
  // ============================================================================

  const [statusTick, setStatusTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStatusTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const topicStatusData = useMemo(() => {
    void statusTick;

    const now = Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
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

    statusRows.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return b.eventCount - a.eventCount;
    });

    return statusRows;
  }, [sourceData.events, statusTick]);

  const topicsLoadedCount = useMemo(
    () => topicStatusData.filter((t) => t.eventCount > 0).length,
    [topicStatusData]
  );

  // ============================================================================
  // Filtered Data
  // ============================================================================

  const filteredData = useMemo((): DashboardData => {
    const { events: srcEvents } = sourceData;

    // Apply filters
    const filtered =
      !filters.topic && !filters.priority && !filters.search && !hideHeartbeats
        ? srcEvents
        : srcEvents.filter((event) => {
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
                (event.parsedDetails?.selectedAgent?.toLowerCase().includes(searchLower) ??
                  false) ||
                (event.parsedDetails?.actionName?.toLowerCase().includes(searchLower) ?? false);
              if (!matchesSearch) return false;
            }
            return true;
          });

    const displayedEvents = filtered.slice(0, maxEvents);

    // Compute chart data from displayed events
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

    // Chart snapshot cache
    if (eventTypeBreakdownData.length > 0) {
      chartSnapshotRef.current = {
        eventTypeBreakdownData,
        timeSeriesData,
      };
    }

    const effectiveBreakdown =
      eventTypeBreakdownData.length > 0
        ? eventTypeBreakdownData
        : (chartSnapshotRef.current?.eventTypeBreakdownData ?? []);
    const effectiveTimeSeries =
      timeSeriesData.length > 0 ? timeSeriesData : (chartSnapshotRef.current?.timeSeriesData ?? []);

    // Error rate: count both 'critical' and 'high' priority (maps from 'error' severity),
    // matching the server's errorCount which tracks severity 'error' + 'critical'.
    const errorRate =
      displayedEvents.length > 0
        ? Math.round(
            (displayedEvents.filter((e) => e.priority === 'critical' || e.priority === 'high')
              .length /
              displayedEvents.length) *
              10000
          ) / 100
        : 0;

    return {
      totalEvents: displayedEvents.length,
      eventsPerSecond: sourceData.eventsPerSecond,
      errorRate,
      activeTopics: topicsLoadedCount,
      dlqCount: displayedEvents.filter((e) => e.priority === 'critical').length,
      recentEvents: displayedEvents.map(toRecentEvent),
      liveEvents: displayedEvents.map(toLiveEvent),
      topicBreakdownData,
      eventTypeBreakdownData: effectiveBreakdown,
      timeSeriesData: effectiveTimeSeries,
      topicHealth: [],
    };
  }, [sourceData, filters, maxEvents, hideHeartbeats, topicsLoadedCount]);

  // Clear chart snapshot when topic filter changes
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

  const hasActiveFilters = filters.topic || filters.priority || filters.search || hideHeartbeats;

  // Staleness detection
  const stalenessInfo = useMemo(() => {
    const STALENESS_THRESHOLD_MS = 10 * 60 * 1000;
    const now = Date.now();
    const allEvents = sourceData.events;

    const nonHeartbeatEvents = allEvents.filter(
      (e) => !e.topicRaw.includes('heartbeat') && !e.eventType.toLowerCase().includes('heartbeat')
    );

    const hasOnlyHeartbeats = nonHeartbeatEvents.length === 0 && allEvents.length > 0;
    const hasNoEvents = allEvents.length === 0;

    if (hasNoEvents) return { stale: false, hasOnlyHeartbeats: false } as const;
    if (hasOnlyHeartbeats) return { stale: true, hasOnlyHeartbeats: true } as const;

    const newest = nonHeartbeatEvents.reduce(
      (latest, e) => (e.timestamp.getTime() > latest.timestamp.getTime() ? e : latest),
      nonHeartbeatEvents[0]
    );
    const ageMs = now - newest.timestamp.getTime();

    if (ageMs <= STALENESS_THRESHOLD_MS) return { stale: false, hasOnlyHeartbeats: false } as const;

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
  }, [sourceData.events]);

  // ============================================================================
  // Dashboard config splits
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
        </div>
      </div>

      {/* Staleness Warning Banner */}
      {stalenessInfo.stale && (
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
      )}

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
      <DashboardRenderer config={kpiConfig} data={filteredData} isLoading={isLoading} />

      {/* Topics + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[340px]">
        <TopicSelector
          topics={topicStatusData}
          selectedTopic={filters.topic}
          onSelectTopic={(topic) => setFilters((prev) => ({ ...prev, topic: topic }))}
        />

        <DashboardRenderer config={chartsConfig} data={filteredData} isLoading={isLoading} />
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
        isLoading={isLoading}
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
