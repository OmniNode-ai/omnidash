import { MetricCard } from "@/components/MetricCard";
import { AgentStatusGrid } from "@/components/AgentStatusGrid";
import { RealtimeChart } from "@/components/RealtimeChart";
import { MockBadge } from "@/components/MockBadge";
import { ensureTimeSeries } from "@/components/mockUtils";
import { EventFeed } from "@/components/EventFeed";
import { DrillDownModal } from "@/components/DrillDownModal";
import { StatusLegend } from "@/components/StatusLegend";
import { EventDetailModal, EventAction } from "@/components/EventDetailModal";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { SectionHeader } from "@/components/SectionHeader";
import { Activity, Cpu, CheckCircle, Clock } from "lucide-react";
import { Module, ModuleHeader, ModuleBody } from "@/components/Module";
import { Pager } from "@/components/Pager";
import { DateRangeFilter, DateRangeValue } from "@/components/DateRangeFilter";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { agentOperationsSource } from "@/lib/data-sources";
import type { HealthStatus } from "@/lib/data-sources/agent-operations-source";
import {
  REALTIME_QUERY_CONFIG,
  QUERY_INVALIDATION_THROTTLE_MS,
} from "@/lib/constants/query-config";

// TypeScript interfaces for API responses
interface AgentMetrics {
  agent: string;
  totalRequests: number;
  successRate: number | null;
  avgRoutingTime: number | null;
  avgConfidence: number | null;
}

interface AgentAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  actionDetails: any;
  debugMode: boolean;
  durationMs: number;
  createdAt: string;
}

// Routing insights are shown in the Routing tab; keep operations focused on live activity

