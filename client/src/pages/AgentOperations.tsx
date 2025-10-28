import { MetricCard } from "@/components/MetricCard";
import { AgentStatusGrid } from "@/components/AgentStatusGrid";
import { RealtimeChart } from "@/components/RealtimeChart";
import { EventFeed } from "@/components/EventFeed";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { StatusLegend } from "@/components/StatusLegend";
import { Activity, Cpu, CheckCircle, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

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
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chartData, setChartData] = useState<Array<{ time: string; value: number }>>([]);

  // Fetch agent metrics with 30-second polling
  const { data: metrics, isLoading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useQuery<AgentMetrics[]>({
    queryKey: ['/api/intelligence/agents/summary'],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch recent actions with 10-second polling
  const { data: actions, isLoading: actionsLoading, error: actionsError, refetch: refetchActions } = useQuery<AgentAction[]>({
    queryKey: ['/api/intelligence/actions/recent?limit=100'],
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Health check with 15-second polling
  const { data: health } = useQuery<HealthStatus>({
    queryKey: ['/api/intelligence/health'],
    refetchInterval: 15000, // Refetch every 15 seconds
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

  const handleAgentClick = (agent: any) => {
    setSelectedAgent(agent);
    setPanelOpen(true);
  };

  // Calculate aggregated metrics from real data
  const activeAgents = metrics?.length || 0;
  const totalRequests = metrics?.reduce((sum, m) => sum + m.totalRequests, 0) || 0;
  const avgSuccessRate = metrics && metrics.length > 0
    ? metrics.reduce((sum, m) => sum + (m.successRate || 0), 0) / metrics.length
    : 0;
  const avgResponseTime = metrics && metrics.length > 0
    ? metrics.reduce((sum, m) => sum + (m.avgRoutingTime || 0), 0) / metrics.length
    : 0;

  // Convert metrics to agent grid format
  const agents = metrics?.map((metric, index) => {
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
      quality, // Add quality based on confidence score
      responseTime: Math.round(metric.avgRoutingTime || 0),
      tasksCompleted: metric.totalRequests,
    };
  }) || [];

  // Convert actions to events format for EventFeed
  const events = actions?.slice(0, 50).map(action => ({
    id: action.id,
    type: 'info' as const,
    message: `${action.agentName}: ${action.actionName}`,
    timestamp: new Date(action.createdAt).toLocaleTimeString(),
    source: action.agentName,
  })) || [];

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

  const connected = health?.status === 'healthy';

  return (
    <div className="space-y-6">
      {/* Header with real-time connection status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">AI Agent Operations</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of {activeAgents} AI agent{activeAgents !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-xs text-muted-foreground">
            {connected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Status legend */}
      <StatusLegend />

      {/* Metric cards with real data */}
      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          label="Active Agents (24h)"
          value={activeAgents}
          icon={Activity}
          status="healthy"
        />
        <MetricCard
          label="Total Requests (24h)"
          value={totalRequests.toLocaleString()}
          icon={Activity}
          status="healthy"
        />
        <MetricCard
          label="Avg Response Time"
          value={`${Math.round(avgResponseTime)}ms`}
          icon={Clock}
          status={avgResponseTime < 100 ? "healthy" : "warning"}
          tooltip="Target: < 100ms"
        />
        <MetricCard
          label="Success Rate"
          value={`${Math.round(avgSuccessRate * 100)}%`}
          icon={CheckCircle}
          status={avgSuccessRate > 0.9 ? "healthy" : "warning"}
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
