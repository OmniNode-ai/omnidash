import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Code, 
  Network, 
  Layers, 
  Target, 
  TrendingUp, 
  Search,
  Eye,
  Settings,
  FileText,
  GitBranch,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Activity,
  Database,
  Zap,
  Brain,
  Cpu,
  HardDrive,
  Users,
  BookOpen,
  Workflow
} from "lucide-react";

// Import existing components
import CodeIntelligence from "../CodeIntelligence";
import PatternLearning from "../PatternLearning";
import PatternLineage from "./PatternLineage";
import DuplicateDetection from "./DuplicateDetection";
import TechDebtAnalysis from "./TechDebtAnalysis";

// Mock data interfaces
interface CodeMetrics {
  totalFiles: number;
  totalLines: number;
  codeQualityScore: number;
  testCoverage: number;
  technicalDebt: number;
  duplicateCode: number;
  patterns: number;
  vulnerabilities: number;
}

interface PatternSummary {
  totalPatterns: number;
  activePatterns: number;
  qualityScore: number;
  usageCount: number;
  recentDiscoveries: number;
  topPatterns: Array<{
    name: string;
    category: string;
    quality: number;
    usage: number;
    lastUsed: string;
  }>;
}

interface TechDebtSummary {
  totalDebt: number;
  criticalIssues: number;
  refactoringOpportunities: number;
  duplicateFiles: number;
  outdatedPatterns: number;
  estimatedSavings: number;
}

export default function CodeIntelligenceSuite() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("30d");

  // API calls
  const { data: codeMetrics, isLoading: metricsLoading } = useQuery<CodeMetrics>({
    queryKey: ['code-metrics', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/code/metrics?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch code metrics');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const { data: patternSummary, isLoading: patternsLoading } = useQuery<PatternSummary>({
    queryKey: ['pattern-summary', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/patterns/summary?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch pattern summary');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const { data: techDebtSummary, isLoading: debtLoading } = useQuery<TechDebtSummary>({
    queryKey: ['tech-debt-summary', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/tech-debt/summary?timeRange=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch tech debt summary');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const isLoading = metricsLoading || patternsLoading || debtLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading code intelligence suite...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Code Intelligence Suite</h1>
          <p className="ty-subtitle">
            Comprehensive code analysis, pattern discovery, lineage tracking, and technical debt management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button size="sm">
            <Search className="w-4 h-4 mr-2" />
            Analyze Code
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analysis">Code Analysis</TabsTrigger>
          <TabsTrigger value="patterns">Pattern Discovery</TabsTrigger>
          <TabsTrigger value="lineage">Pattern Lineage</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicate Detection</TabsTrigger>
          <TabsTrigger value="techdebt">Tech Debt</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Code Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {codeMetrics?.totalFiles?.toLocaleString() || "0"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {codeMetrics?.totalLines?.toLocaleString() || "0"} lines of code
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Code Quality</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {codeMetrics?.codeQualityScore?.toFixed(1) || "0"}/10
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+0.3</span> from last week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Test Coverage</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {codeMetrics?.testCoverage?.toFixed(1) || "0"}%
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">+2.1%</span> from last week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Patterns</CardTitle>
                <Network className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {patternSummary?.totalPatterns || "0"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {patternSummary?.activePatterns || "0"} active patterns
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Technical Debt and Quality Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Technical Debt Overview</CardTitle>
                <CardDescription>Current technical debt and improvement opportunities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Debt</span>
                    <span className="text-lg font-bold text-orange-600">
                      {techDebtSummary?.totalDebt || 0} hours
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Critical Issues</span>
                    <span className="text-lg font-bold text-red-600">
                      {techDebtSummary?.criticalIssues || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Refactoring Opportunities</span>
                    <span className="text-lg font-bold text-blue-600">
                      {techDebtSummary?.refactoringOpportunities || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Estimated Savings</span>
                    <span className="text-lg font-bold text-green-600">
                      ${techDebtSummary?.estimatedSavings?.toLocaleString() || "0"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Code Quality Trends</CardTitle>
                <CardDescription>Quality metrics and improvement trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Code Quality Score</span>
                      <span>{codeMetrics?.codeQualityScore?.toFixed(1) || "0"}/10</span>
                    </div>
                    <Progress value={codeMetrics?.codeQualityScore * 10 || 0} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Test Coverage</span>
                      <span>{codeMetrics?.testCoverage?.toFixed(1) || "0"}%</span>
                    </div>
                    <Progress value={codeMetrics?.testCoverage || 0} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Duplicate Code</span>
                      <span>{codeMetrics?.duplicateCode?.toFixed(1) || "0"}%</span>
                    </div>
                    <Progress value={codeMetrics?.duplicateCode || 0} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Vulnerabilities</span>
                      <span>{codeMetrics?.vulnerabilities || 0}</span>
                    </div>
                    <Progress value={Math.min((codeMetrics?.vulnerabilities || 0) * 10, 100)} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Patterns and Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Patterns</CardTitle>
                <CardDescription>Most used and highest quality patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {patternSummary?.topPatterns?.slice(0, 5).map((pattern, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{pattern.name}</div>
                          <div className="text-xs text-muted-foreground">{pattern.category}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{pattern.quality.toFixed(1)}/10</div>
                        <div className="text-xs text-muted-foreground">{pattern.usage} uses</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Discoveries</CardTitle>
                <CardDescription>Latest pattern discoveries and code insights</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { type: "Pattern", name: "API Error Handling", quality: 8.5, time: "2h ago" },
                    { type: "Duplicate", name: "User Validation Logic", quality: 6.2, time: "4h ago" },
                    { type: "Pattern", name: "Database Connection Pool", quality: 9.1, time: "6h ago" },
                    { type: "Debt", name: "Legacy Authentication", quality: 4.3, time: "8h ago" },
                    { type: "Pattern", name: "Caching Strategy", quality: 8.8, time: "12h ago" }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          item.type === 'Pattern' ? 'bg-green-500' :
                          item.type === 'Duplicate' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></div>
                        <div>
                          <div className="font-medium text-sm">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.type} • {item.time}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{item.quality}/10</div>
                        <div className="text-xs text-muted-foreground">Quality</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <CodeIntelligence />
        </TabsContent>

        <TabsContent value="patterns" className="space-y-4">
          <PatternLearning />
        </TabsContent>

        <TabsContent value="lineage" className="space-y-4">
          <PatternLineage />
        </TabsContent>

        <TabsContent value="duplicates" className="space-y-4">
          <DuplicateDetection />
        </TabsContent>

        <TabsContent value="techdebt" className="space-y-4">
          <TechDebtAnalysis />
        </TabsContent>
      </Tabs>
    </div>
  );
}
