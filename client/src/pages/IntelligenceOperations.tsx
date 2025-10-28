import { MetricCard } from "@/components/MetricCard";
import { RealtimeChart } from "@/components/RealtimeChart";
import { EventFeed } from "@/components/EventFeed";
import { TransformationFlow } from "@/components/TransformationFlow";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, CheckCircle, AlertTriangle, TrendingUp, Activity, Database, Server, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ManifestInjectionHealth {
  successRate: number;
  avgLatencyMs: number;
  failedInjections: Array<{
    errorType: string;
    count: number;
    lastOccurrence: string;
  }>;
  manifestSizeStats: {
    avgSizeKb: number;
    minSizeKb: number;
    maxSizeKb: number;
  };
  latencyTrend: Array<{
    period: string;
    avgLatencyMs: number;
    count: number;
  }>;
  serviceHealth: {
    postgresql: { status: 'up' | 'down'; latencyMs?: number };
    omniarchon: { status: 'up' | 'down'; latencyMs?: number };
    qdrant: { status: 'up' | 'down'; latencyMs?: number };
  };
}

export default function IntelligenceOperations() {
  // Fetch manifest injection health data
  const { data: healthData, isLoading: healthLoading } = useQuery<ManifestInjectionHealth>({
    queryKey: ['/api/intelligence/health/manifest-injection'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  //todo: remove mock functionality
  const operations = [
    { id: '1', name: 'Code Analysis', status: 'running', count: 42, avgTime: '1.2s' },
    { id: '2', name: 'Pattern Recognition', status: 'running', count: 38, avgTime: '0.8s' },
    { id: '3', name: 'Quality Assessment', status: 'running', count: 25, avgTime: '2.1s' },
    { id: '4', name: 'Performance Optimization', status: 'idle', count: 15, avgTime: '3.4s' },
    { id: '5', name: 'Semantic Analysis', status: 'running', count: 31, avgTime: '1.5s' },
    { id: '6', name: 'Dependency Mapping', status: 'running', count: 18, avgTime: '2.8s' },
  ];

  const chartData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 120 + Math.random() * 50,
  }));

  const qualityData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 75 + Math.random() * 15,
  }));

  const events = [
    { id: '1', type: 'success' as const, message: 'Code analysis completed for Repository-42', timestamp: '10:23:15', source: 'Analysis Engine' },
    { id: '2', type: 'info' as const, message: 'Quality score improved by 12% for Project-A', timestamp: '10:23:12', source: 'Quality Assessor' },
    { id: '3', type: 'success' as const, message: 'Performance optimization recommendations generated', timestamp: '10:23:08', source: 'Optimizer' },
    { id: '4', type: 'warning' as const, message: 'High complexity detected in Module-X', timestamp: '10:22:55', source: 'Analyzer' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Intelligence Operations</h1>
        <p className="text-muted-foreground">168+ AI operations for code analysis and optimization</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard 
          label="Active Operations"
          value="168"
          trend={{ value: 5, isPositive: true }}
          icon={Zap}
          status="healthy"
        />
        <MetricCard 
          label="Running Now"
          value="42"
          icon={Zap}
          status="healthy"
        />
        <MetricCard 
          label="Success Rate"
          value="96.8%"
          trend={{ value: 1.2, isPositive: true }}
          icon={CheckCircle}
          status="healthy"
        />
        <MetricCard 
          label="Avg Processing"
          value="1.8s"
          icon={TrendingUp}
          status="healthy"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <RealtimeChart 
          title="Operations per Minute"
          data={chartData}
          color="hsl(var(--chart-4))"
          showArea
        />
        <RealtimeChart 
          title="Quality Improvement Impact"
          data={qualityData}
          color="hsl(var(--chart-3))"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card className="p-6">
            <h3 className="text-base font-semibold mb-4">Operation Status</h3>
            <div className="grid grid-cols-2 gap-4">
              {operations.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center gap-3 p-4 rounded-lg border border-card-border hover-elevate"
                >
                  <div className={`h-3 w-3 rounded-full ${op.status === 'running' ? 'bg-status-healthy animate-pulse' : 'bg-status-idle'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{op.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {op.count} operations • {op.avgTime} avg
                    </div>
                  </div>
                  <Badge variant={op.status === 'running' ? 'default' : 'secondary'}>
                    {op.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <EventFeed events={events} maxHeight={400} />
      </div>

      {/* Intelligence Health Monitoring */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Manifest Injection Health</h2>
          <p className="text-muted-foreground">Monitor intelligence system performance and detect degradation</p>
        </div>

        {healthLoading ? (
          <Card className="p-6">
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          </Card>
        ) : healthData ? (
          <>
            {/* Health Metrics Overview */}
            <div className="grid grid-cols-4 gap-6">
              <MetricCard
                label="Success Rate (24h)"
                value={`${(healthData.successRate * 100).toFixed(1)}%`}
                icon={CheckCircle}
                status={healthData.successRate >= 0.95 ? 'healthy' : healthData.successRate >= 0.90 ? 'warning' : 'error'}
              />
              <MetricCard
                label="Avg Latency"
                value={`${healthData.avgLatencyMs.toFixed(0)}ms`}
                icon={Clock}
                status={healthData.avgLatencyMs <= 500 ? 'healthy' : healthData.avgLatencyMs <= 1000 ? 'warning' : 'error'}
              />
              <MetricCard
                label="Manifest Size (Avg)"
                value={`${healthData.manifestSizeStats.avgSizeKb.toFixed(1)} KB`}
                icon={Database}
                status="healthy"
              />
              <MetricCard
                label="Failed Injections"
                value={healthData.failedInjections.reduce((sum, f) => sum + f.count, 0).toString()}
                icon={AlertTriangle}
                status={healthData.failedInjections.reduce((sum, f) => sum + f.count, 0) === 0 ? 'healthy' : 'warning'}
              />
            </div>

            {/* Latency Trend Chart */}
            <div className="grid grid-cols-2 gap-6">
              <RealtimeChart
                title="Injection Latency Trend (24h)"
                data={healthData.latencyTrend.map(t => ({
                  time: new Date(t.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  value: t.avgLatencyMs,
                })).reverse()}
                color="hsl(var(--chart-2))"
                showArea
              />

              {/* Service Health Status */}
              <Card className="p-6">
                <h3 className="text-base font-semibold mb-4">Service Health Status</h3>
                <div className="space-y-4">
                  {Object.entries(healthData.serviceHealth).map(([service, health]) => (
                    <div key={service} className="flex items-center justify-between p-3 rounded-lg border border-card-border">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${health.status === 'up' ? 'bg-status-healthy' : 'bg-status-critical'} ${health.status === 'up' ? 'animate-pulse' : ''}`} />
                        <div>
                          <div className="text-sm font-medium capitalize">{service}</div>
                          {health.latencyMs !== undefined && health.status === 'up' && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {health.latencyMs}ms response time
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge variant={health.status === 'up' ? 'default' : 'destructive'}>
                        {health.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Failed Injections Table */}
            {healthData.failedInjections.length > 0 && (
              <Card className="p-6">
                <h3 className="text-base font-semibold mb-4">Failed Injections (Last 24h)</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Error Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Last Occurrence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthData.failedInjections.map((failure) => (
                      <TableRow key={failure.errorType}>
                        <TableCell className="font-medium">{failure.errorType.replace(/_/g, ' ').toUpperCase()}</TableCell>
                        <TableCell className="text-right">{failure.count}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {new Date(failure.lastOccurrence).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            {/* Alert Warnings */}
            {(healthData.successRate < 0.95 || healthData.avgLatencyMs > 500) && (
              <Card className="p-4 border-l-4 border-l-yellow-500 bg-yellow-500/10">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm mb-1">Intelligence System Warnings</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {healthData.successRate < 0.95 && (
                        <li>• Success rate below 95% threshold ({(healthData.successRate * 100).toFixed(1)}%)</li>
                      )}
                      {healthData.avgLatencyMs > 500 && (
                        <li>• Average latency exceeds 500ms ({healthData.avgLatencyMs.toFixed(0)}ms)</li>
                      )}
                    </ul>
                  </div>
                </div>
              </Card>
            )}
          </>
        ) : null}
      </div>

      {/* Polymorphic Transformation Viewer */}
      <div>
        <TransformationFlow timeWindow="30d" />
      </div>
    </div>
  );
}
