/**
 * Event Bus Monitor Dashboard
 *
 * Real-time Kafka event stream visualization for ONEX platform.
 * Uses WebSocket connection for live event streaming and displays
 * events through the contract-driven dashboard renderer.
 *
 * Features:
 * - Real-time event streaming via WebSocket
 * - Topic health monitoring
 * - Event filtering and search
 * - Throughput and error rate metrics
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  eventBusDashboardConfig,
  MONITORED_TOPICS,
  TOPIC_METADATA,
  type EventHeaders,
} from '@/lib/configs/event-bus-dashboard';
import { useWebSocket } from '@/hooks/useWebSocket';
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
import { Activity, RefreshCw, Filter, X, Pause, Play } from 'lucide-react';
import {
  EventDetailPanel,
  type EventDetailPanelProps,
} from '@/components/event-bus/EventDetailPanel';

interface WebSocketEventMessage {
  type: string;
  data?: unknown;
  timestamp?: string;
}

interface EventBusEvent {
  topic: string;
  key: string | null;
  value: unknown;
  headers: Partial<EventHeaders>;
  offset: string;
  partition: number;
  timestamp: string;
}

interface FilterState {
  topic: string | null;
  priority: string | null;
  search: string;
}

// Types for chart/breakdown data structures
interface TopicBreakdownItem {
  name: string;
  topic: string;
  eventCount: number;
}

interface EventTypeBreakdownItem {
  name: string;
  eventType: string;
  eventCount: number;
}

interface TimeSeriesItem {
  time: number;
  timestamp: string;
  events: number;
}

// Types for initial state data from WebSocket
interface InitialStateEventData {
  id?: string;
  correlationId?: string;
  actionType?: string;
  agentName?: string;
  sourceAgent?: string;
  selectedAgent?: string;
  createdAt?: string;
  timestamp?: string;
  priority?: string;
  severity?: string;
  headers?: { priority?: string };
}

// Type for agent metrics
interface AgentMetric {
  agentName: string;
  [key: string]: unknown;
}

// Configurable limits
const DEFAULT_MAX_EVENTS = 50; // Default maximum events
const MAX_EVENTS_OPTIONS = [50, 100, 200, 500, 1000];
const TIME_SERIES_WINDOW_MS = 5 * 60 * 1000; // 5 minute window for time series

export default function EventBusMonitor() {
  // Dashboard state - starts empty, populated by real Kafka events via WebSocket
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalEvents: 0,
    eventsPerSecond: 0,
    errorRate: 0,
    activeTopics: 0,
    recentEvents: [],
    liveEvents: [],
    topicBreakdownData: [],
    eventTypeBreakdownData: [],
    timeSeriesData: [],
    topicHealth: [],
  });
  const [eventCount, setEventCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [maxEvents, setMaxEvents] = useState(DEFAULT_MAX_EVENTS);

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    topic: null,
    priority: null,
    search: '',
  });

  // Event detail panel state
  const [selectedEvent, setSelectedEvent] = useState<EventDetailPanelProps['event']>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Event buffer for real-time updates (reserved for future batching)
  const [_eventBuffer, _setEventBuffer] = useState<EventBusEvent[]>([]);

  // Sliding window for throughput calculation (event timestamps from last 60 seconds)
  const eventTimestampsRef = useRef<number[]>([]);
  // Counter for periodic cleanup to avoid array allocation on every event
  const eventCountSinceCleanupRef = useRef(0);
  const CLEANUP_INTERVAL = 100; // Clean up stale timestamps every 100 events

  // Convert various event types to a unified format for display
  const createEventEntry = useCallback((eventType: string, data: any, topic: string) => {
    const id =
      data.id || data.correlationId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timestamp = data.createdAt || data.timestamp || new Date().toISOString();

    // Honor upstream priority when available, with fallback to error-based detection
    const priority =
      data.priority ??
      data.severity ??
      data.headers?.priority ??
      (data.actionType === 'error' ? 'critical' : 'normal');

    return {
      id,
      topic,
      topicRaw: topic,
      eventType,
      source: data.agentName || data.sourceAgent || data.selectedAgent || 'system',
      timestamp: typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString(),
      priority,
      correlationId: data.correlationId,
      payload: JSON.stringify(data),
    };
  }, []);

  // Update dashboard with a new event
  const updateDashboardWithEvent = useCallback(
    (event: any) => {
      // Update sliding window for throughput calculation
      const now = Date.now();
      const oneMinuteAgo = now - 60000;

      // Push new timestamp (no array allocation)
      eventTimestampsRef.current.push(now);
      eventCountSinceCleanupRef.current++;

      // Periodic cleanup: only filter stale timestamps every CLEANUP_INTERVAL events
      // This avoids creating a new array on every event while still maintaining accuracy
      if (eventCountSinceCleanupRef.current >= CLEANUP_INTERVAL) {
        eventTimestampsRef.current = eventTimestampsRef.current.filter((t) => t > oneMinuteAgo);
        eventCountSinceCleanupRef.current = 0;
      }

      // Count recent events without creating a new array (avoids GC pressure)
      let recentCount = 0;
      for (let i = 0; i < eventTimestampsRef.current.length; i++) {
        if (eventTimestampsRef.current[i] > oneMinuteAgo) {
          recentCount++;
        }
      }

      // Calculate events per second (count / 60 seconds, rounded to 1 decimal)
      const eventsPerSecond = Math.round((recentCount / 60) * 10) / 10;

      setDashboardData((prev) => {
        const recentEvents = Array.isArray(prev.recentEvents) ? prev.recentEvents : [];
        const liveEvents = Array.isArray(prev.liveEvents) ? prev.liveEvents : [];

        const newLiveEvent = {
          id: event.id,
          timestamp: event.timestamp,
          type: mapPriorityToType(event.priority),
          severity: mapPriorityToType(event.priority),
          message: `${event.eventType} from ${event.source}`,
          source: event.topicRaw,
          // Include fields needed for filtering
          topicRaw: event.topicRaw,
          topic: event.topic,
          priority: event.priority,
          eventType: event.eventType,
        };

        // Update totals
        const totalEvents = (typeof prev.totalEvents === 'number' ? prev.totalEvents : 0) + 1;
        const isError = event.priority === 'critical';
        const errorCount = isError
          ? ((prev.dlqCount as number) || 0) + 1
          : (prev.dlqCount as number) || 0;
        const errorRate = totalEvents > 0 ? (errorCount / totalEvents) * 100 : 0;

        // Update topic breakdown data
        const topicBreakdownData: TopicBreakdownItem[] = Array.isArray(prev.topicBreakdownData)
          ? [...(prev.topicBreakdownData as TopicBreakdownItem[])]
          : [];
        const topicIndex = topicBreakdownData.findIndex((t) => t.topic === event.topicRaw);
        if (topicIndex >= 0) {
          topicBreakdownData[topicIndex] = {
            ...topicBreakdownData[topicIndex],
            eventCount: (topicBreakdownData[topicIndex].eventCount || 0) + 1,
          };
        } else {
          // Add new topic
          topicBreakdownData.push({
            name: TOPIC_METADATA[event.topicRaw]?.label || event.topicRaw,
            topic: event.topicRaw,
            eventCount: 1,
          });
        }

        // Update event type breakdown data
        const eventTypeBreakdownData: EventTypeBreakdownItem[] = Array.isArray(
          prev.eventTypeBreakdownData
        )
          ? [...(prev.eventTypeBreakdownData as EventTypeBreakdownItem[])]
          : [];
        const eventTypeIndex = eventTypeBreakdownData.findIndex(
          (t) => t.eventType === event.eventType
        );
        if (eventTypeIndex >= 0) {
          eventTypeBreakdownData[eventTypeIndex] = {
            ...eventTypeBreakdownData[eventTypeIndex],
            eventCount: (eventTypeBreakdownData[eventTypeIndex].eventCount || 0) + 1,
          };
        } else {
          // Add new event type
          eventTypeBreakdownData.push({
            name: event.eventType,
            eventType: event.eventType,
            eventCount: 1,
          });
        }

        // Update time series data (aggregate by 10-second buckets)
        const timeSeriesData: TimeSeriesItem[] = Array.isArray(prev.timeSeriesData)
          ? [...(prev.timeSeriesData as TimeSeriesItem[])]
          : [];
        const bucketTime = Math.floor(now / 10000) * 10000; // 10-second buckets
        const bucketIndex = timeSeriesData.findIndex((t) => t.time === bucketTime);
        if (bucketIndex >= 0) {
          timeSeriesData[bucketIndex] = {
            ...timeSeriesData[bucketIndex],
            events: (timeSeriesData[bucketIndex].events || 0) + 1,
          };
        } else {
          // Add new time bucket
          timeSeriesData.push({
            time: bucketTime,
            timestamp: new Date(bucketTime).toLocaleTimeString(),
            events: 1,
          });
        }
        // Keep only last 5 minutes of data
        const cutoffTime = now - TIME_SERIES_WINDOW_MS;
        const filteredTimeSeries = timeSeriesData
          .filter((t) => t.time > cutoffTime)
          .sort((a, b) => a.time - b.time);

        return {
          ...prev,
          totalEvents,
          eventsPerSecond,
          dlqCount: errorCount,
          errorRate: Math.round(errorRate * 100) / 100,
          activeTopics: topicBreakdownData.length,
          recentEvents: [event, ...recentEvents].slice(0, maxEvents),
          liveEvents: [newLiveEvent, ...liveEvents].slice(0, maxEvents),
          topicBreakdownData,
          eventTypeBreakdownData,
          timeSeriesData: filteredTimeSeries,
        };
      });
    },
    [maxEvents]
  );

  // Process incoming WebSocket messages
  const handleMessage = useCallback(
    (message: WebSocketEventMessage) => {
      if (isPaused) return;

      setLastUpdate(new Date());

      switch (message.type) {
        // Connection status messages (don't count as events)
        case 'CONNECTED':
        case 'SUBSCRIPTION_UPDATED':
        case 'PONG':
          return; // These are system messages, not events

        case 'CONSUMER_STATUS': {
          // Consumer connected/disconnected status - no action needed
          return;
        }

        case 'INITIAL_STATE': {
          // Handle initial state from server - populate dashboard with historical data
          const state = message.data as Record<string, unknown>;
          if (state) {
            // Convert actions to dashboard format
            const recentActions = (state.recentActions as InitialStateEventData[]) || [];
            const routingDecisions = (state.routingDecisions as InitialStateEventData[]) || [];
            const recentTransformations =
              (state.recentTransformations as InitialStateEventData[]) || [];

            const events = [
              ...recentActions.map((a) =>
                createEventEntry(a.actionType || 'action', a, 'agent-actions')
              ),
              ...routingDecisions.map((d) =>
                createEventEntry('routing', d, 'agent-routing-decisions')
              ),
              ...recentTransformations.map((t) =>
                createEventEntry('transformation', t, 'agent-transformation-events')
              ),
            ]
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, maxEvents);

            // Compute topic breakdown from events
            const topicCounts: Record<string, number> = {};
            events.forEach((e) => {
              topicCounts[e.topicRaw] = (topicCounts[e.topicRaw] || 0) + 1;
            });
            const topicBreakdownData = Object.entries(topicCounts).map(([topic, count]) => ({
              name: TOPIC_METADATA[topic]?.label || topic,
              topic,
              eventCount: count,
            }));

            // Compute event type breakdown from events
            const eventTypeCounts: Record<string, number> = {};
            events.forEach((e) => {
              eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] || 0) + 1;
            });
            const eventTypeBreakdownData = Object.entries(eventTypeCounts).map(
              ([eventType, count]) => ({
                name: eventType,
                eventType,
                eventCount: count,
              })
            );

            setEventCount(events.length);
            setDashboardData((prev) => {
              // Merge topic breakdown: combine INITIAL_STATE data with any existing data (e.g., from heartbeats)
              const existingTopics: TopicBreakdownItem[] = Array.isArray(prev.topicBreakdownData)
                ? (prev.topicBreakdownData as TopicBreakdownItem[])
                : [];
              const mergedTopicBreakdown: TopicBreakdownItem[] = [...topicBreakdownData];
              existingTopics.forEach((existing) => {
                const idx = mergedTopicBreakdown.findIndex((t) => t.topic === existing.topic);
                if (idx >= 0) {
                  // Topic exists in both - keep the higher count (they shouldn't overlap)
                  mergedTopicBreakdown[idx].eventCount = Math.max(
                    mergedTopicBreakdown[idx].eventCount,
                    existing.eventCount
                  );
                } else {
                  // Topic only in existing (e.g., heartbeats arrived before INITIAL_STATE)
                  mergedTopicBreakdown.push(existing);
                }
              });

              // Merge event type breakdown similarly
              const existingEventTypes: EventTypeBreakdownItem[] = Array.isArray(
                prev.eventTypeBreakdownData
              )
                ? (prev.eventTypeBreakdownData as EventTypeBreakdownItem[])
                : [];
              const mergedEventTypeBreakdown: EventTypeBreakdownItem[] = [
                ...eventTypeBreakdownData,
              ];
              existingEventTypes.forEach((existing) => {
                const idx = mergedEventTypeBreakdown.findIndex(
                  (t) => t.eventType === existing.eventType
                );
                if (idx >= 0) {
                  mergedEventTypeBreakdown[idx].eventCount = Math.max(
                    mergedEventTypeBreakdown[idx].eventCount,
                    existing.eventCount
                  );
                } else {
                  mergedEventTypeBreakdown.push(existing);
                }
              });

              return {
                ...prev,
                totalEvents: events.length,
                eventsPerSecond: 0,
                errorRate: 0,
                activeTopics: mergedTopicBreakdown.length,
                recentEvents: events,
                topicBreakdownData: mergedTopicBreakdown,
                eventTypeBreakdownData: mergedEventTypeBreakdown,
                liveEvents: events.slice(0, 20).map((e) => ({
                  id: e.id,
                  timestamp: e.timestamp,
                  type: mapPriorityToType(e.priority),
                  severity: mapPriorityToType(e.priority),
                  message: `${e.eventType} from ${e.source}`,
                  source: e.topicRaw,
                })),
              };
            });
          }
          break;
        }

        case 'AGENT_ACTION': {
          setEventCount((c) => c + 1);
          const action = message.data as any;
          if (action) {
            const event = createEventEntry(action.actionType || 'action', action, 'agent-actions');
            updateDashboardWithEvent(event);
          }
          break;
        }

        case 'ROUTING_DECISION': {
          setEventCount((c) => c + 1);
          const decision = message.data as any;
          if (decision) {
            const event = createEventEntry('routing', decision, 'agent-routing-decisions');
            updateDashboardWithEvent(event);
          }
          break;
        }

        case 'AGENT_TRANSFORMATION': {
          setEventCount((c) => c + 1);
          const transformation = message.data as any;
          if (transformation) {
            const event = createEventEntry(
              'transformation',
              transformation,
              'agent-transformation-events'
            );
            updateDashboardWithEvent(event);
          }
          break;
        }

        case 'PERFORMANCE_METRIC': {
          setEventCount((c) => c + 1);
          const { metric, stats } = (message.data as any) || {};
          if (metric) {
            const event = createEventEntry('performance', metric, 'router-performance-metrics');
            updateDashboardWithEvent(event);
            // Also update performance stats with NaN guard
            if (stats) {
              const totalQueries = Number(stats.totalQueries);
              if (Number.isFinite(totalQueries)) {
                setDashboardData((prev) => ({
                  ...prev,
                  eventsPerSecond: Math.round((totalQueries / 3600) * 10) / 10,
                }));
              }
            }
          }
          break;
        }

        case 'NODE_INTROSPECTION':
        case 'NODE_HEARTBEAT':
        case 'NODE_STATE_CHANGE':
        case 'NODE_REGISTRY_UPDATE': {
          setEventCount((c) => c + 1);
          const nodeData = message.data as any;
          if (nodeData) {
            const topicMap: Record<string, string> = {
              NODE_INTROSPECTION: 'dev.omninode_bridge.onex.evt.node-introspection.v1',
              NODE_HEARTBEAT: 'node.heartbeat',
              NODE_STATE_CHANGE: 'dev.onex.evt.registration-completed.v1',
              NODE_REGISTRY_UPDATE:
                'dev.omninode_bridge.onex.evt.registry-request-introspection.v1',
            };
            const topic = topicMap[message.type] || 'node.events';
            const event = createEventEntry(
              message.type.toLowerCase().replace('node_', ''),
              nodeData,
              topic
            );
            updateDashboardWithEvent(event);
          }
          break;
        }

        case 'AGENT_METRIC_UPDATE': {
          // Metrics update - don't count as individual events
          const metrics = message.data as AgentMetric[];
          if (Array.isArray(metrics)) {
            setDashboardData((prev) => ({
              ...prev,
              activeTopics: metrics.length,
            }));
          }
          break;
        }

        case 'ERROR': {
          setEventCount((c) => c + 1);
          const error = message.data as { message: string };
          if (error) {
            const event = createEventEntry(
              'error',
              { message: error.message, actionType: 'error' },
              'errors'
            );
            updateDashboardWithEvent(event);
          }
          break;
        }
      }
    },
    [isPaused, createEventEntry, updateDashboardWithEvent, maxEvents]
  );

  // WebSocket connection
  const { isConnected, connectionStatus, reconnect, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleMessage,
    debug: false,
  });

  // Subscribe to all events on connection
  useEffect(() => {
    if (isConnected) {
      // Subscribe to 'all' to receive all event types
      subscribe(['all']);
      return () => unsubscribe(['all']);
    }
  }, [isConnected, subscribe, unsubscribe]);

  // Re-slice event arrays when maxEvents changes to apply limit retroactively
  useEffect(() => {
    setDashboardData((prev) => ({
      ...prev,
      recentEvents: Array.isArray(prev.recentEvents) ? prev.recentEvents.slice(0, maxEvents) : [],
      liveEvents: Array.isArray(prev.liveEvents) ? prev.liveEvents.slice(0, maxEvents) : [],
    }));
  }, [maxEvents]);

  // Filtered data for display
  const filteredData = useMemo(() => {
    if (!filters.topic && !filters.priority && !filters.search) {
      return dashboardData;
    }

    const filterEvents = (events: unknown[]) => {
      if (!Array.isArray(events)) return events;
      return events.filter((event: unknown) => {
        const e = event as Record<string, unknown>;
        if (filters.topic && e.topicRaw !== filters.topic) return false;
        if (filters.priority && e.priority !== filters.priority) return false;
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          const matchesSearch =
            String(e.eventType || '')
              .toLowerCase()
              .includes(searchLower) ||
            String(e.source || '')
              .toLowerCase()
              .includes(searchLower) ||
            String(e.topic || '')
              .toLowerCase()
              .includes(searchLower);
          if (!matchesSearch) return false;
        }
        return true;
      });
    };

    return {
      ...dashboardData,
      recentEvents: filterEvents(dashboardData.recentEvents as unknown[]),
      liveEvents: filterEvents(dashboardData.liveEvents as unknown[]),
    };
  }, [dashboardData, filters]);

  // Clear filters
  const clearFilters = () => {
    setFilters({ topic: null, priority: null, search: '' });
  };

  const hasActiveFilters = filters.topic || filters.priority || filters.search;

  // Handle row click to open event detail panel
  const handleEventClick = useCallback((widgetId: string, row: Record<string, unknown>) => {
    // Only handle clicks from the recent events table
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
          {/* Live Data Badge */}
          {isConnected && (
            <Badge variant="default" className="bg-green-600 hover:bg-green-700 gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-100"></span>
              </span>
              Live Data
            </Badge>
          )}

          {/* Event counter */}
          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{eventCount.toLocaleString()}</span> events
          </div>

          {/* Last update */}
          <div className="text-sm text-muted-foreground">
            Updated: {lastUpdate.toLocaleTimeString()}
          </div>

          {/* Pause/Resume */}
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

          {/* Reconnect button - only show when disconnected */}
          {!isConnected && connectionStatus !== 'connecting' && (
            <Button variant="outline" size="sm" onClick={reconnect} className="gap-2">
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

          {/* Topic filter */}
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
              {MONITORED_TOPICS.map((topic) => (
                <SelectItem key={topic} value={topic}>
                  {TOPIC_METADATA[topic].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority filter */}
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

          {/* Search */}
          <div className="flex-1 max-w-xs">
            <Input
              placeholder="Search events..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              className="h-9"
            />
          </div>

          {/* Event limit */}
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
                {MAX_EVENTS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}

          {/* Active filter badges */}
          <div className="flex items-center gap-2">
            {filters.topic && (
              <Badge variant="secondary" className="gap-1">
                Topic:{' '}
                {TOPIC_METADATA[filters.topic as keyof typeof TOPIC_METADATA]?.label ||
                  filters.topic}
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

      {/* Topic Legend */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-muted-foreground">Topics:</span>
        {MONITORED_TOPICS.map((topic) => (
          <div
            key={topic}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                topic: prev.topic === topic ? null : topic,
              }))
            }
          >
            <div
              className={`h-3 w-3 rounded-full ${
                topic.includes('agent')
                  ? 'bg-blue-500'
                  : topic === 'node.heartbeat'
                    ? 'bg-status-healthy'
                    : 'bg-primary'
              }`}
            />
            <span className={filters.topic === topic ? 'font-medium' : ''}>
              {TOPIC_METADATA[topic]?.label || topic}
            </span>
          </div>
        ))}
      </div>

      {/* Dashboard Renderer */}
      <DashboardRenderer
        config={eventBusDashboardConfig}
        data={filteredData}
        isLoading={connectionStatus === 'connecting'}
        onWidgetRowClick={handleEventClick}
      />

      {/* Event Detail Panel (slide-out) */}
      <EventDetailPanel event={selectedEvent} open={isPanelOpen} onOpenChange={setIsPanelOpen} />
    </div>
  );
}

// Helper function to map priority to event type
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
