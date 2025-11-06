import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentManagementSource } from "@/lib/data-sources";
import { MockDataBadge } from "@/components/MockDataBadge";
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
import AgentOperations from "../AgentOperations";
import { RoutingDecisionDetailModal } from "@/components/RoutingDecisionDetailModal";

// Types imported from data source
type AgentSummary = import('@/lib/data-sources/agent-management-source').AgentSummary;
type AgentExecution = import('@/lib/data-sources/agent-management-source').AgentExecution;
type RoutingStats = import('@/lib/data-sources/agent-management-source').RoutingStats;
type RoutingDecision = import('@/lib/data-sources/agent-management-source').RoutingDecision;

export default function AgentManagement() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("24h");
  const [selectedDecision, setSelectedDecision] = useState<RoutingDecision | null>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);

  // Use centralized data source
  const { data: managementData, isLoading } = useQuery({
    queryKey: ['agent-management', timeRange],
    queryFn: () => agentManagementSource.fetchAll(timeRange),
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  const agentSummary = managementData?.summary;
  const routingStats = managementData?.routingStats;
  const recentExecutions = managementData?.recentExecutions;
  const recentDecisions = managementData?.recentDecisions || [];
  const usingMockData = managementData?.isMock || false;
  
  const initialLoading = isLoading && !managementData;

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
            Complete agent ecosystem management, registry, routing intelligence, and operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {usingMockData && <MockDataBadge />}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsConfigureModalOpen(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button
            size="sm"
            onClick={() => setIsExecuteModalOpen(true)}
          >
            <Play className="w-4 h-4 mr-2" />
            Execute Agent
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registry">Agent Registry</TabsTrigger>
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
                  {agentSummary?.totalRuns ? `${agentSummary.totalRuns.toLocaleString()} total executions` : "No executions yet"}
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
                  {Math.max(0, Math.min(100, agentSummary?.successRate || 0)).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {agentSummary?.totalRuns ? `Based on ${agentSummary.totalRuns.toLocaleString()} runs` : "No data available"}
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
                  {agentSummary?.avgExecutionTime ? `${agentSummary.avgExecutionTime.toFixed(1)}s` : "0s"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {agentSummary?.avgExecutionTime ? `Weighted average across all agents` : "No execution data"}
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

            {/* Spacer Card to fill empty grid slot(s) on wider layouts */}
            <Card className="hidden md:block" aria-hidden="true">
              <CardHeader className="p-4" />
              <CardContent className="p-4" />
            </Card>

            {/* Additional spacer for the removed Total Requests card */}
            <Card className="hidden lg:block" aria-hidden="true">
              <CardHeader className="p-4" />
              <CardContent className="p-4" />
            </Card>
          </div>

          {/* Agent Operations lives here in Overview as the primary section */}
          <AgentOperations />

          {/* Removed duplicate Recent Executions and Top Performing Agents to avoid duplication */}
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <AgentRegistry />
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
                  {recentDecisions.length === 0 ? (
                    <div className="text-center py-8 border rounded-lg bg-muted/10">
                      <p className="text-muted-foreground">No routing decisions available yet</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Decisions will appear here as agents are invoked
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentDecisions.map((decision) => (
                        <div
                          key={decision.id}
                          className="flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
                          onClick={() => {
                            setSelectedDecision(decision);
                            setIsDecisionModalOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedDecision(decision);
                              setIsDecisionModalOpen(true);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`View routing decision for ${decision.selectedAgent}`}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{decision.userRequest}</div>
                            <div className="text-sm text-muted-foreground">
                              Routed to {decision.selectedAgent} with {(decision.confidenceScore * 100).toFixed(1)}% confidence
                            </div>
                            {decision.createdAt && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(decision.createdAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm font-medium">{(decision.confidenceScore * 100).toFixed(1)}%</div>
                              <div className="text-xs text-muted-foreground">Confidence</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">{decision.routingTimeMs}ms</div>
                              <div className="text-xs text-muted-foreground">Time</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Routing Decision Detail Modal */}
      <RoutingDecisionDetailModal
        decision={selectedDecision}
        isOpen={isDecisionModalOpen}
        onClose={() => {
          setIsDecisionModalOpen(false);
          setSelectedDecision(null);
        }}
      />

      {/* Configure Modal */}
      {isConfigureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsConfigureModalOpen(false)}
          />
          <div className="relative z-10 w-[600px] bg-background rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Agent Configuration</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsConfigureModalOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Routing Strategy</label>
                <select className="w-full mt-1 p-2 border rounded-md bg-background">
                  <option>Enhanced Fuzzy Matching</option>
                  <option>Exact Match</option>
                  <option>Capability Alignment</option>
                  <option>Fallback</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Confidence Threshold</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue="75"
                  className="w-full mt-1"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Max Routing Time (ms)</label>
                <input
                  type="number"
                  defaultValue="100"
                  className="w-full mt-1 p-2 border rounded-md bg-background"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button className="flex-1" onClick={() => setIsConfigureModalOpen(false)}>
                  Save Configuration
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsConfigureModalOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Execute Agent Modal */}
      {isExecuteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsExecuteModalOpen(false)}
          />
          <div className="relative z-10 w-[700px] bg-background rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Execute Agent</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExecuteModalOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Agent</label>
                <select className="w-full mt-1 p-2 border rounded-md bg-background">
                  <option>Polymorphic Agent</option>
                  <option>Code Reviewer</option>
                  <option>Test Generator</option>
                  <option>Documentation Agent</option>
                  <option>Refactoring Agent</option>
                  <option>Security Analyzer</option>
                  <option>Performance Optimizer</option>
                  <option>API Designer</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Task Description</label>
                <textarea
                  placeholder="Describe the task you want the agent to perform..."
                  rows={6}
                  className="w-full mt-1 p-2 border rounded-md bg-background resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="auto-route" className="rounded" />
                <label htmlFor="auto-route" className="text-sm">
                  Let the router automatically select the best agent
                </label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button className="flex-1" onClick={() => setIsExecuteModalOpen(false)}>
                  <Play className="w-4 h-4 mr-2" />
                  Execute
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsExecuteModalOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
