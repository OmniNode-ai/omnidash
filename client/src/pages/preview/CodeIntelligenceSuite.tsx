import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Workflow,
  CalendarIcon,
  RefreshCw
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// Import existing components
import CodeIntelligence from "../CodeIntelligence";
import PatternLearning from "../PatternLearning";
import PatternLineage from "./PatternLineage";
import PatternDependencies from "./PatternDependencies";
import TechDebtAnalysis from "./TechDebtAnalysis";
import { DashboardSection } from "@/components/DashboardSection";
import { MetricCard } from "@/components/MetricCard";
import { MockDataBadge } from "@/components/MockDataBadge";
import { codeIntelligenceSource } from "@/lib/data-sources";
import { formatCurrency } from "@/lib/utils";

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
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use centralized data source for compliance
  const { data: complianceResult, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['code-compliance', timeRange],
    queryFn: () => codeIntelligenceSource.fetchCompliance(timeRange),
    retry: false,
    refetchInterval: 60000,
  });
  
  // Transform compliance data to code metrics format
  const codeMetrics: CodeMetrics | undefined = complianceResult?.data ? {
    totalFiles: complianceResult.data.summary?.totalFiles || 0,
    totalLines: 0,
    codeQualityScore: (complianceResult.data.summary?.avgComplianceScore || 0) * 10,
    testCoverage: 0,
    technicalDebt: 0,
    duplicateCode: 0,
    patterns: 0,
    vulnerabilities: complianceResult.data.summary?.nonCompliantFiles || 0,
  } : undefined;

  const { data: patternSummaryResult, isLoading: patternsLoading, error: patternsError } = useQuery({
    queryKey: ['pattern-summary', timeRange],
    queryFn: () => codeIntelligenceSource.fetchPatternSummary(),
    retry: false,
    refetchInterval: 60000,
  });
  const patternSummary = patternSummaryResult?.data;

  const { data: techDebtSummary, isLoading: debtLoading, error: debtError } = useQuery<TechDebtSummary>({
    queryKey: ['tech-debt-summary', timeRange],
    queryFn: async () => {
      // Tech debt endpoint doesn't exist yet - return mock data
      throw new Error('Tech debt endpoint not available');
    },
    retry: false,
    refetchInterval: 60000,
  });
  
  // Determine which data sources are using mock data
  const usingMockCodeMetrics = !codeMetrics || codeMetrics.totalFiles === 0;
  const usingMockPatternSummary = !patternSummary || patternSummary.totalPatterns === 0;
  const usingMockTechDebt = !techDebtSummary;
  
  // Fallback mock data
  const mockCodeMetrics: CodeMetrics = {
    totalFiles: 1250,
    totalLines: 125000,
    codeQualityScore: 8.5,
    testCoverage: 78,
    technicalDebt: 250,
    duplicateCode: 8,
    patterns: 125,
    vulnerabilities: 3,
  };
  
  const mockPatternSummary: PatternSummary = {
    totalPatterns: 125,
    activePatterns: 98,
    qualityScore: 8.5,
    usageCount: 456,
    recentDiscoveries: 5,
    topPatterns: [
      { name: 'API Error Handling', category: 'Error Management', quality: 9.1, usage: 45, lastUsed: new Date().toISOString() },
      { name: 'Database Connection Pool', category: 'Performance', quality: 8.8, usage: 38, lastUsed: new Date().toISOString() },
      { name: 'Caching Strategy', category: 'Performance', quality: 8.5, usage: 32, lastUsed: new Date().toISOString() },
    ],
  };
  
  const mockTechDebt: TechDebtSummary = {
    totalDebt: 250,
    criticalIssues: 8,
    refactoringOpportunities: 23,
    duplicateFiles: 15,
    outdatedPatterns: 5,
    estimatedSavings: 45000,
  };
  
  // Use live data if available, otherwise use mock
  const finalCodeMetrics = usingMockCodeMetrics ? mockCodeMetrics : codeMetrics!;
  const finalPatternSummary = usingMockPatternSummary ? mockPatternSummary : patternSummary!;
  const finalTechDebt = usingMockTechDebt ? mockTechDebt : techDebtSummary!;

  // Don't show loading state if we're using mock data
  const isLoading = (metricsLoading && !usingMockCodeMetrics) ||
                    (patternsLoading && !usingMockPatternSummary) ||
                    (debtLoading && !usingMockTechDebt);

  // Check for errors (only show if all queries failed and we have no mock data)
  const hasError = (metricsError || patternsError) && !usingMockCodeMetrics && !usingMockPatternSummary;

  if (isLoading && !usingMockCodeMetrics && !usingMockPatternSummary && !usingMockTechDebt) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading code intelligence suite...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Code Intelligence Suite</h1>
            <p className="ty-subtitle">
              Comprehensive code analysis, pattern discovery, lineage tracking, and technical debt management
            </p>
          </div>
        </div>
        <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-destructive">
          <strong>Error loading data:</strong>{" "}
          {metricsError instanceof Error ? metricsError.message : patternsError instanceof Error ? patternsError.message : 'Unknown error'}
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Determine if using any mock data
  const usingAnyMockData = usingMockCodeMetrics || usingMockPatternSummary || usingMockTechDebt;

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

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
          {usingAnyMockData && <MockDataBadge />}
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button variant="outline" size="sm">
            <Eye className="w-4 h-4 mr-2" />
            Export Report
          </Button>

          {/* Time range selector with divider */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
            <Button
              variant={timeRange === "1h" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("1h")}
            >
              1H
            </Button>
            <Button
              variant={timeRange === "24h" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("24h")}
            >
              24H
            </Button>
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

            {/* Custom date range picker */}
            <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
              <PopoverTrigger asChild>
                <Button
                  variant={timeRange === "custom" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                >
                  <CalendarIcon className="h-4 w-4" />
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={(range) => {
                    setCustomRange(range);
                    if (range?.from && range?.to) {
                      setTimeRange("custom");
                      setShowCustomPicker(false);
                    }
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Show selected custom range */}
            {timeRange === "custom" && customRange?.from && customRange?.to && (
              <span className="text-sm text-muted-foreground">
                {format(customRange.from, "MMM d")} - {format(customRange.to, "MMM d, yyyy")}
              </span>
            )}

            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analysis">Code Analysis</TabsTrigger>
          <TabsTrigger value="patterns">Pattern Discovery</TabsTrigger>
          <TabsTrigger value="lineage">Pattern Lineage</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="techdebt">Tech Debt</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <DashboardSection
            title="Code Intelligence Overview"
            description="Comprehensive code quality metrics, pattern analysis, and technical debt tracking across your entire codebase."
          >
            {/* Code Metrics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Proven Patterns as hero metric per YC script */}
              <MetricCard
                label="Proven Patterns"
                value={finalPatternSummary?.totalPatterns || 125}
                icon={Network}
                tooltip={`${finalPatternSummary?.activePatterns || 98} active patterns, ${finalPatternSummary?.topPatterns?.length || 3} proven implementations`}
              />

              <MetricCard
                label="Total Files"
                value={finalCodeMetrics?.totalFiles?.toLocaleString() || "0"}
                icon={FileText}
                tooltip={`${finalCodeMetrics?.totalLines?.toLocaleString() || "0"} lines of code`}
              />

              <MetricCard
                label="Code Quality"
                value={`${finalCodeMetrics?.codeQualityScore?.toFixed(1) || "0"}/10`}
                icon={CheckCircle}
                trend={usingMockCodeMetrics ? undefined : { value: 0.3, isPositive: true }}
                tooltip="Quality score from last 7 days"
              />

              <MetricCard
                label="Test Coverage"
                value={`${finalCodeMetrics?.testCoverage?.toFixed(1) || "0"}%`}
                icon={Target}
                trend={usingMockCodeMetrics ? undefined : { value: 2.1, isPositive: true }}
                tooltip="Coverage change from last 7 days"
              />
            </div>
          </DashboardSection>

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
                      {finalTechDebt?.totalDebt || 0} hours
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Critical Issues</span>
                    <span className="text-lg font-bold text-red-600">
                      {finalTechDebt?.criticalIssues || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Refactoring Opportunities</span>
                    <span className="text-lg font-bold text-blue-600">
                      {finalTechDebt?.refactoringOpportunities || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Estimated Savings</span>
                    <span className="text-lg font-bold text-green-600">
                      {formatCurrency(finalTechDebt?.estimatedSavings || 0)}
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
                      <span>{finalCodeMetrics?.codeQualityScore?.toFixed(1) || "0"}/10</span>
                    </div>
                    <Progress value={finalCodeMetrics?.codeQualityScore * 10 || 0} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Test Coverage</span>
                      <span>{finalCodeMetrics?.testCoverage?.toFixed(1) || "0"}%</span>
                    </div>
                    <Progress value={finalCodeMetrics?.testCoverage || 0} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Duplicate Code</span>
                      <span>{finalCodeMetrics?.duplicateCode?.toFixed(1) || "0"}%</span>
                    </div>
                    <Progress value={finalCodeMetrics?.duplicateCode || 0} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Vulnerabilities</span>
                      <span>{finalCodeMetrics?.vulnerabilities || 0}</span>
                    </div>
                    <Progress value={Math.min((finalCodeMetrics?.vulnerabilities || 0) * 10, 100)} className="h-2" />
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
                  {finalPatternSummary?.topPatterns?.slice(0, 5).map((pattern, index) => (
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

        <TabsContent value="dependencies" className="space-y-4">
          <PatternDependencies />
        </TabsContent>

        <TabsContent value="techdebt" className="space-y-4">
          <TechDebtAnalysis />
        </TabsContent>
      </Tabs>
    </div>
  );
}
