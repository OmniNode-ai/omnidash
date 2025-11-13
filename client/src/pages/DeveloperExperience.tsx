import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { SectionHeader } from "@/components/SectionHeader";
import { Users, Code, TrendingUp, Award } from "lucide-react";
import { useState } from "react";
import { MockBadge } from "@/components/MockBadge";
import { ensureTimeSeries } from "@/components/mockUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { POLLING_INTERVAL_MEDIUM } from "@/lib/constants/query-config";

// TypeScript interfaces for API responses
interface Workflow {
  agent_name: string;
  total_workflows: number;
  successful_workflows: number;
  avg_duration_ms: number;
  improvement_percentage: number;
}

interface VelocityDataPoint {
  period: string;
  workflows_completed: number;
  avg_duration_ms: number;
}

interface ProductivityDataPoint {
  period: string;
  productivity_score: number;
  code_generated: number;
}

// Unified response from omniarchon /api/intelligence/developer/metrics
interface DeveloperMetricsResponse {
  workflows: {
    workflows: Workflow[];
    total_developers: number;
    total_code_generated: number;
  };
  velocity: {
    time_window: string;
    data: VelocityDataPoint[];
  };
  productivity: {
    time_window: string;
    data: ProductivityDataPoint[];
    avg_productivity_gain: number;
    pattern_reuse_rate: number;
  };
}

// Task velocity response from local API
interface TaskVelocityDataPoint {
  date: string;
  tasksCompleted: number;
  avgDurationMs: number;
  tasksPerDay: number;
}

