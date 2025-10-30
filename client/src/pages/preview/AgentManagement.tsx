import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bot, 
  Network, 
  Activity, 
  BarChart3,
  Eye,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Search,
  Filter,
  Target,
  TrendingUp,
  Clock,
  Users,
  Zap,
  Code,
  TestTube,
  Server,
  BookOpen,
  Layers,
  Workflow,
  Brain,
  Cpu,
  Database
} from "lucide-react";

// Import existing components
import AgentRegistry from "./AgentRegistry";
import AgentNetwork from "./AgentNetwork";
import AgentOperations from "../AgentOperations";

// Mock data interfaces
interface AgentSummary {
  totalAgents: number;
  activeAgents: number;
  totalRuns: number;
  successRate: number;
  avgExecutionTime: number;
  totalSavings: number;
}

interface AgentExecution {
  id: string;
  agentId: string;
  agentName: string;
  query: string;
  status: "pending" | "executing" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  duration?: number;
  result?: {
    success: boolean;
    output?: string;
    qualityScore?: number;
  };
}

interface RoutingStats {
  totalDecisions: number;
  avgConfidence: number;
  avgRoutingTime: number;
  accuracy: number;
  strategyBreakdown: Record<string, number>;
  topAgents: Array<{
    agentId: string;
    agentName: string;
    usage: number;
    successRate: number;
  }>;
}

