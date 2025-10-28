import { MetricCard } from "@/components/MetricCard";
import { AgentStatusGrid } from "@/components/AgentStatusGrid";
import { RealtimeChart } from "@/components/RealtimeChart";
import { EventFeed } from "@/components/EventFeed";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { StatusLegend } from "@/components/StatusLegend";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { Activity, Cpu, CheckCircle, Clock } from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";

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

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'error';
  timestamp: string;
}

export default function AgentOperations() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chartData, setChartData] = useState<Array<{ time: string; value: number }>>([]);
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  // Throttle query invalidations to prevent excessive re-renders
  const lastInvalidationRef = useRef<{ [key: string]: number }>({});
  const INVALIDATION_THROTTLE_MS = 1000; // Wait 1 second between invalidations

  const throttledInvalidate = useCallback((queryKey: string[]) => {
    const key = queryKey.join(':');
    const now = Date.now();
    const lastTime = lastInvalidationRef.current[key] || 0;

    if (now - lastTime > INVALIDATION_THROTTLE_MS) {
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

  // Fetch agent metrics (updated via WebSocket)
  const { data: metrics, isLoading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useQuery<AgentMetrics[]>({
    queryKey: [`/api/intelligence/agents/summary?timeWindow=${timeRange}`],
  });

  // Fetch recent actions (updated via WebSocket)
  const { data: actions, isLoading: actionsLoading, error: actionsError, refetch: refetchActions } = useQuery<AgentAction[]>({
    queryKey: [`/api/intelligence/actions/recent?limit=100&timeWindow=${timeRange}`],
  });

  // Health check (updated via WebSocket)
  const { data: health } = useQuery<HealthStatus>({
    queryKey: ['/api/intelligence/health'],
  });

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

  const handleAgentClick = useCallback((agent: any) => {
    setSelectedAgent(agent);
    setPanelOpen(true);
  }, []);

  // Memoize aggregated metrics to prevent recalculation on every render
  const aggregatedMetrics = useMemo(() => {
    const activeAgents = metrics?.length || 0;
    const totalRequests = metrics?.reduce((sum, m) => sum + m.totalRequests, 0) || 0;
    const avgSuccessRate = metrics && metrics.length > 0
      ? metrics.reduce((sum, m) => sum + (m.successRate || 0), 0) / metrics.length
      : 0;
    const avgResponseTime = metrics && metrics.length > 0
      ? metrics.reduce((sum, m) => sum + (m.avgRoutingTime || 0), 0) / metrics.length
      : 0;

    return { activeAgents, totalRequests, avgSuccessRate, avgResponseTime };
  }, [metrics]);

  // Memoize agent grid data to prevent recalculation
  const agents = useMemo(() => {
    return metrics?.map((metric) => {
      // Use confidence score as quality proxy (displayed in agent grid bottom boxes)
      const quality = Math.round((metric.avgConfidence || 0) * 100);
      const successRate = Math.round((metric.successRate || 0) * 100);

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

  // Memoize events to prevent recalculation
  const events = useMemo(() => {
    return actions?.slice(0, 50).map(action => ({
      id: action.id,
      type: 'info' as const,
      message: `${action.agentName}: ${action.actionName}`,
      timestamp: new Date(action.createdAt).toLocaleTimeString(),
      source: action.agentName,
    })) || [];
  }, [actions]);

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
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">AI Agent Operations</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of {aggregatedMetrics.activeAgents} AI agent{aggregatedMetrics.activeAgents !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={{ metrics, actions, summary: aggregatedMetrics }}
            filename={`agent-operations-${timeRange}-${new Date().toISOString().split('T')[0]}`}
            disabled={!metrics || !actions}
          />
        </div>
      </div>

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
          value={`${Math.round(aggregatedMetrics.avgSuccessRate * 100)}%`}
          icon={CheckCircle}
          status={aggregatedMetrics.avgSuccessRate > 0.9 ? "healthy" : "warning"}
          tooltip="Target: > 90%"
        />
      </div>

      {/* Charts with real activity data */}
      <div className="grid grid-cols-2 gap-6">
        <RealtimeChart
          title="Agent Activity (Actions per Minute)"
          data={chartData}
          color="hsl(var(--chart-1))"
        />
        <RealtimeChart
          title="Agent Performance"
          data={chartData}
          color="hsl(var(--chart-2))"
          showArea
        />
      </div>

      {/* Agent grid and event feed with real data */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <AgentStatusGrid
            agents={agents}
            onAgentClick={handleAgentClick}
          />
        </div>

        <EventFeed events={events} maxHeight={400} />
      </div>

      <DrillDownPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedAgent?.name || "Agent Details"}
        data={selectedAgent || {}}
        type="agent"
      />
    </div>
  );
}
