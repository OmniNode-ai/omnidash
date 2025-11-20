import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentManagementSource } from "@/lib/data-sources";
import { getPollingInterval } from "@/lib/constants/query-config";
import { MockDataBadge } from "@/components/MockDataBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot,
  Activity,
  Settings,
  Play,
  Target,
  Clock
} from "lucide-react";

// Import existing components
import AgentRegistry from "./AgentRegistry";
import AgentOperations from "../AgentOperations";
import { RoutingDecisionDetailModal } from "@/components/RoutingDecisionDetailModal";
import { AgentDetailModal } from "@/components/AgentDetailModal";
import { intelligenceAnalyticsSource } from "@/lib/data-sources/intelligence-analytics-source";
import type { AgentPerformance } from "@/lib/data-sources/intelligence-analytics-source";

// Types imported from data source
type RoutingDecision = import('@/lib/data-sources/agent-management-source').RoutingDecision;

export default function AgentManagement() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange] = useState("24h");
  const [selectedDecision, setSelectedDecision] = useState<RoutingDecision | null>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentPerformance | null>(null);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);

  // Use centralized data source
  const { data: managementData, isLoading } = useQuery({
    queryKey: ['agent-management', timeRange],
    queryFn: () => agentManagementSource.fetchAll(timeRange),
    refetchInterval: getPollingInterval(60000),
    refetchIntervalInBackground: true,
  });

  const agentSummary = managementData?.summary;
  const routingStats = managementData?.routingStats;
  const recentDecisions = managementData?.recentDecisions || [];
  const usingMockData = managementData?.isMock || false;

  // Fetch agent performance data
  const { data: agentPerformanceResult } = useQuery({
    queryKey: ['agent-performance', timeRange],
    queryFn: () => intelligenceAnalyticsSource.fetchAgentPerformance(timeRange),
    refetchInterval: getPollingInterval(60000),
  });
  const agentPerformance = agentPerformanceResult?.data;
  const usingMockAgents = agentPerformanceResult?.isMock || false;

  const initialLoading = isLoading && !managementData;

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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registry">Agent Registry</TabsTrigger>
          <TabsTrigger value="routing">Routing Intelligence</TabsTrigger>
          <TabsTrigger value="performance">Agent Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Agent Summary Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Agent Operations Overview</CardTitle>
              <CardDescription>
                Key metrics and statistics for agent execution and performance
              </CardDescription>
            </CardHeader>
            <CardContent>
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
              </div>
            </CardContent>
          </Card>

          {/* Agent Operations lives here in Overview as the primary section */}
          <AgentOperations />
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <AgentRegistry />
        </TabsContent>

        <TabsContent value="routing" className="space-y-6">
          {/* Routing Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Routing Metrics</CardTitle>
              <CardDescription>Key performance indicators for agent routing decisions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-2">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {routingStats?.accuracy?.toFixed(1) || "0"}%
                      </div>
                      <div className="text-sm text-muted-foreground">Routing Accuracy</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-2">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">
                        {routingStats?.avgRoutingTime?.toFixed(0) || "0"}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Routing Time</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-2">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600">
                        {routingStats?.totalDecisions?.toLocaleString() || "0"}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Decisions</div>
                    </div>
                  </CardContent>
                </Card>
                {/* Spacer card for alignment */}
                <Card className="border-dashed border-2 opacity-50">
                  <CardContent className="h-full" />
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Strategy Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Routing Strategy Breakdown</CardTitle>
              <CardDescription>Distribution of routing strategies across agents</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Performance Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Average Confidence</span>
                    <span className="text-2xl font-bold text-green-600">
                      {routingStats?.avgConfidence ? (routingStats.avgConfidence * 100).toFixed(1) : "0"}%
                    </span>
                  </div>
                  <Progress value={routingStats?.avgConfidence ? routingStats.avgConfidence * 100 : 0} className="h-2" />
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
            </CardContent>
          </Card>

          {/* Recent Routing Decisions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Routing Decisions</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Performance Analysis</CardTitle>
              <CardDescription>Detailed performance metrics for all agents</CardDescription>
            </CardHeader>
            <CardContent>
              {usingMockAgents && <MockDataBadge className="mb-4" />}
              <div className="space-y-4">
                {agentPerformance?.map((agent) => (
                  <div
                    key={agent.agentId}
                    className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedAgent(agent);
                      setIsAgentModalOpen(true);
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Bot className="w-5 h-5 text-primary" />
                        <div>
                          <div className="font-medium">{agent.agentName}</div>
                          <div className="text-sm text-muted-foreground">{agent.agentId}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">${(agent.costPerSuccess || 0.045).toFixed(3)}</div>
                          <div className="text-xs text-muted-foreground">Cost/Success</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{(agent.p95Latency || 1450).toFixed(0)}ms</div>
                          <div className="text-xs text-muted-foreground">p95 Latency</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{agent.totalRuns.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">Total Runs</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Quality Score</div>
                        <Progress value={Math.max(0, Math.min(100, agent.avgQualityScore * 10))} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{agent.avgQualityScore.toFixed(1)}/10</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Efficiency</div>
                        <Progress value={Math.max(0, Math.min(100, agent.efficiency))} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{Math.max(0, Math.min(100, agent.efficiency)).toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Popularity</div>
                        <Progress value={Math.max(0, Math.min(100, agent.popularity))} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{Math.max(0, Math.min(100, agent.popularity)).toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                ))}
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

      {/* Agent Detail Modal */}
      <AgentDetailModal
        agent={selectedAgent}
        isOpen={isAgentModalOpen}
        onClose={() => {
          setIsAgentModalOpen(false);
          setSelectedAgent(null);
        }}
        onNavigate={(_type, _id) => {
          // Dismiss current modal, then navigate to new one
          setIsAgentModalOpen(false);
          setSelectedAgent(null);
          // TODO: Open new modal based on type and id
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
