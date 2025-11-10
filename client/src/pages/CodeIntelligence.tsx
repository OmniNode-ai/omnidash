import { MetricCard } from "@/components/MetricCard";
import { QualityGatePanel } from "@/components/QualityGatePanel";
import { PerformanceThresholds } from "@/components/PerformanceThresholds";
import { RealtimeChart } from "@/components/RealtimeChart";
import { ensureTimeSeries } from "@/components/mockUtils";
import { DashboardSection } from "@/components/DashboardSection";
import { MockDataBadge } from "@/components/MockDataBadge";
import { Code, Search, CheckCircle, Gauge, AlertTriangle, FileCode, Shield, Settings, Download, RefreshCw, CalendarIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { codeIntelligenceSource } from "@/lib/data-sources";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// Types from data source
import type { CodeAnalysisData, ComplianceData } from "@/lib/data-sources/code-intelligence-source";

export default function CodeIntelligence() {
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Use centralized data source
  const { data: intelligenceData, isLoading, error, refetch } = useQuery({
    queryKey: ['code-intelligence', timeRange],
    queryFn: () => codeIntelligenceSource.fetchAll(timeRange),
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const codeAnalysis = intelligenceData?.codeAnalysis;
  const complianceData = intelligenceData?.compliance;
  const usingMockData = intelligenceData?.isMock || false;
  const isLoadingCompliance = isLoading;

  // Mock data for gates and thresholds (not yet available from API)
  const usingMockGates = true;
  const gates = [
    { id: '1', name: 'Code Coverage', status: 'passed' as const, threshold: '> 80%', currentValue: '87%' },
    { id: '2', name: 'Cyclomatic Complexity', status: codeAnalysis && codeAnalysis.avg_complexity > 10 ? 'warning' as const : 'passed' as const, threshold: '< 10', currentValue: codeAnalysis ? codeAnalysis.avg_complexity.toFixed(1) : '7.2' },
    { id: '3', name: 'Response Time', status: 'warning' as const, threshold: '< 200ms', currentValue: '185ms' },
    { id: '4', name: 'Error Rate', status: 'passed' as const, threshold: '< 1%', currentValue: '0.3%' },
    { id: '5', name: 'Security Vulnerabilities', status: codeAnalysis && codeAnalysis.security_issues > 0 ? 'failed' as const : 'passed' as const, threshold: '= 0', currentValue: codeAnalysis ? codeAnalysis.security_issues.toString() : '2' },
    { id: '6', name: 'Code Duplication', status: 'passed' as const, threshold: '< 3%', currentValue: '1.8%' },
  ];

  const usingMockThresholds = true;
  const thresholds = [
    { id: '1', name: 'API Response Time', current: 145, max: 200, unit: 'ms', warning: 70, critical: 90 },
    { id: '2', name: 'Memory Usage', current: 5.2, max: 8, unit: 'GB', warning: 75, critical: 90 },
    { id: '3', name: 'Database Connections', current: 450, max: 1000, unit: 'conns', warning: 70, critical: 85 },
    { id: '4', name: 'CPU Utilization', current: 68, max: 100, unit: '%', warning: 70, critical: 90 },
  ];
  
  // Track which data sources are using mock data
  const usingMockCodeAnalysis = !codeAnalysis || (codeAnalysis.files_analyzed === 0 && !isLoading);
  const usingMockCompliance = !complianceData || (complianceData.summary.totalFiles === 0 && !isLoadingCompliance);

  // Transform complexity trend for chart
  const searchDataRaw = codeAnalysis?.complexity_trend
    ? codeAnalysis.complexity_trend.map(item => ({
        time: new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        value: item.value,
      }))
    : [] as Array<{ time: string; value: number }>;
  const { data: searchData, isMock: isSearchMock } = ensureTimeSeries(searchDataRaw, 220, 80);

  // Transform quality trend for chart
  const qualityDataRaw = codeAnalysis?.quality_trend
    ? codeAnalysis.quality_trend.map(item => ({
        time: new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        value: item.value,
      }))
    : [] as Array<{ time: string; value: number }>;
  const { data: qualityData, isMock: isQualityMock } = ensureTimeSeries(qualityDataRaw, 82, 8);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading code intelligence...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Failed to load code intelligence data</p>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Standard Header with flex layout (C2, C3, C4, C5) */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Code Intelligence</h1>
          <p className="ty-subtitle">
            Semantic search, quality gates, and ONEX compliance monitoring for code analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(usingMockData || usingMockGates || usingMockThresholds) && <MockDataBadge />}
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>

          {/* Visual divider before time range (C7) */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
            <Button
              variant={timeRange === "1h" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("1h")}
            >
              1H
            </Button>
            <Button
              variant={timeRange === "24h" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("24h")}
            >
              24H
            </Button>
            <Button
              variant={timeRange === "7d" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("7d")}
            >
              7D
            </Button>
            <Button
              variant={timeRange === "30d" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange("30d")}
            >
              30D
            </Button>

            {/* Custom date range picker (C6) */}
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
                      handleTimeRangeChange("custom");
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
      <DashboardSection
        title="Code Intelligence Metrics"
        description="Overview of code quality, complexity, and security issues across analyzed files"
      >
        <div className="grid grid-cols-4 gap-6">
          <MetricCard
            label="Files Analyzed"
            value={isLoading ? '...' : (codeAnalysis?.files_analyzed?.toLocaleString() || '0')}
            icon={FileCode}
            status="healthy"
          />
          <MetricCard
            label="Avg Complexity"
            value={isLoading ? '...' : (codeAnalysis?.avg_complexity?.toFixed(1) || '0')}
            icon={Gauge}
            status={codeAnalysis && codeAnalysis.avg_complexity > 10 ? 'warning' : 'healthy'}
          />
          <MetricCard
            label="Code Smells"
            value={isLoading ? '...' : (codeAnalysis?.code_smells?.toString() || '0')}
            icon={AlertTriangle}
            status={codeAnalysis && codeAnalysis.code_smells > 10 ? 'warning' : codeAnalysis && codeAnalysis.code_smells > 0 ? 'warning' : 'healthy'}
          />
          <MetricCard
            label="Security Issues"
            value={isLoading ? '...' : (codeAnalysis?.security_issues?.toString() || '0')}
            icon={AlertTriangle}
            status={codeAnalysis && codeAnalysis.security_issues > 0 ? 'error' : 'healthy'}
          />
        </div>
      </DashboardSection>

      <div className="grid grid-cols-2 gap-6">
        <DashboardSection
          title="Semantic Search Queries"
          showMockBadge={isSearchMock}
        >
          <RealtimeChart
            title=""
            data={searchData}
            color="hsl(var(--chart-1))"
            showArea
          />
        </DashboardSection>
        <DashboardSection
          title="Overall Code Quality Score"
          showMockBadge={isQualityMock}
        >
          <RealtimeChart
            title=""
            data={qualityData}
            color="hsl(var(--chart-3))"
          />
        </DashboardSection>
      </div>

      {/* ONEX Compliance Coverage Widget */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">ONEX Compliance Coverage</h3>
              <p className="text-sm text-muted-foreground">
                {isLoadingCompliance ? 'Loading...' : `${complianceData?.summary.totalFiles || 0} files tracked`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${
              (complianceData?.summary.compliancePercentage || 0) >= 80
                ? 'text-green-500'
                : (complianceData?.summary.compliancePercentage || 0) >= 60
                ? 'text-yellow-500'
                : 'text-red-500'
            }`}>
              {isLoadingCompliance ? '...' : `${Math.max(0, Math.min(100, complianceData?.summary.compliancePercentage || 0)).toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Compliance Rate</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Compliant</span>
              <span className="font-medium text-green-500">
                {isLoadingCompliance ? '...' : complianceData?.summary.compliantFiles || 0}
              </span>
            </div>
            <Progress
              value={
                complianceData?.summary.totalFiles
                  ? (complianceData.summary.compliantFiles / complianceData.summary.totalFiles) * 100
                  : 0
              }
              className="h-2 bg-green-500/20"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Non-Compliant</span>
              <span className="font-medium text-red-500">
                {isLoadingCompliance ? '...' : complianceData?.summary.nonCompliantFiles || 0}
              </span>
            </div>
            <Progress
              value={
                complianceData?.summary.totalFiles
                  ? (complianceData.summary.nonCompliantFiles / complianceData.summary.totalFiles) * 100
                  : 0
              }
              className="h-2 bg-red-500/20"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending</span>
              <span className="font-medium text-yellow-500">
                {isLoadingCompliance ? '...' : complianceData?.summary.pendingFiles || 0}
              </span>
            </div>
            <Progress
              value={
                complianceData?.summary.totalFiles
                  ? (complianceData.summary.pendingFiles / complianceData.summary.totalFiles) * 100
                  : 0
              }
              className="h-2 bg-yellow-500/20"
            />
          </div>
        </div>

        {/* Node Type Breakdown */}
        {complianceData?.nodeTypeBreakdown && complianceData.nodeTypeBreakdown.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Node Type Breakdown</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {complianceData.nodeTypeBreakdown.map((nodeType) => (
                <div key={nodeType.nodeType} className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground capitalize mb-1">
                    {nodeType.nodeType}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-lg font-bold">
                      {Math.max(0, Math.min(100, nodeType.percentage)).toFixed(0)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {nodeType.compliantCount}/{nodeType.totalCount}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compliance Trend Chart */}
        {complianceData?.trend && complianceData.trend.length > 0 && (
          <div className="mt-6">
            <RealtimeChart
              title="Compliance Trend"
              data={complianceData.trend.map(t => ({
                time: new Date(t.period).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: timeRange === '24h' ? '2-digit' : undefined
                }),
                value: t.compliancePercentage,
              }))}
              color="hsl(var(--chart-2))"
              showArea
            />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DashboardSection
          title="Quality Gates"
          showMockBadge={usingMockGates}
        >
          <QualityGatePanel gates={gates} />
        </DashboardSection>
        <DashboardSection
          title="Performance Thresholds"
          showMockBadge={usingMockThresholds}
        >
          <PerformanceThresholds thresholds={thresholds} />
        </DashboardSection>
      </div>
    </div>
  );
}