export default function DeveloperExperience() {
  const queryClient = useQueryClient();

  // Time range state with localStorage persistence
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // WebSocket for real-time updates
  const { isConnected, connectionStatus } = useWebSocket({
    onMessage: (message) => {
      // Invalidate queries based on message type to trigger refetch
      switch (message.type) {
        case 'WORKFLOW_COMPLETED':
        case 'AGENT_ACTION_CREATED':
          queryClient.invalidateQueries({ queryKey: ['http://localhost:8053/api/intelligence/developer/metrics', timeRange] });
          break;
        case 'INITIAL_STATE':
          // Refresh all data on initial state
          queryClient.invalidateQueries();
          break;
      }
    },
    debug: false,
  });

  // Fetch unified developer metrics from omniarchon with standard polling
  const { data: metricsData, isLoading: metricsLoading, error: metricsError } = useQuery<DeveloperMetricsResponse>({
    queryKey: [`http://localhost:8053/api/intelligence/developer/metrics?timeWindow=${timeRange}`],
    refetchInterval: POLLING_INTERVAL_MEDIUM,
  });

  // Fetch task completion velocity from local API
  const { data: taskVelocityData, isLoading: velocityLoading } = useQuery<TaskVelocityDataPoint[]>({
    queryKey: [`/api/intelligence/developer/task-velocity?timeWindow=${timeRange}`],
    refetchInterval: POLLING_INTERVAL_MEDIUM,
  });

  // Extract data from unified response
  const workflowsData = metricsData?.workflows;
  const velocityResponse = metricsData?.velocity;
  const productivityResponse = metricsData?.productivity;

  // Transform API data for chart components
  const velocityDataRaw = (velocityResponse?.data || []).map(d => ({
    time: new Date(d.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: d.workflows_completed,
  }));
  const { data: velocityData, isMock: isVelocityMock } = ensureTimeSeries(velocityDataRaw, 12, 6);

  const productivityDataRaw = (productivityResponse?.data || []).map(d => ({
    time: new Date(d.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: d.productivity_score,
  }));
  const { data: productivityData, isMock: isProductivityMock } = ensureTimeSeries(productivityDataRaw, 75, 10);

  // Transform task velocity data for charts
  const taskVelocityChartData = (taskVelocityData || []).map(d => ({
    time: d.date.split(' ')[1] || d.date, // Use time portion if available, otherwise date
    value: d.tasksCompleted,
  }));

  const avgDurationChartData = (taskVelocityData || []).map(d => ({
    time: d.date.split(' ')[1] || d.date,
    value: Math.round(d.avgDurationMs / 1000), // Convert to seconds for better readability
  }));

  // Calculate summary metrics from task velocity data
  const totalTasksCompleted = (taskVelocityData || []).reduce((sum, d) => sum + d.tasksCompleted, 0);
  const avgTasksPerDay = taskVelocityData && taskVelocityData.length > 0
    ? Math.round(totalTasksCompleted / taskVelocityData.length)
    : 0;
  const avgCompletionTime = taskVelocityData && taskVelocityData.length > 0
    ? Math.round(
        (taskVelocityData.reduce((sum, d) => sum + d.avgDurationMs, 0) / taskVelocityData.length) / 1000
      )
    : 0;

  // Calculate metrics from real data
  const activeDevelopers = workflowsData?.total_developers || 0;
  const codeGenerated = workflowsData?.total_code_generated || 0;
  const productivityGain = productivityResponse?.avg_productivity_gain || 0;
  const patternReuse = productivityResponse?.pattern_reuse_rate || 0;

  // Format code generated (e.g., 12400 -> "12.4k")
  const formatCodeGenerated = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  // Transform workflows for display
  const workflows = (workflowsData?.workflows || []).map((workflow, index) => ({
    id: index.toString(),
    name: workflow.agent_name,
    completions: workflow.successful_workflows,
    avgTime: `${(workflow.avg_duration_ms / 1000).toFixed(1)}s`,
    improvement: Math.round(workflow.improvement_percentage),
  }));

  // Loading state
  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <TrendingUp className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading developer experience data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (metricsError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <p className="text-destructive font-semibold mb-2">Failed to load developer metrics</p>
          <p className="text-muted-foreground text-sm">
            {metricsError?.message || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Developer Experience"
        description="Workflow improvements and productivity metrics powered by AI assistance."
        details="The Developer Experience dashboard tracks how AI agents improve developer productivity. Monitor active developers, code generation volumes, productivity gains, and pattern reuse rates. Analyze task completion velocity, workflow efficiency, and time savings across your development team. Use these insights to measure ROI from AI assistance and identify opportunities for further automation."
        level="h1"
      />
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={(metricsData as unknown as Record<string, unknown>) || null}
            filename={`developer-experience-${timeRange}-${new Date().toISOString().split('T')[0]}`}
            disabled={!metricsData}
          />
        </div>
      </div>

      {/* Metric cards with real data */}
      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          label={`Active Developers (${timeRange})`}
          value={activeDevelopers.toString()}
          icon={Users}
          status="healthy"
          tooltip="Unique developers with completed workflows"
        />
        <MetricCard
          label="Code Generated"
          value={formatCodeGenerated(codeGenerated)}
          icon={Code}
          status="healthy"
          tooltip="Total lines of code generated by AI workflows"
        />
        <MetricCard
          label="Productivity Gain"
          value={`${Math.round(productivityGain)}%`}
          icon={TrendingUp}
          status={productivityGain > 30 ? "healthy" : "warning"}
          tooltip="Average productivity improvement from AI assistance"
        />
        <MetricCard
          label="Pattern Reuse"
          value={`${Math.round(patternReuse * 100)}%`}
          icon={Award}
          status={patternReuse > 0.8 ? "healthy" : "warning"}
          tooltip="Rate of reusing learned patterns in workflows"
        />
      </div>

      {/* Charts with real data */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          {isVelocityMock && <MockBadge label="MOCK DATA: Development Velocity" />}
          <RealtimeChart
            title={`Development Velocity (${timeRange})`}
            data={velocityData}
            color="hsl(var(--chart-1))"
            showArea
          />
        </div>
        <div>
          {isProductivityMock && <MockBadge label="MOCK DATA: Productivity Score" />}
          <RealtimeChart
            title={`Developer Productivity Score (${timeRange})`}
            data={productivityData}
            color="hsl(var(--chart-2))"
          />
        </div>
      </div>

      {/* Task Completion Velocity Charts */}
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">
              Task Completion Velocity ({timeRange})
            </h3>
            <Badge variant="outline" className="text-xs">
              {totalTasksCompleted} total tasks
            </Badge>
          </div>
          {velocityLoading ? (
            <div className="flex items-center justify-center h-64">
              <TrendingUp className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : taskVelocityData && taskVelocityData.length > 0 ? (
            <>
              <RealtimeChart
                title=""
                data={taskVelocityChartData}
                color="hsl(var(--chart-3))"
                showArea
              />
              <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-card-border">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Avg Tasks/Day</div>
                  <div className="text-2xl font-semibold">{avgTasksPerDay}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Avg Duration</div>
                  <div className="text-2xl font-semibold">{avgCompletionTime}s</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No task velocity data available for {timeRange}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">
              Average Completion Time ({timeRange})
            </h3>
            <Badge variant="outline" className="text-xs">
              seconds
            </Badge>
          </div>
          {velocityLoading ? (
            <div className="flex items-center justify-center h-64">
              <TrendingUp className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : taskVelocityData && taskVelocityData.length > 0 ? (
            <RealtimeChart
              title=""
              data={avgDurationChartData}
              color="hsl(var(--chart-4))"
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No duration data available for {timeRange}
            </div>
          )}
        </Card>
      </div>

      {/* Workflow grid with real data */}
      <Card className="p-6">
        <h3 className="text-base font-semibold mb-4">
          AI-Powered Workflows ({workflows.length} active)
        </h3>
        {workflows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No workflow data available for the selected time range
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="p-4 rounded-lg border border-card-border hover-elevate"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-sm mb-1">{workflow.name}</h4>
                    <div className="text-xs text-muted-foreground">
                      {workflow.completions} completions
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={workflow.improvement > 0 ?
                      "text-status-healthy border-status-healthy/30" :
                      "text-muted-foreground border-muted/30"
                    }
                  >
                    {workflow.improvement > 0 ? '+' : ''}{workflow.improvement}%
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Avg Time:</span>
                  <span className="font-mono">{workflow.avgTime}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
