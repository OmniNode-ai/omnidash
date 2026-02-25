import { MetricCard } from '@/components/MetricCard';
import { QualityGatePanel } from '@/components/QualityGatePanel';
import { PerformanceThresholds } from '@/components/PerformanceThresholds';
import { RealtimeChart } from '@/components/RealtimeChart';
import { MockDataBadge } from '@/components/MockDataBadge';
import { ensureTimeSeries } from '@/components/mockUtils';
import { Gauge, AlertTriangle, FileCode, Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { codeIntelligenceSource } from '@/lib/data-sources';
import { POLLING_INTERVAL_SLOW, getPollingInterval } from '@/lib/constants/query-config';

export default function CodeIntelligence() {
  const [timeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  // Use centralized data source
  const { data: intelligenceData, isLoading } = useQuery({
    queryKey: ['code-intelligence', timeRange],
    queryFn: () => codeIntelligenceSource.fetchAll(timeRange),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_SLOW),
    refetchIntervalInBackground: true,
  });

  const codeAnalysis = intelligenceData?.codeAnalysis;
  const complianceData = intelligenceData?.compliance;
  const isLoadingCompliance = isLoading;

  // Mock data for gates and thresholds (not yet available from API)
  const usingMockGates = true;
  const gates = [
    {
      id: '1',
      name: 'Code Coverage',
      status: 'passed' as const,
      threshold: '> 80%',
      currentValue: '87%',
    },
    {
      id: '2',
      name: 'Cyclomatic Complexity',
      status:
        codeAnalysis && codeAnalysis.avg_complexity > 10
          ? ('warning' as const)
          : ('passed' as const),
      threshold: '< 10',
      currentValue: codeAnalysis ? codeAnalysis.avg_complexity.toFixed(1) : '7.2',
    },
    {
      id: '3',
      name: 'Response Time',
      status: 'warning' as const,
      threshold: '< 200ms',
      currentValue: '185ms',
    },
    {
      id: '4',
      name: 'Error Rate',
      status: 'passed' as const,
      threshold: '< 1%',
      currentValue: '0.3%',
    },
    {
      id: '5',
      name: 'Security Vulnerabilities',
      status:
        codeAnalysis && codeAnalysis.security_issues > 0
          ? ('failed' as const)
          : ('passed' as const),
      threshold: '= 0',
      currentValue: codeAnalysis ? codeAnalysis.security_issues.toString() : '2',
    },
    {
      id: '6',
      name: 'Code Duplication',
      status: 'passed' as const,
      threshold: '< 3%',
      currentValue: '1.8%',
    },
  ];

  const usingMockThresholds = true;
  const thresholds = [
    {
      id: '1',
      name: 'API Response Time',
      current: 145,
      max: 200,
      unit: 'ms',
      warning: 70,
      critical: 90,
    },
    { id: '2', name: 'Memory Usage', current: 5.2, max: 8, unit: 'GB', warning: 75, critical: 90 },
    {
      id: '3',
      name: 'Database Connections',
      current: 450,
      max: 1000,
      unit: 'conns',
      warning: 70,
      critical: 85,
    },
    {
      id: '4',
      name: 'CPU Utilization',
      current: 68,
      max: 100,
      unit: '%',
      warning: 70,
      critical: 90,
    },
  ];

  // Transform complexity trend for chart
  const searchDataRaw = codeAnalysis?.complexity_trend
    ? codeAnalysis.complexity_trend.map((item) => ({
        time: new Date(item.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        value: item.value,
      }))
    : ([] as Array<{ time: string; value: number }>);
  const { data: searchData, isMock: isSearchMock } = ensureTimeSeries(searchDataRaw, 220, 80);

  // Transform quality trend for chart
  const qualityDataRaw = codeAnalysis?.quality_trend
    ? codeAnalysis.quality_trend.map((item) => ({
        time: new Date(item.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        value: item.value,
      }))
    : ([] as Array<{ time: string; value: number }>);
  const { data: qualityData, isMock: isQualityMock } = ensureTimeSeries(qualityDataRaw, 82, 8);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Code Intelligence Metrics</CardTitle>
          <CardDescription>
            Overview of code quality, complexity, and security issues across analyzed files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-6">
            <MetricCard
              label="Files Analyzed"
              value={isLoading ? '...' : codeAnalysis?.files_analyzed?.toLocaleString() || '0'}
              icon={FileCode}
              status="healthy"
            />
            <MetricCard
              label="Avg Complexity"
              value={isLoading ? '...' : codeAnalysis?.avg_complexity?.toFixed(1) || '0'}
              icon={Gauge}
              status={codeAnalysis && codeAnalysis.avg_complexity > 10 ? 'warning' : 'healthy'}
            />
            <MetricCard
              label="Code Smells"
              value={isLoading ? '...' : codeAnalysis?.code_smells?.toString() || '0'}
              icon={AlertTriangle}
              status={
                codeAnalysis && codeAnalysis.code_smells > 10
                  ? 'warning'
                  : codeAnalysis && codeAnalysis.code_smells > 0
                    ? 'warning'
                    : 'healthy'
              }
            />
            <MetricCard
              label="Security Issues"
              value={isLoading ? '...' : codeAnalysis?.security_issues?.toString() || '0'}
              icon={AlertTriangle}
              status={codeAnalysis && codeAnalysis.security_issues > 0 ? 'error' : 'healthy'}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <div>
          {isSearchMock && <MockDataBadge className="mb-2" />}
          <RealtimeChart
            title="Semantic Search Queries"
            data={searchData}
            color="hsl(var(--chart-1))"
            showArea
          />
        </div>
        <div>
          {isQualityMock && <MockDataBadge className="mb-2" />}
          <RealtimeChart
            title="Overall Code Quality Score"
            data={qualityData}
            color="hsl(var(--chart-3))"
          />
        </div>
      </div>

      {/* ONEX Compliance Coverage Widget */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">ONEX Compliance Coverage</h3>
              <p className="text-sm text-muted-foreground">
                {isLoadingCompliance
                  ? 'Loading...'
                  : `${complianceData?.summary.totalFiles || 0} files tracked`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-3xl font-bold ${
                (complianceData?.summary.compliancePercentage || 0) >= 80
                  ? 'text-green-500'
                  : (complianceData?.summary.compliancePercentage || 0) >= 60
                    ? 'text-yellow-500'
                    : 'text-red-500'
              }`}
            >
              {isLoadingCompliance
                ? '...'
                : `${Math.max(0, Math.min(100, complianceData?.summary.compliancePercentage || 0)).toFixed(1)}%`}
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
                  ? (complianceData.summary.compliantFiles / complianceData.summary.totalFiles) *
                    100
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
                  ? (complianceData.summary.nonCompliantFiles / complianceData.summary.totalFiles) *
                    100
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
              data={complianceData.trend.map((t) => ({
                time: new Date(t.period).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: timeRange === '24h' ? '2-digit' : undefined,
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
        <div>
          {usingMockGates && <MockDataBadge className="mb-2" />}
          <QualityGatePanel gates={gates} />
        </div>
        <div>
          {usingMockThresholds && <MockDataBadge className="mb-2" />}
          <PerformanceThresholds thresholds={thresholds} />
        </div>
      </div>
    </div>
  );
}