export default function AgentManagement() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("24h");

  // API calls
  const { data: agentSummary, isLoading: summaryLoading } = useQuery<AgentSummary>({
    queryKey: ['agent-summary', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/agents/summary?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch agent summary');
      return response.json();
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    keepPreviousData: true,
  });

  const { data: recentExecutions, isLoading: executionsLoading } = useQuery<AgentExecution[]>({
    queryKey: ['agent-executions', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/agents/executions?timeRange=${timeRange}&limit=10`);
      if (!response.ok) throw new Error('Failed to fetch recent executions');
      return response.json();
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    keepPreviousData: true,
  });

  const { data: routingStats, isLoading: routingLoading } = useQuery<RoutingStats>({
    queryKey: ['routing-stats', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/agents/routing/stats?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch routing stats');
      return response.json();
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    keepPreviousData: true,
  });

  const isLoading = summaryLoading || executionsLoading || routingLoading;
  const initialLoading = !agentSummary && !recentExecutions && !routingStats;

  const getStatusColor = (status: string) => {
    switch (status) {
      // Higher contrast in dark mode: dimmer bg, brighter text
      case "completed": return "text-green-400 bg-green-900/30 border border-green-700/40";
      case "executing": return "text-blue-400 bg-blue-900/30 border border-blue-700/40";
      case "failed": return "text-red-400 bg-red-900/30 border border-red-700/40";
      case "pending": return "text-yellow-400 bg-yellow-900/30 border border-yellow-700/40";
      default: return "text-muted-foreground bg-muted border border-border/60";
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading agent management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent Management</h1>
          <p className="text-muted-foreground">
            Complete agent ecosystem management, registry, network visualization, and operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button size="sm">
            <Play className="w-4 h-4 mr-2" />
            Execute Agent
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registry">Agent Registry</TabsTrigger>
          <TabsTrigger value="network">Network View</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="routing">Routing Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Agent Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {agentSummary?.totalAgents || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {agentSummary?.activeAgents || 0} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {agentSummary?.totalRuns?.toLocaleString() || "0"}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+12.5%</span> from last week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {agentSummary?.successRate?.toFixed(1) || "0"}%
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+2.1%</span> from last week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Execution Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {agentSummary?.avgExecutionTime?.toFixed(0) || "0"}s
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-red-600">-15s</span> from last week
                </p>
              </CardContent>
            </Card>

            {/* Routing Accuracy */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Routing Accuracy</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {routingStats?.accuracy?.toFixed(1) || "0"}%
                </div>
                <p className="text-xs text-muted-foreground">Last {timeRange}</p>
              </CardContent>
            </Card>

            {/* Avg Routing Time */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Routing Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {routingStats?.avgRoutingTime?.toFixed(0) || "0"}ms
                </div>
                <p className="text-xs text-muted-foreground">Lower is better</p>
              </CardContent>
            </Card>

            {/* Total Requests (standardized, one decision per run) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {agentSummary?.totalRuns?.toLocaleString() || "0"}
                </div>
                <p className="text-xs text-muted-foreground">In {timeRange}</p>
              </CardContent>
            </Card>

            {/* Spacer Card to fill empty grid slot(s) on wider layouts */}
            <Card className="hidden md:block" aria-hidden="true">
              <CardHeader className="p-4" />
              <CardContent className="p-4" />
            </Card>
          </div>

          {/* AI Agent Operations (full section moved above historical lists) */}
          <AgentOperations />

          {/* Recent Activity and Top Agents */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="ty-title">Recent Executions</CardTitle>
                <CardDescription className="ty-subtitle">Latest agent executions and their status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentExecutions
                    ?.filter((e) => e.status === 'completed' || e.status === 'failed')
                    .map((execution) => (
                    <div key={execution.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Bot className="w-4 h-4 text-primary" />
                        <div>
                          <div className="font-medium text-sm">{execution.agentName}</div>
                          <div className="text-xs text-muted-foreground">
                            {execution.query.substring(0, 50)}...
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {execution.duration ? `${execution.duration}s` : 'Running...'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(execution.startedAt).toLocaleTimeString()}
                          </div>
                        </div>
                        <Badge variant="outline" className={getStatusColor(execution.status)}>
                          {execution.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="ty-title">Top Performing Agents</CardTitle>
                <CardDescription className="ty-subtitle">Agents with highest usage and success rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {routingStats?.topAgents?.slice(0, 5).map((agent, index) => (
                    <div key={agent.agentId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{agent.agentName}</div>
                          <div className="text-xs text-muted-foreground">{agent.usage} executions</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{agent.successRate.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">Success Rate</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <AgentRegistry />
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <AgentNetwork />
        </TabsContent>

        <TabsContent value="operations" className="space-y-4" forceMount>
          <AgentOperations />
        </TabsContent>

        <TabsContent value="routing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Routing Intelligence Dashboard</CardTitle>
              <CardDescription>Detailed analysis of agent routing decisions and performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* High-level Routing Metrics (consistency with overview positioning) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {routingStats?.accuracy?.toFixed(1) || "0"}%
                    </div>
                    <div className="text-sm text-muted-foreground">Routing Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {routingStats?.avgRoutingTime?.toFixed(0) || "0"}ms
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Routing Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      {routingStats?.totalDecisions?.toLocaleString() || "0"}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Decisions</div>
                  </div>
                </div>

                {/* Strategy Breakdown */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Routing Strategy Breakdown</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(routingStats?.strategyBreakdown || {}).map(([strategy, count]) => (
                      <div key={strategy} className="p-4 border rounded-lg text-center">
                        <div className="text-2xl font-bold">{count}</div>
                        <div className="text-sm text-muted-foreground capitalize">
                          {strategy.replace('_', ' ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance Trends */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Performance Trends</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Average Confidence</span>
                        <span className="text-2xl font-bold text-green-600">
                          {(routingStats?.avgConfidence * 100)?.toFixed(1) || "0"}%
                        </span>
                      </div>
                      <Progress value={routingStats?.avgConfidence * 100 || 0} className="h-2" />
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Routing Speed</span>
                        <span className="text-2xl font-bold text-blue-600">
                          {routingStats?.avgRoutingTime || 0}ms
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Target: &lt;100ms
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Routing Decisions */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recent Routing Decisions</h3>
                  <div className="space-y-2">
                    {[
                      { query: "optimize my API performance", agent: "agent-performance", confidence: 92, time: "45ms" },
                      { query: "debug database connection issues", agent: "agent-debug-intelligence", confidence: 89, time: "38ms" },
                      { query: "create a React component", agent: "agent-frontend-developer", confidence: 95, time: "42ms" },
                      { query: "write unit tests", agent: "agent-testing", confidence: 87, time: "51ms" },
                      { query: "design microservices architecture", agent: "agent-api-architect", confidence: 91, time: "39ms" }
                    ].map((decision, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{decision.query}</div>
                          <div className="text-sm text-muted-foreground">
                            Routed to {decision.agent} with {decision.confidence}% confidence
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">{decision.confidence}%</div>
                            <div className="text-xs text-muted-foreground">Confidence</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{decision.time}</div>
                            <div className="text-xs text-muted-foreground">Time</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
