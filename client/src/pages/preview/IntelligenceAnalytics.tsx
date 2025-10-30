import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalRuns: number;
  successRate: number;
  avgExecutionTime: number;
  avgQualityScore: number;
  efficiency: number;
  popularity: number;
  lastUsed: string;
}

interface SavingsMetrics {
  totalSavings: number;
  monthlySavings: number;
  weeklySavings: number;
  dailySavings: number;
  intelligenceRuns: number;
  baselineRuns: number;
  avgTokensPerRun: number;
  avgComputePerRun: number;
  costPerToken: number;
  costPerCompute: number;
  efficiencyGain: number;
  timeSaved: number;
}

export default function IntelligenceAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("30d");
  const [selectedAgent, setSelectedAgent] = useState<AgentPerformance | null>(null);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);

  // API calls for intelligence metrics
  const { data: intelligenceMetrics, isLoading: metricsLoading } = useQuery<IntelligenceMetrics>({
    queryKey: ['intelligence-metrics', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/intelligence/metrics?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch intelligence metrics');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const { data: agentPerformance, isLoading: agentsLoading } = useQuery<AgentPerformance[]>({
    queryKey: ['agent-performance', timeRange],
    queryFn: async () => {
      // For now, use mock data since the API returns a different structure
      // In production, we would transform the API response to match this interface
      return [
        {
          agentId: "polymorphic-agent",
          agentName: "Polymorphic Agent",
          totalRuns: 1250,
          successRate: 0.95,
          avgExecutionTime: 1.2,
          avgQualityScore: 0.92,
          efficiency: 0.92,
          popularity: 0.85,
          lastUsed: new Date().toISOString()
        },
        {
          agentId: "code-reviewer",
          agentName: "Code Reviewer",
          totalRuns: 890,
          successRate: 0.92,
          avgExecutionTime: 2.1,
          avgQualityScore: 0.88,
          efficiency: 0.88,
          popularity: 0.72,
          lastUsed: new Date(Date.now() - 3600000).toISOString()
        },
        {
          agentId: "test-generator",
          agentName: "Test Generator",
          totalRuns: 650,
          successRate: 0.89,
          avgExecutionTime: 3.2,
          avgQualityScore: 0.85,
          efficiency: 0.85,
          popularity: 0.65,
          lastUsed: new Date(Date.now() - 7200000).toISOString()
        },
        {
          agentId: "documentation-writer",
          agentName: "Documentation Writer",
          totalRuns: 420,
          successRate: 0.94,
          avgExecutionTime: 1.8,
          avgQualityScore: 0.90,
          efficiency: 0.90,
          popularity: 0.58,
          lastUsed: new Date(Date.now() - 10800000).toISOString()
        },
        {
          agentId: "bug-analyzer",
          agentName: "Bug Analyzer",
          totalRuns: 780,
          successRate: 0.91,
          avgExecutionTime: 2.5,
          avgQualityScore: 0.87,
          efficiency: 0.87,
          popularity: 0.68,
          lastUsed: new Date(Date.now() - 1800000).toISOString()
        }
      ];
    },
    refetchInterval: 60000,
  });

  const { data: savingsMetrics, isLoading: savingsLoading } = useQuery<SavingsMetrics>({
    queryKey: ['savings-metrics', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/savings/metrics?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch savings metrics');
      return response.json();
    },
    refetchInterval: 60000,
  });

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
          <p className="text-muted-foreground">
            Comprehensive analytics for intelligence operations, agent performance, and cost optimization
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                  <span className="text-green-600">+12.5%</span> from last month
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
                  {intelligenceMetrics?.successRate?.toFixed(1) || "0"}%
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+2.1%</span> from last month
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
                  {intelligenceMetrics?.avgResponseTime?.toFixed(0) || "0"}ms
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-red-600">-15ms</span> from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${savingsMetrics?.totalSavings?.toLocaleString() || "0"}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+8.3%</span> from last month
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
                <div className="space-y-4">
                  {[
                    { action: "API optimization query", agent: "agent-performance", time: "2m ago", status: "completed" },
                    { action: "Debug database connection", agent: "agent-debug-intelligence", time: "5m ago", status: "completed" },
                    { action: "Create React component", agent: "agent-frontend-developer", time: "8m ago", status: "executing" },
                    { action: "Write unit tests", agent: "agent-testing", time: "12m ago", status: "completed" },
                    { action: "Design microservices", agent: "agent-api-architect", time: "15m ago", status: "completed" }
                  ].map((item, index) => (
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
                          <div className="text-sm font-medium">{agent.efficiency.toFixed(1)}%</div>
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
                      <span className="font-medium">{intelligenceMetrics?.successRate?.toFixed(1) || "0"}%</span>
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
                          <div className="text-sm font-medium">{agent.efficiency.toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">Efficiency</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{agent.successRate.toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">Success Rate</div>
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
                        <Progress value={agent.avgQualityScore * 10} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{agent.avgQualityScore.toFixed(1)}/10</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Efficiency</div>
                        <Progress value={agent.efficiency} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{agent.efficiency.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Popularity</div>
                        <Progress value={agent.popularity} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{agent.popularity.toFixed(1)}%</div>
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
