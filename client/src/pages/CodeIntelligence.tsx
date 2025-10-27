import { MetricCard } from "@/components/MetricCard";
import { QualityGatePanel } from "@/components/QualityGatePanel";
import { PerformanceThresholds } from "@/components/PerformanceThresholds";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Code, Search, CheckCircle, Gauge } from "lucide-react";

export default function CodeIntelligence() {
  //todo: remove mock functionality
  const gates = [
    { id: '1', name: 'Code Coverage', status: 'passed' as const, threshold: '> 80%', currentValue: '87%' },
    { id: '2', name: 'Cyclomatic Complexity', status: 'passed' as const, threshold: '< 10', currentValue: '7.2' },
    { id: '3', name: 'Response Time', status: 'warning' as const, threshold: '< 200ms', currentValue: '185ms' },
    { id: '4', name: 'Error Rate', status: 'passed' as const, threshold: '< 1%', currentValue: '0.3%' },
    { id: '5', name: 'Security Vulnerabilities', status: 'failed' as const, threshold: '= 0', currentValue: '2' },
    { id: '6', name: 'Code Duplication', status: 'passed' as const, threshold: '< 3%', currentValue: '1.8%' },
  ];

  const thresholds = [
    { id: '1', name: 'API Response Time', current: 145, max: 200, unit: 'ms', warning: 70, critical: 90 },
    { id: '2', name: 'Memory Usage', current: 5.2, max: 8, unit: 'GB', warning: 75, critical: 90 },
    { id: '3', name: 'Database Connections', current: 450, max: 1000, unit: 'conns', warning: 70, critical: 85 },
    { id: '4', name: 'CPU Utilization', current: 68, max: 100, unit: '%', warning: 70, critical: 90 },
  ];

  const searchData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 200 + Math.random() * 100,
  }));

  const qualityData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 80 + Math.random() * 15,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Code Intelligence</h1>
        <p className="text-muted-foreground">Semantic search, quality gates, and performance monitoring</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard 
          label="Search Queries"
          value="1,247"
          trend={{ value: 18, isPositive: true }}
          icon={Search}
          status="healthy"
        />
        <MetricCard 
          label="Quality Gates"
          value="23"
          icon={CheckCircle}
          status="healthy"
        />
        <MetricCard 
          label="Gates Passing"
          value="20"
          trend={{ value: 5, isPositive: true }}
          icon={CheckCircle}
          status="warning"
        />
        <MetricCard 
          label="Performance Score"
          value="94"
          icon={Gauge}
          status="healthy"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <QualityGatePanel gates={gates} />
        <PerformanceThresholds thresholds={thresholds} />
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
    </div>
  );
}
