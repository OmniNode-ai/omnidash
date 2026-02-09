/**
 * EffectivenessLatency
 *
 * Technical details / latency page for injection effectiveness metrics.
 * Shows latency breakdown stacked bar chart, P50/P95/P99 comparison table,
 * latency delta trend line chart, and cache hit rate metric.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard (R3)
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { effectivenessSource } from '@/lib/data-sources/effectiveness-source';
import { MetricCard } from '@/components/MetricCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { Link } from 'wouter';
import type { LatencyDetails } from '@shared/effectiveness-types';
import { Clock, ArrowLeft, RefreshCw, Zap, Database } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================================================
// Constants
// ============================================================================

const CHART_COLORS = {
  routing: '#3b82f6',
  retrieval: '#8b5cf6',
  injection: '#f59e0b',
  treatmentP95: '#3b82f6',
  controlP95: '#22c55e',
  deltaP95: '#ef4444',
} as const;

// ============================================================================
// Component
// ============================================================================

/**
 * Latency details page for injection effectiveness.
 *
 * Displays per-cohort latency breakdowns (stacked bar), percentile comparisons
 * (table), latency delta trend over time (line chart), and cache hit rate.
 *
 * Data refreshes via 15-second polling with WebSocket-triggered invalidation
 * for real-time responsiveness.
 */
export default function EffectivenessLatency() {
  // ---------------------------------------------------------------------------
  // WebSocket: subscribe to effectiveness topic for real-time invalidation
  // ---------------------------------------------------------------------------
  const queryClient = useQueryClient();

  const { subscribe, isConnected } = useWebSocket({
    onMessage: (msg) => {
      if (msg.type === 'EFFECTIVENESS_UPDATE') {
        queryClient.invalidateQueries({ queryKey: queryKeys.effectiveness.all });
      }
    },
  });

  useEffect(() => {
    if (isConnected) {
      subscribe(['effectiveness']);
    }
  }, [isConnected, subscribe]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const { data, isLoading, refetch } = useQuery<LatencyDetails>({
    queryKey: queryKeys.effectiveness.latency(),
    queryFn: () => effectivenessSource.latencyDetails(),
    refetchInterval: 15_000,
  });

  const handleRefresh = () => {
    refetch();
  };

  // ---------------------------------------------------------------------------
  // Derived data for charts
  // ---------------------------------------------------------------------------

  const breakdownChartData =
    data?.breakdowns.map((b) => ({
      cohort: b.cohort.charAt(0).toUpperCase() + b.cohort.slice(1),
      routing_avg_ms: b.routing_avg_ms,
      retrieval_avg_ms: b.retrieval_avg_ms,
      injection_avg_ms: b.injection_avg_ms,
    })) ?? [];

  const trendData =
    data?.trend.map((t) => ({
      ...t,
      treatment_p95: Math.round(t.treatment_p95),
      control_p95: Math.round(t.control_p95),
      delta_p95: Math.round(t.delta_p95),
    })) ?? [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            Latency Details
          </h2>
          <p className="text-sm text-muted-foreground">
            Per-cohort latency breakdown, percentile comparison, and trend analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          {effectivenessSource.isUsingMockData && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              Demo Data
            </Badge>
          )}
          <Link href="/effectiveness">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Cache Hit Rate Metric */}
      {isLoading ? (
        <Skeleton className="h-[88px] w-full max-w-xs rounded-lg" />
      ) : data?.cache ? (
        <div className="max-w-xs">
          <MetricCard
            label="Cache Hit Rate"
            value={`${(data.cache.hit_rate * 100).toFixed(1)}%`}
            icon={Database}
            status={data.cache.hit_rate >= 0.5 ? 'healthy' : 'warning'}
            tooltip={`${data.cache.total_hits} hits / ${data.cache.total_hits + data.cache.total_misses} total lookups`}
          />
        </div>
      ) : null}

      {/* Stacked Bar Chart: Latency Breakdown by Cohort */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Latency Breakdown by Cohort
          </CardTitle>
          <CardDescription>
            Average latency contribution from routing, retrieval, and injection per cohort
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : breakdownChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={breakdownChartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="cohort"
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fillOpacity: 0.85 }}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fillOpacity: 0.85 }}
                  label={{ value: 'ms', position: 'insideLeft', offset: 10, fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.15 }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      routing_avg_ms: 'Routing',
                      retrieval_avg_ms: 'Retrieval',
                      injection_avg_ms: 'Injection',
                    };
                    return [`${value.toFixed(1)}ms`, labels[name] ?? name];
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      routing_avg_ms: 'Routing',
                      retrieval_avg_ms: 'Retrieval',
                      injection_avg_ms: 'Injection',
                    };
                    return labels[value] ?? value;
                  }}
                />
                <Bar
                  dataKey="routing_avg_ms"
                  stackId="stack"
                  fill={CHART_COLORS.routing}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="retrieval_avg_ms"
                  stackId="stack"
                  fill={CHART_COLORS.retrieval}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="injection_avg_ms"
                  stackId="stack"
                  fill={CHART_COLORS.injection}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No breakdown data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Percentile Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Percentile Comparison</CardTitle>
          <CardDescription>P50 / P95 / P99 latency by cohort with sample counts</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data?.breakdowns && data.breakdowns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead className="text-right">P50</TableHead>
                  <TableHead className="text-right">P95</TableHead>
                  <TableHead className="text-right">P99</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.breakdowns.map((b) => (
                  <TableRow key={b.cohort}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          b.cohort === 'treatment'
                            ? 'text-blue-400 border-blue-500/30'
                            : 'text-zinc-400 border-zinc-500/30'
                        }
                      >
                        {b.cohort.charAt(0).toUpperCase() + b.cohort.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {b.p50_ms.toFixed(0)}ms
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {b.p95_ms.toFixed(0)}ms
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {b.p99_ms.toFixed(0)}ms
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {b.sample_count.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
              No percentile data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latency Delta Trend Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Latency Trend (P95)
          </CardTitle>
          <CardDescription>Treatment vs control P95 latency over time with delta</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fillOpacity: 0.85 }}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fillOpacity: 0.85 }}
                  label={{ value: 'ms', position: 'insideLeft', offset: 10, fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.15 }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      treatment_p95: 'Treatment P95',
                      control_p95: 'Control P95',
                      delta_p95: 'Delta P95',
                    };
                    return [`${value}ms`, labels[name] ?? name];
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      treatment_p95: 'Treatment P95',
                      control_p95: 'Control P95',
                      delta_p95: 'Delta P95',
                    };
                    return labels[value] ?? value;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="treatment_p95"
                  stroke={CHART_COLORS.treatmentP95}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="control_p95"
                  stroke={CHART_COLORS.controlP95}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="delta_p95"
                  stroke={CHART_COLORS.deltaP95}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No trend data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