export default function AgentOperations() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventAction | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [chartData, setChartData] = useState<Array<{ time: string; value: number }>>([]);
  const [performanceChartData, setPerformanceChartData] = useState<Array<{ time: string; value: number }>>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(10);
  const [eventsRange, setEventsRange] = useState<DateRangeValue>({ preset: '24h' });

  // Throttle query invalidations to prevent excessive re-renders
  const lastInvalidationRef = useRef<{ [key: string]: number }>({});

  const throttledInvalidate = useCallback((queryKey: string[]) => {
    const key = queryKey.join(':');
    const now = Date.now();
    const lastTime = lastInvalidationRef.current[key] || 0;

    if (now - lastTime > QUERY_INVALIDATION_THROTTLE_MS) {
      lastInvalidationRef.current[key] = now;
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const handleTimeRangeChange = useCallback((value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  }, []);

  // WebSocket for real-time updates with throttled invalidations
  const { isConnected, connectionStatus } = useWebSocket({
    onMessage: useCallback((message: { type: string; data?: any; message?: string; timestamp: string }) => {
      // Throttled query invalidations to prevent excessive re-renders
      switch (message.type) {
        case 'AGENT_METRIC_UPDATE':
          throttledInvalidate([`/api/intelligence/agents/summary`]);
          break;
        case 'AGENT_ACTION':
          throttledInvalidate([`/api/intelligence/actions/recent`]);
          break;
        case 'ROUTING_DECISION':
          // Routing decisions affect metrics
          throttledInvalidate([`/api/intelligence/agents/summary`]);
          break;
        case 'INITIAL_STATE':
          // Refresh all data on initial state (no throttle for initial state)
          queryClient.invalidateQueries();
          break;
        case 'CONSUMER_STATUS':
          // Only invalidate health if status actually changed (reduce noise)
          throttledInvalidate(['/api/intelligence/health']);
          break;
      }
    }, [throttledInvalidate, queryClient]),
    debug: false,
  });

  // Use centralized data source
  const { data: operationsData, isLoading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useQuery({
    queryKey: ['agent-operations', timeRange],
    queryFn: () => agentOperationsSource.fetchAll(timeRange),
    ...REALTIME_QUERY_CONFIG,
  });

  // Transform data source response to expected format
  // Memoize to prevent creating new array references on every render (which would trigger infinite useEffect loops)
  const metrics: AgentMetrics[] = useMemo(() => {
    // Use per-agent metrics if available (shows individual agents)
    if (operationsData?.perAgentMetrics && operationsData.perAgentMetrics.length > 0) {
      return operationsData.perAgentMetrics.map((m: any) => ({
        agent: m.agent,
        totalRequests: m.totalRequests || 0,
        successRate: m.successRate,
        avgRoutingTime: m.avgRoutingTime,
        avgConfidence: m.avgConfidence,
      }));
    }
    // Fallback to aggregate summary (single "all" agent)
    return operationsData?.summary ? [{
      agent: 'all',
      totalRequests: operationsData.summary.totalRuns,
      successRate: operationsData.summary.successRate,
      avgRoutingTime: operationsData.summary.avgExecutionTime,
      avgConfidence: null,
    }] : [];
  }, [operationsData?.summary, operationsData?.perAgentMetrics]);

  const actions: AgentAction[] = useMemo(() => {
    if (!operationsData?.recentActions) return [];

    // Transform RecentAction format to AgentAction format
    return operationsData.recentActions.map((action: any) => ({
      id: action.id,
      correlationId: action.correlationId || action.id,
      agentName: action.agentName,
      actionType: action.actionType || action.action || 'unknown',
      actionName: action.actionName || action.action || 'Unknown Action',
      actionDetails: action.actionDetails || {},
      debugMode: action.debugMode || false,
      durationMs: action.durationMs || action.duration || 0,
      createdAt: action.createdAt || action.timestamp || new Date().toISOString(),
    }));
  }, [operationsData?.recentActions]);

  const health = operationsData?.health;
  const actionsLoading = metricsLoading;
  const actionsError = metricsError;

  // (removed) Routing strategy breakdown to avoid duplication with Routing tab

  // Update chart data when actions change (action rate over time)
  useEffect(() => {
    if (!actions || actions.length === 0) return;

    // Group actions by minute for chart
    const now = new Date();
    const minuteBuckets = new Map<string, number>();

    for (let i = 19; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 1000);
      const timeLabel = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      minuteBuckets.set(timeLabel, 0);
    }

    // Count actions per minute
    actions.forEach(action => {
      const actionTime = new Date(action.createdAt);
      const timeLabel = actionTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      if (minuteBuckets.has(timeLabel)) {
        minuteBuckets.set(timeLabel, minuteBuckets.get(timeLabel)! + 1);
      }
    });

    const newChartData = Array.from(minuteBuckets.entries()).map(([time, value]) => ({
      time,
      value,
    }));

    setChartData(newChartData);
  }, [actions]);

  // Update performance chart - show average execution time per minute
  useEffect(() => {
    if (!actions || actions.length === 0) {
      setPerformanceChartData([]);
      return;
    }

    const now = new Date();
    const minuteBuckets = new Map<string, { total: number; totalDurationMs: number }>();

    // Initialize buckets for last 20 minutes
    for (let i = 19; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 1000);
      const timeLabel = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      minuteBuckets.set(timeLabel, { total: 0, totalDurationMs: 0 });
    }

    // Sum execution times per minute
    actions.forEach(action => {
      const actionTime = new Date(action.createdAt);
      const timeLabel = actionTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      if (minuteBuckets.has(timeLabel)) {
        const entry = minuteBuckets.get(timeLabel)!;
        entry.total += 1;
        entry.totalDurationMs += (action.durationMs || 0);
      }
    });

    // Calculate average execution time per minute (in milliseconds)
    const perfData = Array.from(minuteBuckets.entries()).map(([time, { total, totalDurationMs }]) => ({
      time,
      value: total > 0 ? Math.round(totalDurationMs / total) : 0,
    }));

    setPerformanceChartData(perfData);
  }, [actions]);

  const handleAgentClick = useCallback((agent: any) => {
    setSelectedAgent(agent);
    setPanelOpen(true);
  }, []);

  const handleEventClick = useCallback((event: any) => {
    // Find the corresponding action from the actions array
    const action = actions?.find(a => a.id === event.id);
    if (action) {
      setSelectedEvent(action);
      setEventModalOpen(true);
    }
  }, [actions]);

  // Use summary from data source instead of calculating here
  const aggregatedMetrics = useMemo(() => {
    return {
      activeAgents: operationsData?.summary?.activeAgents || 0,
      totalRequests: operationsData?.summary?.totalRuns || 0,
      avgSuccessRate: operationsData?.summary?.successRate || 0,
      avgResponseTime: (operationsData?.summary?.avgExecutionTime || 0) * 1000, // Convert seconds to ms for display
    };
  }, [operationsData]);

  // Memoize agent grid data to prevent recalculation
  const agents = useMemo(() => {
    return metrics?.map((metric) => {
      // Use confidence score as quality proxy (displayed in agent grid bottom boxes)
      // Clamp quality to 0-100%
      const quality = Math.max(0, Math.min(100, Math.round((metric.avgConfidence || 0) * 100)));
      // Clamp success rate to 0-100%
      const rawRate = (metric.successRate || 0);
      const successRate = Math.max(0, Math.min(100, Math.round(rawRate <= 1 ? rawRate * 100 : rawRate)));

      return {
        id: metric.agent,
        name: metric.agent,
        status: successRate > 90 ? 'active' as const :
                successRate > 70 ? 'idle' as const : 'error' as const,
        currentTask: undefined,
        successRate,
        quality,
        responseTime: Math.round(metric.avgRoutingTime || 0),
        tasksCompleted: metric.totalRequests,
      };
    }) || [];
  }, [metrics]);

  // Visible agents: Active only vs All
  const visibleAgents = useMemo(() => {
    if (!agents?.length) return agents || [];
    return showActiveOnly ? agents.filter(a => a.status === 'active') : agents;
  }, [agents, showActiveOnly]);

  // Memoize events to prevent recalculation
  const eventsAll = useMemo(() => {
    return actions?.map(action => ({
      id: action.id,
      type: 'info' as const,
      message: `${action.agentName}: ${action.actionName}`,
      timestamp: new Date(action.createdAt).toLocaleTimeString(),
      source: action.agentName,
    })) || [];
  }, [actions]);

  const eventsFiltered = useMemo(() => {
    if (!eventsAll.length) return eventsAll;
    // rudimentary filter by days based on preset
    const now = Date.now();
    let cutoff = 0;
    if (eventsRange.preset === '24h') cutoff = now - 24 * 60 * 60 * 1000;
    else if (eventsRange.preset === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    else if (eventsRange.preset === '30d') cutoff = now - 30 * 24 * 60 * 60 * 1000;
    else if (eventsRange.preset === 'custom' && eventsRange.start && eventsRange.end) {
      // keep within custom range
      const startMs = new Date(eventsRange.start).getTime();
      const endMs = new Date(eventsRange.end).getTime() + 24 * 60 * 60 * 1000;
      return eventsAll.filter(e => {
        const t = new Date(`1970-01-01T${e.timestamp}`).getTime(); // fallback: treat as today
        const nowDay = new Date().toDateString();
        const full = new Date(`${nowDay} ${e.timestamp}`).getTime();
        return full >= startMs && full <= endMs;
      });
    }
    if (cutoff > 0) {
      return eventsAll.filter(e => {
        const nowDay = new Date().toDateString();
        const full = new Date(`${nowDay} ${e.timestamp}`).getTime();
        return full >= cutoff;
      });
    }
    return eventsAll;
  }, [eventsAll, eventsRange]);

  const eventsPaged = useMemo(() => {
    const start = (eventsPage - 1) * eventsPageSize;
    return eventsFiltered.slice(start, start + eventsPageSize);
  }, [eventsFiltered, eventsPage, eventsPageSize]);

  // Loading state
  if (metricsLoading || actionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading agent operations data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (metricsError || actionsError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Activity className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <p className="text-destructive font-semibold mb-2">Failed to load agent data</p>
          <p className="text-muted-foreground text-sm">
            {metricsError?.message || actionsError?.message || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Agent Operations"
        description="Real-time monitoring of 52+ AI agents with performance metrics, activity tracking, and event streaming."
        details="The Agent Operations dashboard provides live visibility into all active AI agents across the platform. Monitor request volumes, success rates, response times, and individual agent performance. Use filters to focus on active agents or view historical data. The live event stream shows real-time agent actions and decisions for immediate insight into system behavior."
        level="h2"
      />

      {/* Status legend */}
      <StatusLegend />

      {/* Metric cards with real data */}
      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          label={`Active Agents (${timeRange})`}
          value={aggregatedMetrics.activeAgents}
          icon={Activity}
          status="healthy"
        />
        <MetricCard
          label={`Total Requests (${timeRange})`}
          value={aggregatedMetrics.totalRequests.toLocaleString()}
          icon={Activity}
          status="healthy"
        />
        <MetricCard
          label="Avg Response Time"
          value={`${Math.round(aggregatedMetrics.avgResponseTime)}ms`}
          icon={Clock}
          status={aggregatedMetrics.avgResponseTime < 100 ? "healthy" : "warning"}
          tooltip="Target: < 100ms"
        />
        <MetricCard
          label="Success Rate"
          value={`${Math.max(0, Math.min(100, Math.round(aggregatedMetrics.avgSuccessRate <= 1 ? aggregatedMetrics.avgSuccessRate * 100 : aggregatedMetrics.avgSuccessRate)))}%`}
          icon={CheckCircle}
          status={aggregatedMetrics.avgSuccessRate > 0.9 ? "healthy" : "warning"}
          tooltip="Target: > 90%"
        />
      </div>

      {/* Charts with real activity data */}
      <div className="grid grid-cols-2 gap-6">
        {(() => {
          const ensured = ensureTimeSeries(chartData, 5, 2);
          return (
            <div>
              {ensured.isMock && <MockBadge label="MOCK DATA: Agent Activity" />}
              <RealtimeChart
                title="Agent Activity (Actions per Minute)"
                data={ensured.data}
                color="hsl(var(--chart-1))"
              />
            </div>
          );
        })()}
        {(() => {
          const ensured = ensureTimeSeries(performanceChartData, 150, 60);
          return (
            <div>
              {ensured.isMock && <MockBadge label="MOCK DATA: Agent Performance" />}
              <RealtimeChart
                title="Agent Performance (Avg Execution Time ms)"
                data={ensured.data}
                color="hsl(var(--chart-2))"
                showArea
              />
            </div>
          );
        })()}
      </div>

      {/* (removed) Routing Strategy Breakdown to keep this tab focused on operations */}

      {/* Agent grid and event feed with real data */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        <div className="h-full">
          <Module className="h-full">
            <ModuleHeader
              left={<span className="ty-title">Agents</span>}
              right={
                <>
                  <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Show:</span>
                    <button
                      className={`px-3 py-1 rounded border ${showActiveOnly ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      onClick={() => setShowActiveOnly(true)}
                    >
                      Active
                    </button>
                    <button
                      className={`px-3 py-1 rounded border ${!showActiveOnly ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      onClick={() => setShowActiveOnly(false)}
                    >
                      All
                    </button>
                  </div>
                </>
              }
            />
            <ModuleBody>
              {showActiveOnly && visibleAgents.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground flex items-center justify-between border rounded">
                  <span>No active agents right now.</span>
                  <button
                    className="px-3 py-1 rounded border"
                    onClick={() => setShowActiveOnly(false)}
                  >
                    Show All
                  </button>
                </div>
              ) : (
                <AgentStatusGrid
                  agents={visibleAgents}
                  onAgentClick={handleAgentClick}
                  cardBackgroundClass="bg-transparent"
                />
              )}
            </ModuleBody>
          </Module>
        </div>

        <Module className="h-full">
          <ModuleHeader
            left={<span className="ty-title">Live Event Stream</span>}
            right={
              <>
                <DateRangeFilter value={eventsRange} onChange={(v) => { setEventsRange(v); setEventsPage(1); }} />
                <Pager
                  page={eventsPage}
                  pageSize={eventsPageSize}
                  totalItems={eventsFiltered.length}
                  onPageChange={setEventsPage}
                  onPageSizeChange={(n) => { setEventsPageSize(n); setEventsPage(1); }}
                />
              </>
            }
          />
          <ModuleBody>
            <EventFeed events={eventsPaged} maxHeight={9999} bare onEventClick={handleEventClick} />
          </ModuleBody>
        </Module>
      </div>

      <DrillDownModal
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedAgent?.name || "Agent Details"}
        data={selectedAgent || {}}
        type="agent"
        variant="modal"
      />

      <EventDetailModal
        event={selectedEvent}
        isOpen={eventModalOpen}
        onClose={() => {
          setEventModalOpen(false);
          setSelectedEvent(null);
        }}
      />
    </div>
  );
}
