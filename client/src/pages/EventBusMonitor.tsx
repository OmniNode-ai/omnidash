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

import { useState, useCallback, useEffect, useMemo } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  eventBusDashboardConfig,
  generateEventBusMockData,
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
import { Activity, Wifi, WifiOff, RefreshCw, Filter, X, Pause, Play } from 'lucide-react';

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

export default function EventBusMonitor() {
  // Dashboard state
  const [dashboardData, setDashboardData] = useState<DashboardData>(() =>
    generateEventBusMockData()
  );
  const [eventCount, setEventCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    topic: null,
    priority: null,
    search: '',
  });

  // Event buffer for real-time updates (reserved for future batching)
  const [_eventBuffer, _setEventBuffer] = useState<EventBusEvent[]>([]);

  // Convert various event types to a unified format for display
  const createEventEntry = useCallback((eventType: string, data: any, topic: string) => {
    const id =
      data.id || data.correlationId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timestamp = data.createdAt || data.timestamp || new Date().toISOString();

    return {
      id,
      topic,
      topicRaw: topic,
      eventType,
      source: data.agentName || data.sourceAgent || data.selectedAgent || 'system',
      timestamp: typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString(),
      priority: data.actionType === 'error' ? 'critical' : 'normal',
      correlationId: data.correlationId,
      payload: JSON.stringify(data).slice(0, 200),
    };
  }, []);

  // Update dashboard with a new event
  const updateDashboardWithEvent = useCallback((event: any) => {
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

      return {
        ...prev,
        totalEvents,
        dlqCount: errorCount,
        errorRate: Math.round(errorRate * 100) / 100,
        recentEvents: [event, ...recentEvents].slice(0, 50),
        liveEvents: [newLiveEvent, ...liveEvents].slice(0, 50),
      };
    });
  }, []);

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
            const recentActions = (state.recentActions as any[]) || [];
            const routingDecisions = (state.routingDecisions as any[]) || [];
            const recentTransformations = (state.recentTransformations as any[]) || [];

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
              .slice(0, 50);

            setEventCount(events.length);
            setDashboardData((prev) => ({
              ...prev,
              totalEvents: events.length,
              eventsPerSecond: 0,
              errorRate: 0,
              activeTopics: 4,
              recentEvents: events,
              liveEvents: events.slice(0, 20).map((e) => ({
                id: e.id,
                timestamp: e.timestamp,
                type: mapPriorityToType(e.priority),
                severity: mapPriorityToType(e.priority),
                message: `${e.eventType} from ${e.source}`,
                source: e.topicRaw,
              })),
            }));
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
            // Also update performance stats
            if (stats) {
              setDashboardData((prev) => ({
                ...prev,
                eventsPerSecond: Math.round((stats.totalQueries / 3600) * 10) / 10,
              }));
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
          const metrics = message.data as any[];
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
    [isPaused, createEventEntry, updateDashboardWithEvent]
  );

  // WebSocket connection
  const { isConnected, connectionStatus, reconnect, subscribe } = useWebSocket({
    onMessage: handleMessage,
    debug: false,
  });

  // Subscribe to all events on connection
  useEffect(() => {
    if (isConnected) {
      // Subscribe to 'all' to receive all event types
      subscribe(['all']);
    }
  }, [isConnected, subscribe]);

  // Refresh mock data periodically when not connected
  useEffect(() => {
    if (!isConnected && !isPaused) {
      const interval = setInterval(() => {
        setDashboardData(generateEventBusMockData());
        setLastUpdate(new Date());
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected, isPaused]);

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

          {/* Connection status */}
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                isConnected
                  ? 'bg-green-500 animate-pulse'
                  : connectionStatus === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-muted-foreground capitalize flex items-center gap-1">
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {connectionStatus}
            </span>
          </div>

          {/* Reconnect button */}
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
      />

      {/* Data Flow Information */}
      <Card className="p-4 bg-muted/50">
        <h3 className="text-sm font-semibold mb-2">Data Flow</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Source:</span> Kafka (
            {isConnected ? 'Live' : 'Mock Data'})
          </div>
          <div>
            <span className="font-medium text-foreground">Transport:</span> WebSocket at{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/ws</code>
          </div>
          <div>
            <span className="font-medium text-foreground">Topics:</span> {MONITORED_TOPICS.length}{' '}
            monitored
          </div>
        </div>
      </Card>
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
