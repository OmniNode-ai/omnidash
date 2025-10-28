import { MetricCard } from "@/components/MetricCard";
import { QualityGatePanel } from "@/components/QualityGatePanel";
import { PerformanceThresholds } from "@/components/PerformanceThresholds";
import { RealtimeChart } from "@/components/RealtimeChart";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { Code, Search, CheckCircle, Gauge, AlertTriangle, FileCode } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface CodeAnalysisData {
  files_analyzed: number;
  avg_complexity: number;
  code_smells: number;
  security_issues: number;
  complexity_trend?: Array<{
    timestamp: string;
    value: number;
  }>;
  quality_trend?: Array<{
    timestamp: string;
    value: number;
  }>;
}

export default function CodeIntelligence() {
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Fetch code analysis data from omniarchon
  const { data: codeAnalysis, isLoading } = useQuery<CodeAnalysisData>({
    queryKey: [`http://localhost:8053/api/intelligence/code/analysis?timeWindow=${timeRange}`],
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  //todo: remove mock functionality for gates and thresholds once endpoint provides this data
  const gates = [
    { id: '1', name: 'Code Coverage', status: 'passed' as const, threshold: '> 80%', currentValue: '87%' },
    { id: '2', name: 'Cyclomatic Complexity', status: codeAnalysis && codeAnalysis.avg_complexity > 10 ? 'warning' as const : 'passed' as const, threshold: '< 10', currentValue: codeAnalysis ? codeAnalysis.avg_complexity.toFixed(1) : '7.2' },
    { id: '3', name: 'Response Time', status: 'warning' as const, threshold: '< 200ms', currentValue: '185ms' },
    { id: '4', name: 'Error Rate', status: 'passed' as const, threshold: '< 1%', currentValue: '0.3%' },
    { id: '5', name: 'Security Vulnerabilities', status: codeAnalysis && codeAnalysis.security_issues > 0 ? 'failed' as const : 'passed' as const, threshold: '= 0', currentValue: codeAnalysis ? codeAnalysis.security_issues.toString() : '2' },
    { id: '6', name: 'Code Duplication', status: 'passed' as const, threshold: '< 3%', currentValue: '1.8%' },
  ];

  const thresholds = [
    { id: '1', name: 'API Response Time', current: 145, max: 200, unit: 'ms', warning: 70, critical: 90 },
    { id: '2', name: 'Memory Usage', current: 5.2, max: 8, unit: 'GB', warning: 75, critical: 90 },
    { id: '3', name: 'Database Connections', current: 450, max: 1000, unit: 'conns', warning: 70, critical: 85 },
    { id: '4', name: 'CPU Utilization', current: 68, max: 100, unit: '%', warning: 70, critical: 90 },
  ];

  // Transform complexity trend for chart
  const searchData = codeAnalysis?.complexity_trend
    ? codeAnalysis.complexity_trend.map(item => ({
        time: new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        value: item.value,
      }))
    : Array.from({ length: 20 }, (_, i) => ({
        time: `${i}:00`,
        value: 200 + Math.random() * 100,
      }));

  // Transform quality trend for chart
  const qualityData = codeAnalysis?.quality_trend
    ? codeAnalysis.quality_trend.map(item => ({
        time: new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        value: item.value,
      }))
    : Array.from({ length: 20 }, (_, i) => ({
        time: `${i}:00`,
        value: 80 + Math.random() * 15,
      }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Code Intelligence</h1>
          <p className="text-muted-foreground">
            {isLoading ? 'Loading code analysis...' : `Analyzing ${codeAnalysis?.files_analyzed || 0} files with semantic search and quality gates`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={{ codeAnalysis, gates, thresholds, searchData, qualityData }}
            filename={`code-intelligence-${timeRange}-${new Date().toISOString().split('T')[0]}`}
            disabled={isLoading}
          />
        </div>
      </div>

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

      <div className="grid grid-cols-2 gap-6">
        <RealtimeChart 
          title="Semantic Search Queries"
          data={searchData}
          color="hsl(var(--chart-1))"
          showArea
        />
        <RealtimeChart 
          title="Overall Code Quality Score"
          data={qualityData}
          color="hsl(var(--chart-3))"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <QualityGatePanel gates={gates} />
        <PerformanceThresholds thresholds={thresholds} />
      </div>
    </div>
  );
}
