import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { intelligenceAnalyticsSource } from "@/lib/data-sources";
import { intelligenceSavingsSource } from "@/lib/data-sources/intelligence-savings-source";
import { POLLING_INTERVAL_SLOW, POLLING_INTERVAL_MEDIUM, STALE_TIME_IMMEDIATE } from "@/lib/constants/query-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Code,
  TestTube,
  Server,
  Users,
  Eye,
  Settings,
  RefreshCw,
  Download,
  Filter,
  CalendarIcon,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// Import existing components
import { EnhancedAnalytics } from "./EnhancedAnalytics";
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
import type { SavingsMetrics } from "@/lib/data-sources/intelligence-analytics-source";
import { Info } from "lucide-react";

export default function IntelligenceAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [selectedPatternCategory, setSelectedPatternCategory] = useState<string | null>(null);
  const [patternDialogPage, setPatternDialogPage] = useState(1);
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);

  // Mock pattern data for detailed view
  const patternDetails: Record<string, Array<{ name: string; description: string; usageCount: number; effectiveness: number }>> = {
    "API Integration": [
      { name: "REST API Retry Pattern", description: "Automatic retry logic with exponential backoff for failed API requests", usageCount: 142, effectiveness: 94 },
      { name: "GraphQL Query Optimization", description: "Optimized query batching and caching for GraphQL endpoints", usageCount: 89, effectiveness: 87 },
      { name: "Rate Limiting Handler", description: "Intelligent rate limiting with queue management", usageCount: 67, effectiveness: 91 },
      { name: "API Response Caching", description: "Smart caching layer for frequently accessed API responses", usageCount: 54, effectiveness: 88 },
      { name: "Webhook Event Processing", description: "Reliable webhook handling with event deduplication", usageCount: 43, effectiveness: 92 },
      { name: "OAuth Token Refresh", description: "Automatic OAuth token refresh before expiration", usageCount: 38, effectiveness: 96 },
      { name: "API Circuit Breaker", description: "Circuit breaker pattern for failing API endpoints", usageCount: 32, effectiveness: 89 },
      { name: "Request Throttling", description: "Adaptive request throttling based on server capacity", usageCount: 28, effectiveness: 85 },
      { name: "API Versioning Strategy", description: "Backward-compatible API versioning implementation", usageCount: 24, effectiveness: 90 },
      { name: "Multipart Upload Handler", description: "Chunked file upload with resume capability", usageCount: 19, effectiveness: 93 },
    ],
    "Data Transformation": [
      { name: "JSON Schema Validation", description: "Runtime JSON schema validation with detailed error messages", usageCount: 156, effectiveness: 92 },
      { name: "Data Normalization Pipeline", description: "Standardized data transformation pipeline for consistent formats", usageCount: 134, effectiveness: 88 },
      { name: "Type-Safe Data Mapping", description: "TypeScript-based data mapping with compile-time checks", usageCount: 98, effectiveness: 95 },
      { name: "CSV to JSON Converter", description: "Efficient CSV parsing with type inference", usageCount: 76, effectiveness: 86 },
      { name: "XML Data Parser", description: "Robust XML parsing with namespace support", usageCount: 62, effectiveness: 84 },
      { name: "Data Aggregation Pipeline", description: "High-performance data aggregation with streaming support", usageCount: 54, effectiveness: 90 },
      { name: "Field Encryption/Decryption", description: "Transparent field-level encryption for sensitive data", usageCount: 47, effectiveness: 97 },
      { name: "Date Format Standardization", description: "Automatic date format detection and conversion", usageCount: 41, effectiveness: 89 },
      { name: "Data Deduplication", description: "Efficient duplicate detection and removal", usageCount: 35, effectiveness: 91 },
      { name: "Nested Object Flattening", description: "Smart flattening of deeply nested data structures", usageCount: 29, effectiveness: 87 },
    ],
    "Error Handling": [
      { name: "Global Error Boundary", description: "React error boundary with automatic error reporting", usageCount: 187, effectiveness: 93 },
      { name: "Async Error Handler", description: "Centralized async error handling with retry logic", usageCount: 145, effectiveness: 89 },
      { name: "User-Friendly Error Messages", description: "Context-aware error message generation", usageCount: 123, effectiveness: 91 },
      { name: "Error Logging Integration", description: "Structured error logging with stack trace capture", usageCount: 98, effectiveness: 95 },
      { name: "Network Error Recovery", description: "Automatic recovery from transient network failures", usageCount: 87, effectiveness: 88 },
      { name: "Validation Error Aggregation", description: "Collecting and displaying multiple validation errors", usageCount: 76, effectiveness: 90 },
      { name: "Database Error Handler", description: "Graceful handling of database connection issues", usageCount: 64, effectiveness: 87 },
      { name: "File System Error Recovery", description: "Robust file operation error handling", usageCount: 52, effectiveness: 86 },
      { name: "Memory Limit Error Handler", description: "Detecting and recovering from out-of-memory conditions", usageCount: 43, effectiveness: 92 },
      { name: "Timeout Error Management", description: "Configurable timeout handling with fallback strategies", usageCount: 38, effectiveness: 89 },
    ],
    "UI Components": [
      { name: "Data Table Component", description: "Reusable data table with sorting, filtering, and pagination", usageCount: 167, effectiveness: 94 },
      { name: "Form Validation Framework", description: "Declarative form validation with real-time feedback", usageCount: 143, effectiveness: 91 },
      { name: "Loading State Manager", description: "Consistent loading indicators across the application", usageCount: 128, effectiveness: 88 },
      { name: "Modal Dialog System", description: "Accessible modal dialogs with keyboard navigation", usageCount: 112, effectiveness: 90 },
      { name: "Responsive Navigation Menu", description: "Mobile-friendly navigation with smooth transitions", usageCount: 98, effectiveness: 92 },
      { name: "Toast Notification System", description: "Non-intrusive toast notifications with queuing", usageCount: 87, effectiveness: 89 },
      { name: "Infinite Scroll Component", description: "Virtualized infinite scroll for large datasets", usageCount: 74, effectiveness: 86 },
      { name: "File Upload Widget", description: "Drag-and-drop file upload with preview", usageCount: 63, effectiveness: 93 },
      { name: "Autocomplete Input", description: "Debounced autocomplete with keyboard navigation", usageCount: 56, effectiveness: 88 },
      { name: "Chart Visualization Library", description: "Responsive charts with interactive tooltips", usageCount: 49, effectiveness: 91 },
    ],
    "State Management": [
      { name: "Redux Toolkit Integration", description: "Type-safe Redux implementation with RTK Query", usageCount: 134, effectiveness: 92 },
      { name: "React Query Cache Manager", description: "Optimized server state management with React Query", usageCount: 118, effectiveness: 95 },
      { name: "Context API Optimization", description: "Performance-optimized React Context usage", usageCount: 102, effectiveness: 87 },
      { name: "Local Storage Sync", description: "Automatic synchronization between state and local storage", usageCount: 89, effectiveness: 90 },
      { name: "Zustand Store Pattern", description: "Lightweight state management with Zustand", usageCount: 76, effectiveness: 93 },
      { name: "Form State Management", description: "React Hook Form integration for complex forms", usageCount: 67, effectiveness: 89 },
      { name: "Optimistic Updates", description: "Optimistic UI updates with rollback capability", usageCount: 58, effectiveness: 91 },
      { name: "State Persistence Layer", description: "Automatic state persistence across page reloads", usageCount: 51, effectiveness: 88 },
      { name: "Derived State Computation", description: "Memoized derived state with efficient updates", usageCount: 44, effectiveness: 86 },
      { name: "State Migration Strategy", description: "Versioned state schema with migration logic", usageCount: 37, effectiveness: 90 },
    ],
  };

  // Use centralized data source for metrics
  const { data: metricsResult, isLoading: metricsLoading } = useQuery({
    queryKey: ['intelligence-metrics', timeRange],
    queryFn: () => intelligenceAnalyticsSource.fetchMetrics(timeRange),
    refetchInterval: POLLING_INTERVAL_SLOW,
  });
  
  const intelligenceMetrics = metricsResult?.data;
  const usingMockMetrics = metricsResult?.isMock || false;

  // Recent activity from data source
  const { data: activityResult, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => intelligenceAnalyticsSource.fetchRecentActivity(5),
    refetchInterval: POLLING_INTERVAL_MEDIUM,
  });
  
  const recentActivity = activityResult?.data || [];
  const usingMockActivity = activityResult?.isMock || false;

  const { data: savingsResult, isLoading: savingsLoading } = useQuery({
    queryKey: ['savings-metrics', timeRange],
    queryFn: () => intelligenceAnalyticsSource.fetchSavingsMetrics(timeRange),
    retry: false,
    refetchInterval: POLLING_INTERVAL_SLOW,
    staleTime: STALE_TIME_IMMEDIATE,
  });
  const savingsMetrics = savingsResult?.data;
  const usingMockSavings = savingsResult?.isMock || false;

  // Fetch agent comparisons for Savings by Agent section
  const { data: agentComparisonsResult } = useQuery({
    queryKey: ['agent-comparisons', timeRange],
    queryFn: () => intelligenceSavingsSource.fetchAgentComparisons(timeRange),
    retry: false,
    refetchInterval: POLLING_INTERVAL_SLOW,
  });
  const agentComparisons = agentComparisonsResult?.data || [];

  // Fetch provider savings for Savings by Provider section
  const { data: providerSavingsResult } = useQuery({
    queryKey: ['provider-savings', timeRange],
    queryFn: () => intelligenceSavingsSource.fetchProviderSavings(timeRange),
    retry: false,
    refetchInterval: POLLING_INTERVAL_SLOW,
  });
  const providerSavings = providerSavingsResult?.data || [];

  const isLoading = metricsLoading || savingsLoading;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

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
        <div className="flex items-center gap-2">
          {(usingMockMetrics || usingMockSavings || usingMockActivity) && <MockDataBadge />}
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button variant="outline" size="sm">
            <Eye className="w-4 h-4 mr-2" />
            Export Report
          </Button>

          {/* TIME RANGE CONTROLS - NOW GLOBAL */}
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
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="savings">Cost & Savings</TabsTrigger>
          <TabsTrigger value="analytics">Advanced Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Intelligence Operations Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Intelligence Operations Summary</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Performance Snapshot */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {intelligenceMetrics?.qualityScore?.toFixed(1) || "0"}/10
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Overall code quality
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">User Satisfaction</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {intelligenceMetrics?.userSatisfaction?.toFixed(1) || "0"}/10
                  </div>
                  <p className="text-xs text-muted-foreground">
                    User satisfaction score
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Fallback Rate</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {intelligenceMetrics?.fallbackRate?.toFixed(1) || "0"}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lower is better
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cost per Query</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${intelligenceMetrics?.costPerQuery?.toFixed(4) || "0"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average cost efficiency
                  </p>
                </CardContent>
              </Card>
            </div>
            </CardContent>
          </Card>

          {/* Cost Savings Highlights */}
          <Card>
            <CardHeader>
              <CardTitle>Cost Savings Highlights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Daily Savings</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${savingsMetrics?.dailySavings?.toFixed(2) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average daily cost reduction
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Weekly Savings</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${savingsMetrics?.weeklySavings?.toFixed(2) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Projected weekly savings
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Savings</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${savingsMetrics?.monthlySavings?.toFixed(2) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Projected monthly savings
                  </p>
                </CardContent>
              </Card>

              {/* Spacer card for consistent 4-column layout */}
              <Card className="border-dashed opacity-50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-transparent">Spacer</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-transparent">-</div>
                  <p className="text-xs text-transparent">
                    Placeholder
                  </p>
                </CardContent>
              </Card>
            </div>
            </CardContent>
          </Card>

          {/* Recent Activity & Spacer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <h3 className="text-base font-medium">Recent Activity</h3>
                <CardDescription>Latest intelligence operations and agent executions</CardDescription>
              </CardHeader>
              <CardContent>
                {usingMockActivity && <MockDataBadge className="mb-3" />}
                <div className="space-y-4">
                  {recentActivity.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-2 h-2 rounded-full ${
                          item.status === 'completed' ? 'bg-green-500' :
                          item.status === 'executing' ? 'bg-yellow-500' : 'bg-gray-500'
                        }`}></div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.action}</div>
                          <div className="text-xs text-muted-foreground">
                            <button
                              onClick={() => setSelectedActivity(item)}
                              className="hover:text-primary hover:underline cursor-pointer font-medium transition-colors"
                            >
                              {item.agent}
                            </button>
                            {' • '}
                            {item.time}
                          </div>
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

            {/* Empty spacer card for layout balance */}
            <Card className="border-dashed opacity-50">
              <CardContent className="h-32" />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="intelligence" className="space-y-4">
          {/* Query Performance Deep Dive */}
          <Card>
            <CardHeader>
              <CardTitle>Query Performance Details</CardTitle>
              <CardDescription>In-depth analysis of intelligence query execution and response patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2 p-4 border rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Total Queries</div>
                  <div className="text-2xl font-bold">{intelligenceMetrics?.totalQueries?.toLocaleString() || "0"}</div>
                  <Progress value={85} className="h-2" />
                  <div className="text-xs text-muted-foreground">85% within target SLA</div>
                </div>
                <div className="space-y-2 p-4 border rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Success Rate</div>
                  <div className="text-2xl font-bold text-green-600">
                    {Math.max(0, Math.min(100, intelligenceMetrics?.successRate || 0)).toFixed(1)}%
                  </div>
                  <Progress value={Math.max(0, Math.min(100, intelligenceMetrics?.successRate || 0))} className="h-2" />
                  <div className="text-xs text-muted-foreground">Target: 95%</div>
                </div>
                <div className="space-y-2 p-4 border rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Avg Response Time</div>
                  <div className="text-2xl font-bold">{intelligenceMetrics?.avgResponseTime?.toFixed(0) || "0"}ms</div>
                  <Progress value={65} className="h-2" />
                  <div className="text-xs text-muted-foreground">P95: {(intelligenceMetrics?.avgResponseTime || 0) * 1.5}ms</div>
                </div>
                <div className="space-y-2 p-4 border rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Fallback Rate</div>
                  <div className="text-2xl font-bold text-orange-600">{intelligenceMetrics?.fallbackRate?.toFixed(1) || "0"}%</div>
                  <Progress value={intelligenceMetrics?.fallbackRate || 0} className="h-2" />
                  <div className="text-xs text-muted-foreground">Lower is better</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quality Metrics Deep Dive */}
          <Card>
            <CardHeader>
              <CardTitle>Quality Metrics Deep Dive</CardTitle>
              <CardDescription>Comprehensive quality assessment across all intelligence operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Quality Score</span>
                      <span className="text-lg font-bold">{intelligenceMetrics?.qualityScore?.toFixed(1) || "0"}/10</span>
                    </div>
                    <Progress value={(intelligenceMetrics?.qualityScore || 0) * 10} className="h-3" />
                    <div className="text-xs text-muted-foreground">Based on code correctness, maintainability, and patterns</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">User Satisfaction</span>
                      <span className="text-lg font-bold">{intelligenceMetrics?.userSatisfaction?.toFixed(1) || "0"}/10</span>
                    </div>
                    <Progress value={(intelligenceMetrics?.userSatisfaction || 0) * 10} className="h-3" />
                    <div className="text-xs text-muted-foreground">Aggregated from user feedback and task completion</div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Cost per Query</span>
                      <span className="text-lg font-bold">${intelligenceMetrics?.costPerQuery?.toFixed(4) || "0"}</span>
                    </div>
                    <Progress value={45} className="h-3" />
                    <div className="text-xs text-muted-foreground">Includes tokens, compute, and overhead</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Cost</span>
                      <span className="text-lg font-bold">${intelligenceMetrics?.totalCost?.toFixed(2) || "0"}</span>
                    </div>
                    <Progress value={70} className="h-3" />
                    <div className="text-xs text-muted-foreground">All operations in current time period</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trend Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Trend Analysis</CardTitle>
              <CardDescription>Historical trends and pattern identification across intelligence metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Performance Trends</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm">Query volume</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">+23%</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm">Success rate</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">+5.2%</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-green-600" />
                        <span className="text-sm">Response time</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">-18%</Badge>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Efficiency Trends</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm">Cost efficiency</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">+12%</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-green-600" />
                        <span className="text-sm">Fallback rate</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">-8.3%</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm">Pattern reuse</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">+31%</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pattern Discovery */}
          <Card>
            <CardHeader>
              <CardTitle>Pattern Discovery</CardTitle>
              <CardDescription>Emerging patterns and insights from intelligence operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">New Patterns Discovered</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">142</div>
                      <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Pattern Reuse Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">68%</div>
                      <p className="text-xs text-muted-foreground mt-1">Up from 52% last month</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Code Similarity Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">8.4/10</div>
                      <p className="text-xs text-muted-foreground mt-1">Avg across all patterns</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold mb-3">Top Pattern Categories</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Patterns</TableHead>
                        <TableHead className="text-right">Usage</TableHead>
                        <TableHead className="text-right">Distribution</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { category: "API Integration", count: 38, percentage: 27 },
                        { category: "Data Transformation", count: 29, percentage: 20 },
                        { category: "Error Handling", count: 24, percentage: 17 },
                        { category: "UI Components", count: 21, percentage: 15 },
                        { category: "State Management", count: 18, percentage: 13 }
                      ].map((pattern) => (
                        <TableRow
                          key={pattern.category}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedPatternCategory(pattern.category);
                            setPatternDialogPage(1);
                          }}
                        >
                          <TableCell className="font-medium">{pattern.category}</TableCell>
                          <TableCell className="text-right">{pattern.count}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24">
                                <Progress value={pattern.percentage} className="h-2" />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {pattern.percentage}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="savings" className="space-y-6">
          {savingsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading cost & savings…</p>
              </div>
            </div>
          ) : (
            <>
              {/* Cost Savings Breakdown with Enhanced Trends */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>Cost Savings Breakdown</CardTitle>
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
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">${savingsMetrics?.totalSavings?.toLocaleString() || "0"}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          <span className="text-xs text-green-600 font-medium">+12% from last period</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          All savings in {timeRange}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Daily Savings</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">${savingsMetrics?.dailySavings?.toFixed(2) || "0.00"}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          <span className="text-xs text-green-600 font-medium">+8% vs yesterday</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Average daily cost reduction
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Weekly Savings</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">${savingsMetrics?.weeklySavings?.toFixed(2) || "0.00"}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          <span className="text-xs text-green-600 font-medium">+15% vs last week</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Projected weekly savings
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Savings</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">${savingsMetrics?.monthlySavings?.toFixed(2) || "0.00"}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          <span className="text-xs text-green-600 font-medium">+18% MoM growth</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Projected monthly savings
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {/* Expandable Token & Compute Usage Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Token Usage Card - Expandable */}
                <Card>
                  <CardHeader
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedSection(expandedSection === 'tokens' ? null : 'tokens')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle>Token Savings Breakdown</CardTitle>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" onClick={(e) => e.stopPropagation()} />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <div className="space-y-2 text-sm">
                              <p><strong>Intelligence Tokens:</strong> Actual token usage with pattern injection, manifest optimization, and intelligent caching enabled.</p>
                              <p><strong>Token Savings:</strong> Reduction achieved through pattern caching (40%), local model offloading (25%), optimized routing (20%), and other optimizations (15%).</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {expandedSection === 'tokens' ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </div>
                    <CardDescription>
                      {Math.round((savingsMetrics?.avgTokensPerRun || 0) * 0.4).toLocaleString()} tokens saved per run
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">With Intelligence</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{(savingsMetrics?.intelligenceRuns || 0).toLocaleString()} runs</div>
                        <div className="text-sm text-muted-foreground">
                          {(savingsMetrics?.avgTokensPerRun || 0).toLocaleString()} tokens/run
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium">Without Intelligence</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{(savingsMetrics?.baselineRuns || 0).toLocaleString()} runs</div>
                        <div className="text-sm text-muted-foreground">
                          {Math.round((savingsMetrics?.avgTokensPerRun || 0) * 1.6).toLocaleString()} tokens/run
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Total Token Savings</span>
                        <span className="font-bold text-green-600">
                          {Math.round((savingsMetrics?.avgTokensPerRun || 0) * 0.4).toLocaleString()} tokens/run (40%)
                        </span>
                      </div>
                      <Progress value={40} className="h-2" />
                    </div>

                    {expandedSection === 'tokens' && (
                      <div className="border-t pt-4 space-y-3">
                        <h4 className="text-sm font-semibold">Savings Breakdown by Source</h4>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                              <span>Pattern Caching</span>
                            </div>
                            <span className="font-bold">40%</span>
                          </div>
                          <Progress value={40} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {Math.round((savingsMetrics?.avgTokensPerRun || 0) * 0.16).toLocaleString()} tokens/run saved by reusing learned patterns
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500"></div>
                              <span>Local Models</span>
                            </div>
                            <span className="font-bold">25%</span>
                          </div>
                          <Progress value={25} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {Math.round((savingsMetrics?.avgTokensPerRun || 0) * 0.10).toLocaleString()} tokens/run offloaded to local models
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                              <span>Optimized Routing</span>
                            </div>
                            <span className="font-bold">20%</span>
                          </div>
                          <Progress value={20} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {Math.round((savingsMetrics?.avgTokensPerRun || 0) * 0.08).toLocaleString()} tokens/run saved by intelligent agent selection
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                              <span>Other Optimizations</span>
                            </div>
                            <span className="font-bold">15%</span>
                          </div>
                          <Progress value={15} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {Math.round((savingsMetrics?.avgTokensPerRun || 0) * 0.06).toLocaleString()} tokens/run from manifest compression & caching
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Compute Usage Card - Expandable */}
                <Card>
                  <CardHeader
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedSection(expandedSection === 'compute' ? null : 'compute')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle>Compute Savings Breakdown</CardTitle>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" onClick={(e) => e.stopPropagation()} />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <div className="space-y-2 text-sm">
                              <p><strong>Compute Units:</strong> A normalized measure of processing power used. One compute unit = 1 second of standard CPU processing or equivalent GPU/TPU time.</p>
                              <p><strong>Savings:</strong> Achieved through CPU offload (35%), memory optimization (30%), cache hits (20%), and query optimization (15%).</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {expandedSection === 'compute' ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </div>
                    <CardDescription>
                      {((savingsMetrics?.avgComputePerRun || 0) * 0.6).toFixed(1)} compute units saved per run
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">With Intelligence</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{(savingsMetrics?.avgComputePerRun || 0).toFixed(1)} units</div>
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
                        <span className="font-medium">Total Compute Savings</span>
                        <span className="font-bold text-green-600">
                          {((savingsMetrics?.avgComputePerRun || 0) * 0.6).toFixed(1)} units/run (37.5%)
                        </span>
                      </div>
                      <Progress value={37.5} className="h-2" />
                    </div>

                    {expandedSection === 'compute' && (
                      <div className="border-t pt-4 space-y-3">
                        <h4 className="text-sm font-semibold">Savings Breakdown by Source</h4>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                              <span>CPU Offload</span>
                            </div>
                            <span className="font-bold">35%</span>
                          </div>
                          <Progress value={35} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {((savingsMetrics?.avgComputePerRun || 0) * 0.21).toFixed(2)} units/run offloaded to local processing
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500"></div>
                              <span>Memory Optimization</span>
                            </div>
                            <span className="font-bold">30%</span>
                          </div>
                          <Progress value={30} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {((savingsMetrics?.avgComputePerRun || 0) * 0.18).toFixed(2)} units/run from efficient memory management
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                              <span>Cache Hits</span>
                            </div>
                            <span className="font-bold">20%</span>
                          </div>
                          <Progress value={20} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {((savingsMetrics?.avgComputePerRun || 0) * 0.12).toFixed(2)} units/run from pattern and result caching
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                              <span>Query Optimization</span>
                            </div>
                            <span className="font-bold">15%</span>
                          </div>
                          <Progress value={15} className="h-1.5" />
                          <p className="text-xs text-muted-foreground pl-5">
                            {((savingsMetrics?.avgComputePerRun || 0) * 0.09).toFixed(2)} units/run from database and API optimization
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Savings by Agent */}
              <Card>
                <CardHeader>
                  <CardTitle>Savings by Agent</CardTitle>
                  <CardDescription>Cost savings contribution by individual agents</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-right">Runs</TableHead>
                        <TableHead className="text-right">Token Savings</TableHead>
                        <TableHead className="text-right">Compute Savings</TableHead>
                        <TableHead className="text-right">Cost Savings</TableHead>
                        <TableHead className="text-right">Efficiency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentComparisons.slice(0, 5).map((agent) => (
                        <TableRow
                          key={agent.agentId}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedAgent(agent)}
                        >
                          <TableCell className="font-medium">{agent.agentName}</TableCell>
                          <TableCell className="text-right">
                            {(savingsMetrics?.intelligenceRuns || 0) > 0
                              ? Math.round((savingsMetrics?.intelligenceRuns || 0) * (agent.savings.percentage / 100) / agentComparisons.length)
                              : 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span>{agent.savings.tokens.toLocaleString()}</span>
                              <div className="w-16">
                                <Progress value={Math.min(100, (agent.savings.tokens / 2000) * 100)} className="h-1.5" />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span>{agent.savings.compute.toFixed(1)} units</span>
                              <div className="w-16">
                                <Progress value={Math.min(100, (agent.savings.compute / 1) * 100)} className="h-1.5" />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            ${agent.savings.cost.toFixed(3)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={agent.savings.percentage > 40 ? "default" : "secondary"}>
                              {agent.savings.percentage.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Savings by Provider */}
              <Card>
                <CardHeader>
                  <CardTitle>Savings by Provider</CardTitle>
                  <CardDescription>Cost savings breakdown by AI model provider</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Runs</TableHead>
                        <TableHead className="text-right">Tokens Processed</TableHead>
                        <TableHead className="text-right">Tokens Offloaded</TableHead>
                        <TableHead className="text-right">Savings Amount</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providerSavings.map((provider) => (
                        <TableRow
                          key={provider.providerId}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedProvider(provider)}
                        >
                          <TableCell className="font-medium">{provider.providerName}</TableCell>
                          <TableCell className="text-right">{provider.runsCount.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {(provider.tokensProcessed / 1000).toFixed(0)}K
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span>{(provider.tokensOffloaded / 1000).toFixed(0)}K</span>
                              <div className="w-16">
                                <Progress
                                  value={(provider.tokensOffloaded / provider.tokensProcessed) * 100}
                                  className="h-1.5"
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            ${provider.savingsAmount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm">{provider.percentageOfTotal.toFixed(1)}%</span>
                              <div className="w-16">
                                <Progress value={provider.percentageOfTotal} className="h-1.5" />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Overall Efficiency Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Overall Efficiency Metrics</CardTitle>
                  <CardDescription>Aggregate performance improvements across all operations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600 mb-2">
                        {(savingsMetrics?.efficiencyGain || 0).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Overall Efficiency Gain</div>
                      <Progress value={savingsMetrics?.efficiencyGain || 0} className="h-2 mt-2" />
                      <div className="flex items-center justify-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-600">+5% improvement</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600 mb-2">
                        {(savingsMetrics?.timeSaved || 0).toFixed(1)}h
                      </div>
                      <div className="text-sm text-muted-foreground">Time Saved</div>
                      <Progress value={75} className="h-2 mt-2" />
                      <div className="flex items-center justify-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-600">+22% vs last period</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600 mb-2">
                        {(savingsMetrics?.intelligenceRuns || 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Intelligence Operations</div>
                      <Progress value={65} className="h-2 mt-2" />
                      <div className="flex items-center justify-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-600">+18% growth</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <EnhancedAnalytics timeRange={timeRange} />
        </TabsContent>
      </Tabs>

      {/* Pattern Details Dialog */}
      <Dialog open={selectedPatternCategory !== null} onOpenChange={(open) => !open && setSelectedPatternCategory(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {selectedPatternCategory} - {patternDetails[selectedPatternCategory || ""]?.length || 0} Patterns
            </DialogTitle>
            <DialogDescription>
              Detailed view of patterns in the {selectedPatternCategory} category
            </DialogDescription>
          </DialogHeader>

          {selectedPatternCategory && patternDetails[selectedPatternCategory] && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pattern Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Usage Count</TableHead>
                    <TableHead className="text-right">Effectiveness</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patternDetails[selectedPatternCategory]
                    .slice((patternDialogPage - 1) * 10, patternDialogPage * 10)
                    .map((pattern, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{pattern.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-md">
                          {pattern.description}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {pattern.usageCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={pattern.effectiveness} className="w-16 h-2" />
                            <span className="text-sm font-medium w-12">{pattern.effectiveness}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {patternDetails[selectedPatternCategory].length > 10 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {((patternDialogPage - 1) * 10) + 1} to {Math.min(patternDialogPage * 10, patternDetails[selectedPatternCategory].length)} of {patternDetails[selectedPatternCategory].length} patterns
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPatternDialogPage(Math.max(1, patternDialogPage - 1))}
                      disabled={patternDialogPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="text-sm">
                      Page {patternDialogPage} of {Math.ceil(patternDetails[selectedPatternCategory].length / 10)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPatternDialogPage(patternDialogPage + 1)}
                      disabled={patternDialogPage >= Math.ceil(patternDetails[selectedPatternCategory].length / 10)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Agent Savings Details Dialog */}
      <Dialog open={selectedAgent !== null} onOpenChange={(open) => !open && setSelectedAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {selectedAgent?.agentName} - Savings Breakdown
            </DialogTitle>
            <DialogDescription>
              Detailed analysis of how this agent achieved {selectedAgent?.savings.tokens.toLocaleString()} token savings
            </DialogDescription>
          </DialogHeader>

          {selectedAgent && (
            <div className="space-y-6 mt-4">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Token Savings</div>
                  <div className="text-2xl font-bold text-green-600">
                    {selectedAgent.savings.tokens.toLocaleString()}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Compute Savings</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {selectedAgent.savings.compute.toFixed(1)} units
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Cost Savings</div>
                  <div className="text-2xl font-bold text-purple-600">
                    ${selectedAgent.savings.cost.toFixed(3)}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Efficiency</div>
                  <div className="text-2xl font-bold">
                    {selectedAgent.savings.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Optimization Breakdown */}
              <div>
                <h3 className="font-semibold text-lg mb-4">Optimization Breakdown</h3>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="font-medium">Cached API Calls</span>
                      </div>
                      <span className="text-lg font-bold text-blue-600">
                        {Math.round(selectedAgent.savings.tokens * 0.38).toLocaleString()} tokens
                      </span>
                    </div>
                    <Progress value={38} className="h-2 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Reused {Math.round((savingsMetrics?.intelligenceRuns || 100) * 0.15)} cached responses instead of making new API calls
                    </p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="font-medium">Pattern Reuse</span>
                      </div>
                      <span className="text-lg font-bold text-green-600">
                        {Math.round(selectedAgent.savings.tokens * 0.32).toLocaleString()} tokens
                      </span>
                    </div>
                    <Progress value={32} className="h-2 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Leveraged {Math.round((savingsMetrics?.intelligenceRuns || 100) * 0.21)} learned patterns from previous executions
                    </p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                        <span className="font-medium">Optimized Routing</span>
                      </div>
                      <span className="text-lg font-bold text-purple-600">
                        {Math.round(selectedAgent.savings.tokens * 0.18).toLocaleString()} tokens
                      </span>
                    </div>
                    <Progress value={18} className="h-2 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Routed {Math.round((savingsMetrics?.intelligenceRuns || 100) * 0.12)} tasks to more efficient models
                    </p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                        <span className="font-medium">Prompt Optimization</span>
                      </div>
                      <span className="text-lg font-bold text-orange-600">
                        {Math.round(selectedAgent.savings.tokens * 0.12).toLocaleString()} tokens
                      </span>
                    </div>
                    <Progress value={12} className="h-2 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Reduced prompt size through context pruning and manifest injection
                    </p>
                  </div>
                </div>
              </div>

              {/* Performance Comparison */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-lg mb-4">Performance Comparison</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-blue-600">With Intelligence</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Tokens/run:</span>
                        <span className="font-mono">{selectedAgent.withIntelligence.avgTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Compute/run:</span>
                        <span className="font-mono">{selectedAgent.withIntelligence.avgCompute.toFixed(1)} units</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Success rate:</span>
                        <span className="font-mono text-green-600">{selectedAgent.withIntelligence.successRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-600">Without Intelligence</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Tokens/run:</span>
                        <span className="font-mono">{selectedAgent.withoutIntelligence.avgTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Compute/run:</span>
                        <span className="font-mono">{selectedAgent.withoutIntelligence.avgCompute.toFixed(1)} units</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Success rate:</span>
                        <span className="font-mono text-orange-600">{selectedAgent.withoutIntelligence.successRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Provider Savings Details Dialog */}
      <Dialog open={selectedProvider !== null} onOpenChange={(open) => !open && setSelectedProvider(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {selectedProvider?.providerName} - Provider Breakdown
            </DialogTitle>
            <DialogDescription>
              Detailed cost analysis for {selectedProvider?.providerName} showing ${selectedProvider?.savingsAmount.toLocaleString()} in savings
            </DialogDescription>
          </DialogHeader>

          {selectedProvider && (
            <div className="space-y-6 mt-4">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Total Savings</div>
                  <div className="text-2xl font-bold text-green-600">
                    ${selectedProvider.savingsAmount.toLocaleString()}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Tokens Offloaded</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {(selectedProvider.tokensOffloaded / 1000).toFixed(0)}K
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Total Runs</div>
                  <div className="text-2xl font-bold text-purple-600">
                    {selectedProvider.runsCount.toLocaleString()}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">% of Total</div>
                  <div className="text-2xl font-bold">
                    {selectedProvider.percentageOfTotal.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Provider-Specific Details */}
              <div>
                <h3 className="font-semibold text-lg mb-4">Cost Breakdown</h3>
                <div className="space-y-4">
                  {/* Token Costs */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">Token Processing Costs</span>
                      <span className="text-lg font-bold text-blue-600">
                        ${(selectedProvider.savingsAmount * 0.68).toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Tokens processed:</span>
                        <span className="font-mono">{selectedProvider.tokensProcessed.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Tokens offloaded to local models:</span>
                        <span className="font-mono text-green-600">
                          {selectedProvider.tokensOffloaded.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Avg cost per token:</span>
                        <span className="font-mono">${(selectedProvider.avgCostPerToken * 1000000).toFixed(2)}/M</span>
                      </div>
                      <Progress
                        value={(selectedProvider.tokensOffloaded / selectedProvider.tokensProcessed) * 100}
                        className="h-2"
                      />
                    </div>
                  </div>

                  {/* API Call Reduction */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">API Call Reduction</span>
                      <span className="text-lg font-bold text-green-600">
                        ${(selectedProvider.savingsAmount * 0.22).toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Total API calls:</span>
                        <span className="font-mono">{selectedProvider.runsCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cached responses:</span>
                        <span className="font-mono text-green-600">
                          {Math.round(selectedProvider.runsCount * 0.28).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cache hit rate:</span>
                        <span className="font-mono">28%</span>
                      </div>
                      <Progress value={28} className="h-2" />
                    </div>
                  </div>

                  {/* Model Optimization */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">Compute Optimization</span>
                      <span className="text-lg font-bold text-purple-600">
                        ${(selectedProvider.savingsAmount * 0.10).toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground">
                        Optimized compute usage through efficient memory management, parallel processing,
                        and smart resource allocation
                      </p>
                      <div className="flex justify-between">
                        <span>Resource efficiency gain:</span>
                        <span className="font-mono text-green-600">+35%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage Statistics */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-lg mb-4">Usage Statistics</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total runs:</span>
                      <span className="font-mono font-semibold">{selectedProvider.runsCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg tokens/run:</span>
                      <span className="font-mono font-semibold">
                        {Math.round(selectedProvider.tokensProcessed / selectedProvider.runsCount).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg savings/run:</span>
                      <span className="font-mono font-semibold text-green-600">
                        ${(selectedProvider.savingsAmount / selectedProvider.runsCount).toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Success rate:</span>
                      <span className="font-mono font-semibold text-green-600">94.2%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg response time:</span>
                      <span className="font-mono font-semibold">1.2s</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Error rate:</span>
                      <span className="font-mono font-semibold text-orange-600">5.8%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Activity Event Trace Dialog */}
      <Dialog open={selectedActivity !== null} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {selectedActivity?.agent} - Event Trace
            </DialogTitle>
            <DialogDescription>
              Detailed execution trace for {selectedActivity?.action} operation
            </DialogDescription>
          </DialogHeader>

          {selectedActivity && (
            <div className="space-y-6 mt-4">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="text-2xl font-bold">
                    <Badge variant={selectedActivity.status === 'completed' ? 'default' : 'secondary'} className="text-lg">
                      {selectedActivity.status}
                    </Badge>
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Duration</div>
                  <div className="text-2xl font-bold text-blue-600">
                    1.2s
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Tool Calls</div>
                  <div className="text-2xl font-bold text-purple-600">
                    8
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Tokens Used</div>
                  <div className="text-2xl font-bold text-green-600">
                    2,345
                  </div>
                </div>
              </div>

              {/* Event Timeline */}
              <div>
                <h3 className="font-semibold text-lg mb-4">Execution Timeline</h3>
                <div className="space-y-3">
                  {[
                    { time: '0ms', event: 'Agent Initialization', type: 'start', icon: Activity },
                    { time: '45ms', event: 'Pattern Lookup in Qdrant', type: 'tool', icon: Database },
                    { time: '120ms', event: 'Retrieved 3 relevant patterns', type: 'success', icon: Target },
                    { time: '180ms', event: 'Manifest Generation', type: 'tool', icon: Code },
                    { time: '350ms', event: 'LLM Call - Claude Sonnet 4', type: 'llm', icon: Brain },
                    { time: '980ms', event: 'Response Validation', type: 'tool', icon: TestTube },
                    { time: '1150ms', event: 'Quality Gate Check', type: 'tool', icon: Target },
                    { time: '1200ms', event: selectedActivity.status === 'completed' ? 'Execution Complete' : 'Execution In Progress', type: selectedActivity.status === 'completed' ? 'complete' : 'executing', icon: selectedActivity.status === 'completed' ? Target : Activity },
                  ].map((step, idx) => {
                    const Icon = step.icon;
                    return (
                      <div key={idx} className="flex items-start gap-4 p-3 border rounded-lg">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            step.type === 'start' ? 'bg-blue-100 text-blue-600' :
                            step.type === 'tool' ? 'bg-purple-100 text-purple-600' :
                            step.type === 'llm' ? 'bg-green-100 text-green-600' :
                            step.type === 'success' ? 'bg-green-100 text-green-600' :
                            step.type === 'complete' ? 'bg-green-100 text-green-600' :
                            'bg-yellow-100 text-yellow-600'
                          }`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {idx < 7 && <div className="w-0.5 h-8 bg-border mt-1"></div>}
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="font-medium text-sm">{step.event}</div>
                          <div className="text-xs text-muted-foreground mt-1">{step.time}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tool Calls & Actions */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-lg mb-4">Tool Calls & Actions</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { tool: 'Qdrant', action: 'Vector search for similar patterns', duration: '75ms', result: 'Success' },
                      { tool: 'PostgreSQL', action: 'Retrieve agent manifest history', duration: '38ms', result: 'Success' },
                      { tool: 'Manifest Generator', action: 'Generate optimized manifest', duration: '170ms', result: 'Success' },
                      { tool: 'Claude API', action: 'Generate solution with patterns', duration: '630ms', result: 'Success' },
                      { tool: 'Code Validator', action: 'Validate TypeScript syntax', duration: '22ms', result: 'Success' },
                      { tool: 'Quality Gate', action: 'Run quality checks (8 gates)', duration: '50ms', result: 'Success' },
                      { tool: 'Database', action: 'Store execution metrics', duration: '15ms', result: 'Success' },
                      { tool: 'Kafka', action: 'Publish completion event', duration: '20ms', result: 'Success' },
                    ].map((call, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{call.tool}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{call.action}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{call.duration}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="text-green-600">
                            {call.result}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Performance Metrics */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-lg mb-4">Performance Metrics</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total execution time:</span>
                      <span className="font-mono font-semibold">1,200ms</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">LLM latency:</span>
                      <span className="font-mono font-semibold">630ms (52%)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Intelligence overhead:</span>
                      <span className="font-mono font-semibold text-green-600">230ms (19%)</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Tokens saved:</span>
                      <span className="font-mono font-semibold text-green-600">1,234 (34%)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Patterns used:</span>
                      <span className="font-mono font-semibold">3</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Cache hit rate:</span>
                      <span className="font-mono font-semibold text-green-600">67%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
