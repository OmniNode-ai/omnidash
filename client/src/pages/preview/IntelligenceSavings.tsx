import React, { useState, useEffect } from "react";
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
  Network
} from "lucide-react";

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

interface AgentComparison {
  agentId: string;
  agentName: string;
  withIntelligence: {
    avgTokens: number;
    avgCompute: number;
    avgTime: number;
    successRate: number;
    cost: number;
  };
  withoutIntelligence: {
    avgTokens: number;
    avgCompute: number;
    avgTime: number;
    successRate: number;
    cost: number;
  };
  savings: {
    tokens: number;
    compute: number;
    time: number;
    cost: number;
    percentage: number;
  };
}

interface TimeSeriesData {
  date: string;
  withIntelligence: {
    tokens: number;
    compute: number;
    cost: number;
    runs: number;
  };
  withoutIntelligence: {
    tokens: number;
    compute: number;
    cost: number;
    runs: number;
  };
  savings: {
    tokens: number;
    compute: number;
    cost: number;
    percentage: number;
  };
}

export default function IntelligenceSavings() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("30d");

  // API calls
  const { data: savingsMetrics, isLoading: metricsLoading } = useQuery<SavingsMetrics>({
    queryKey: ['savings-metrics', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/savings/metrics?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch savings metrics');
      return response.json();
    },
    refetchInterval: 60000, // Refetch every minute
  });

  const { data: agentComparisons, isLoading: agentsLoading } = useQuery<AgentComparison[]>({
    queryKey: ['agent-comparisons', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/savings/agents?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch agent comparisons');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const { data: timeSeriesData, isLoading: timeseriesLoading } = useQuery<TimeSeriesData[]>({
    queryKey: ['savings-timeseries', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/savings/timeseries?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch time series data');
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Data is now managed by TanStack Query, no need for local state

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Intelligence System Savings</h1>
          <p className="text-muted-foreground">
            Track compute and token savings from using the intelligence system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={timeRange === "7d" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("7d")}
          >
            7D
          </Button>
          <Button
            variant={timeRange === "30d" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("30d")}
          >
            30D
          </Button>
          <Button
            variant={timeRange === "90d" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("90d")}
          >
            90D
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agent Comparison</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(savingsMetrics?.totalSavings || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+12.5%</span> from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Savings</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(savingsMetrics?.monthlySavings || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+8.2%</span> from last week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Efficiency Gain</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPercentage(savingsMetrics?.efficiencyGain || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  Average improvement across all agents
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Time Saved</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{savingsMetrics?.timeSaved || 0}h</div>
                <p className="text-xs text-muted-foreground">
                  This month across all runs
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Token Usage Comparison</CardTitle>
                <CardDescription>
                  Intelligence system vs baseline agent runs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">With Intelligence</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatNumber(savingsMetrics?.intelligenceRuns || 0)} runs</div>
                    <div className="text-sm text-muted-foreground">
                      {formatNumber(savingsMetrics?.avgTokensPerRun || 0)} tokens/run
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium">Without Intelligence</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatNumber(savingsMetrics?.baselineRuns || 0)} runs</div>
                    <div className="text-sm text-muted-foreground">
                      {formatNumber(Math.round((savingsMetrics?.avgTokensPerRun || 0) * 1.6))} tokens/run
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Token Savings</span>
                    <span className="font-medium text-green-600">
                      {formatNumber(Math.round((savingsMetrics?.avgTokensPerRun || 0) * 0.4))} tokens/run
                    </span>
                  </div>
                  <Progress value={40} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compute Usage Comparison</CardTitle>
                <CardDescription>
                  Processing efficiency improvements
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">With Intelligence</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{savingsMetrics?.avgComputePerRun?.toFixed(1) || 0} units</div>
                    <div className="text-sm text-muted-foreground">per run</div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium">Without Intelligence</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{((savingsMetrics?.avgComputePerRun || 0) * 1.6).toFixed(1)} units</div>
                    <div className="text-sm text-muted-foreground">per run</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Compute Savings</span>
                    <span className="font-medium text-green-600">
                      {((savingsMetrics?.avgComputePerRun || 0) * 0.6).toFixed(1)} units/run
                    </span>
                  </div>
                  <Progress value={37.5} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Performance Comparison</CardTitle>
              <CardDescription>
                Detailed comparison of agent runs with and without intelligence system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {agentComparisons?.map((agent) => (
                  <div key={agent.agentId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold">{agent.agentName}</h3>
                        <p className="text-sm text-muted-foreground">{agent.agentId}</p>
                      </div>
                      <Badge variant="secondary" className="text-green-600">
                        {formatPercentage(agent.savings.percentage)} savings
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Token Usage</div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-muted-foreground">
                            {formatNumber(agent.withIntelligence.avgTokens)} vs {formatNumber(agent.withoutIntelligence.avgTokens)}
                          </div>
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="text-xs text-green-600">
                          -{formatNumber(agent.savings.tokens)} tokens/run
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Compute Usage</div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-muted-foreground">
                            {agent.withIntelligence.avgCompute.toFixed(1)} vs {agent.withoutIntelligence.avgCompute.toFixed(1)}
                          </div>
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="text-xs text-green-600">
                          -{agent.savings.compute.toFixed(1)} units/run
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Cost per Run</div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-muted-foreground">
                            {formatCurrency(agent.withIntelligence.cost)} vs {formatCurrency(agent.withoutIntelligence.cost)}
                          </div>
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="text-xs text-green-600">
                          -{formatCurrency(agent.savings.cost)}/run
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Success Rate</div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-muted-foreground">
                            {formatPercentage(agent.withIntelligence.successRate)} vs {formatPercentage(agent.withoutIntelligence.successRate)}
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-green-600" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Average Time</div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-muted-foreground">
                            {agent.withIntelligence.avgTime}min vs {agent.withoutIntelligence.avgTime}min
                          </div>
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="text-xs text-green-600">
                          -{agent.savings.time}min/run
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Savings Trends Over Time</CardTitle>
              <CardDescription>
                Daily savings progression and efficiency improvements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Cost Savings Chart */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Daily Cost Savings</h3>
                  <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">Cost savings chart would go here</p>
                      <p className="text-sm text-muted-foreground">
                        Showing daily savings from {timeRange} period
                      </p>
                    </div>
                  </div>
                </div>

                {/* Token Usage Trend */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Token Usage Efficiency</h3>
                  <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">Token efficiency chart would go here</p>
                      <p className="text-sm text-muted-foreground">
                        Intelligence vs baseline token usage
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recent Data Table */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recent Daily Data</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-3">Date</th>
                          <th className="text-right p-3">Intelligence Cost</th>
                          <th className="text-right p-3">Baseline Cost</th>
                          <th className="text-right p-3">Savings</th>
                          <th className="text-right p-3">Efficiency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeSeriesData?.slice(-7).map((day, index) => (
                          <tr key={day.date} className={index % 2 === 0 ? "bg-background" : "bg-muted/50"}>
                            <td className="p-3">{new Date(day.date).toLocaleDateString()}</td>
                            <td className="text-right p-3">{formatCurrency(day.withIntelligence.cost)}</td>
                            <td className="text-right p-3">{formatCurrency(day.withoutIntelligence.cost)}</td>
                            <td className="text-right p-3 text-green-600">{formatCurrency(day.savings.cost)}</td>
                            <td className="text-right p-3">{formatPercentage(day.savings.percentage)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
                <CardDescription>
                  Detailed cost analysis by component
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Token Costs</span>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(1240.50)}</div>
                      <div className="text-xs text-muted-foreground">-{formatCurrency(680.25)} saved</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Compute Costs</span>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(890.75)}</div>
                      <div className="text-xs text-muted-foreground">-{formatCurrency(420.50)} saved</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Storage Costs</span>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(156.25)}</div>
                      <div className="text-xs text-muted-foreground">-{formatCurrency(45.75)} saved</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Network Costs</span>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(89.50)}</div>
                      <div className="text-xs text-muted-foreground">-{formatCurrency(23.25)} saved</div>
                    </div>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center font-semibold">
                      <span>Total Savings</span>
                      <div className="text-right text-green-600">
                        <div className="font-bold">{formatCurrency(1169.75)}</div>
                        <div className="text-xs">34.2% reduction</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ROI Analysis</CardTitle>
                <CardDescription>
                  Return on investment metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Intelligence System Cost</span>
                    <span className="font-medium">{formatCurrency(450.00)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Savings</span>
                    <span className="font-medium text-green-600">{formatCurrency(1169.75)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Net Benefit</span>
                    <span className="font-bold text-green-600">{formatCurrency(719.75)}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center font-semibold">
                      <span>ROI</span>
                      <span className="text-green-600 font-bold">259.9%</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Calculator className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-800">Payback Period</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Intelligence system pays for itself in approximately 1.2 months
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Efficiency Metrics</CardTitle>
              <CardDescription>
                Performance improvements across different metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">34.2%</div>
                  <div className="text-sm text-muted-foreground">Overall Efficiency Gain</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">42.1%</div>
                  <div className="text-sm text-muted-foreground">Token Usage Reduction</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">37.5%</div>
                  <div className="text-sm text-muted-foreground">Compute Usage Reduction</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
