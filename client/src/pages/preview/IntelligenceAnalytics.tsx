import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { intelligenceAnalyticsSource } from "@/lib/data-sources";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Zap, 
  Brain, 
  Clock, 
  BarChart3,
  Activity,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Cpu,
  Database,
  Network,
  Bot,
  Code,
  TestTube,
  Server,
  Users,
  Eye,
  Settings
} from "lucide-react";

// Import existing components
import EnhancedAnalytics from "./EnhancedAnalytics";
import IntelligenceSavings from "./IntelligenceSavings";
import { AgentDetailModal } from "@/components/AgentDetailModal";
import { MockDataBadge } from "@/components/MockDataBadge";

// Mock data interfaces
interface IntelligenceMetrics {
  totalQueries: number;
  avgResponseTime: number;
  successRate: number;
  fallbackRate: number;
  costPerQuery: number;
  totalCost: number;
  qualityScore: number;
  userSatisfaction: number;
}

// Types imported from data source
import type { AgentPerformance, SavingsMetrics } from "@/lib/data-sources/intelligence-analytics-source";
import { Info } from "lucide-react";

export default function IntelligenceAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("30d");
  const [selectedAgent, setSelectedAgent] = useState<AgentPerformance | null>(null);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);

  // Use centralized data source for metrics
  const { data: metricsResult, isLoading: metricsLoading } = useQuery({
    queryKey: ['intelligence-metrics', timeRange],
    queryFn: () => intelligenceAnalyticsSource.fetchMetrics(timeRange),
    refetchInterval: 60000,
  });
  
  const intelligenceMetrics = metricsResult?.data;
  const usingMockMetrics = metricsResult?.isMock || false;

  const { data: agentPerformanceResult, isLoading: agentsLoading } = useQuery({
    queryKey: ['agent-performance', timeRange],
    queryFn: () => intelligenceAnalyticsSource.fetchAgentPerformance(timeRange),
    refetchInterval: 60000,
  });
  const agentPerformance = agentPerformanceResult?.data;
  const usingMockAgents = agentPerformanceResult?.isMock || false;

  // Recent activity from data source
  const { data: activityResult, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => intelligenceAnalyticsSource.fetchRecentActivity(5),
    refetchInterval: 30000,
  });
  
  const recentActivity = activityResult?.data || [];
  const usingMockActivity = activityResult?.isMock || false;

  const { data: savingsResult, isLoading: savingsLoading } = useQuery({
    queryKey: ['savings-metrics', timeRange],
    queryFn: () => intelligenceAnalyticsSource.fetchSavingsMetrics(timeRange),
    retry: false,
    refetchInterval: 60000,
  });
  const savingsMetrics = savingsResult?.data;
  const usingMockSavings = savingsResult?.isMock || false;

  const isLoading = metricsLoading || agentsLoading || savingsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading intelligence analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Intelligence Analytics</h1>
          <p className="ty-subtitle">
            Comprehensive analytics for intelligence operations, agent performance, and cost optimization
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(usingMockAgents || usingMockMetrics || usingMockSavings || usingMockActivity) && <MockDataBadge />}
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button size="sm">
            <Eye className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="agents">Agent Performance</TabsTrigger>
          <TabsTrigger value="savings">Cost & Savings</TabsTrigger>
          <TabsTrigger value="analytics">Advanced Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {intelligenceMetrics?.totalQueries?.toLocaleString() || "0"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {intelligenceMetrics?.totalQueries ? `${intelligenceMetrics.totalQueries.toLocaleString()} queries in ${timeRange}` : "No queries yet"}
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
                  {Math.max(0, Math.min(100, intelligenceMetrics?.successRate || 0)).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {intelligenceMetrics?.totalQueries ? `Based on ${intelligenceMetrics.totalQueries.toLocaleString()} queries` : "No data available"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {intelligenceMetrics?.avgResponseTime ? `${(intelligenceMetrics.avgResponseTime / 1000).toFixed(1)}s` : "0ms"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {intelligenceMetrics?.avgResponseTime ? `Average across all agents` : "No response time data"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="text-xs">
                        <strong>Methodology:</strong> Savings calculated by comparing agent performance with intelligence (pattern injection, optimized routing) vs baseline (standard AI agents). Includes token reduction (34%), local compute offload (12%), and avoided API calls (8%).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${savingsMetrics?.totalSavings?.toLocaleString() || "0"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {savingsMetrics?.totalSavings ? `Total savings in ${timeRange}` : "No savings data"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest intelligence operations and agent executions</CardDescription>
              </CardHeader>
              <CardContent>
                {usingMockActivity && <MockDataBadge className="mb-3" />}
                <div className="space-y-4">
                  {recentActivity.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          item.status === 'completed' ? 'bg-green-500' : 
                          item.status === 'executing' ? 'bg-yellow-500' : 'bg-gray-500'
                        }`}></div>
                        <div>
                          <div className="font-medium text-sm">{item.action}</div>
                          <div className="text-xs text-muted-foreground">{item.agent} • {item.time}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Performing Agents</CardTitle>
                <CardDescription>Agents with highest efficiency and success rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {agentPerformance
                    ?.sort((a, b) => b.efficiency - a.efficiency)
                    ?.slice(0, 5)
                    ?.map((agent, index) => (
                      <div key={agent.agentId} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{agent.agentName}</div>
                            <div className="text-xs text-muted-foreground">{agent.totalRuns} runs</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{Math.max(0, Math.min(100, agent.efficiency)).toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">Efficiency</div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="intelligence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Intelligence Operations</CardTitle>
              <CardDescription>Performance metrics and operational insights</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Query Performance</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Queries</span>
                      <span className="font-medium">{intelligenceMetrics?.totalQueries?.toLocaleString() || "0"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Success Rate</span>
                      <span className="font-medium">{Math.max(0, Math.min(100, intelligenceMetrics?.successRate || 0)).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Avg Response Time</span>
                      <span className="font-medium">{intelligenceMetrics?.avgResponseTime?.toFixed(0) || "0"}ms</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Fallback Rate</span>
                      <span className="font-medium">{intelligenceMetrics?.fallbackRate?.toFixed(1) || "0"}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Quality Metrics</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Quality Score</span>
                      <span className="font-medium">{intelligenceMetrics?.qualityScore?.toFixed(1) || "0"}/10</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>User Satisfaction</span>
                      <span className="font-medium">{intelligenceMetrics?.userSatisfaction?.toFixed(1) || "0"}/10</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Cost per Query</span>
                      <span className="font-medium">${intelligenceMetrics?.costPerQuery?.toFixed(4) || "0"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Cost</span>
                      <span className="font-medium">${intelligenceMetrics?.totalCost?.toFixed(2) || "0"}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Trends</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-sm">Query volume increasing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-sm">Success rate improving</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-red-600" />
                      <span className="text-sm">Response time decreasing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-sm">Cost efficiency improving</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Performance Analysis</CardTitle>
              <CardDescription>Detailed performance metrics for all agents</CardDescription>
            </CardHeader>
            <CardContent>
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
                          <div className="text-sm font-medium">${((agent as any).costPerSuccess || 0.045).toFixed(3)}</div>
                          <div className="text-xs text-muted-foreground">Cost/Success</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{((agent as any).p95Latency || 1450).toFixed(0)}ms</div>
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

        <TabsContent value="savings" className="space-y-4">
          {savingsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading cost & savings…</p>
              </div>
            </div>
          ) : (
            <IntelligenceSavings />
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <EnhancedAnalytics />
        </TabsContent>
      </Tabs>

      {/* Agent Detail Modal */}
      <AgentDetailModal
        agent={selectedAgent}
        isOpen={isAgentModalOpen}
        onClose={() => {
          setIsAgentModalOpen(false);
          setSelectedAgent(null);
        }}
        onNavigate={(type, id) => {
          // Dismiss current modal, then navigate to new one
          setIsAgentModalOpen(false);
          setSelectedAgent(null);
          // TODO: Open new modal based on type and id
        }}
      />
    </div>
  );
}
