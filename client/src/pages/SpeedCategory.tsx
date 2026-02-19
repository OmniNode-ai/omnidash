/**
 * Speed & Responsiveness Category Dashboard (OMN-2181)
 *
 * Phase 2 consolidated view combining Pipeline Metrics and Effectiveness
 * latency data into a single category landing page.
 *
 * Hero Metric: Cache Hit Rate
 * Content: Retrieval vs injection time breakdown, latency percentiles, pipeline health
 * Sources: ExtractionDashboard + EffectivenessLatency views
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { extractionSource } from '@/lib/data-sources/extraction-source';
import { effectivenessSource } from '@/lib/data-sources/effectiveness-source';
import { queryKeys } from '@/lib/query-keys';
import { MetricCard } from '@/components/MetricCard';
import { HeroMetric } from '@/components/HeroMetric';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PipelineHealthPanel } from '@/components/extraction/PipelineHealthPanel';
import { LatencyHeatmap } from '@/components/extraction/LatencyHeatmap';
import { Link } from 'wouter';
import { Zap, Clock, Activity, Gauge, ArrowRight, Database, Timer } from 'lucide-react';
import type { LatencyDetails } from '@shared/effectiveness-types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================================================
// Latency Percentile Mini-Chart
// ============================================================================

function LatencyPercentilesChart({ data }: { data: LatencyDetails | undefined }) {
  if (!data?.breakdowns?.length) {
    return (
      <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
        No latency percentile data available
      </div>
    );
  }

  const chartData = data.breakdowns.map((b) => ({
    cohort: b.cohort === 'treatment' ? 'Treatment' : 'Control',
    P50: b.p50_ms,
    P95: b.p95_ms,
    P99: b.p99_ms,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="cohort"
          tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fillOpacity: 0.85 }}
        />
        <YAxis
          tick={{ fill: 'hsl(var(--foreground))', fontSize: 12, fillOpacity: 0.85 }}
          tickFormatter={(v: number) => `${v}ms`}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(value: number, name: string) => [`${value.toFixed(0)}ms`, name]}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="P50" fill="#22c55e" radius={[2, 2, 0, 0]} />
        <Bar dataKey="P95" fill="#f59e0b" radius={[2, 2, 0, 0]} />
        <Bar dataKey="P99" fill="#ef4444" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function SpeedCategory() {
  const queryClient = useQueryClient();
  const [timeWindow] = useState('24h');

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const { data: extractionResult, isLoading: extractionLoading } = useQuery({
    queryKey: queryKeys.extraction.summary(),
    queryFn: () => extractionSource.summary(),
    refetchInterval: 30_000,
  });

  const extractionSummary = extractionResult?.data;

  const { data: latencyResult, isLoading: latencyLoading } = useQuery({
    queryKey: queryKeys.effectiveness.latency(),
    queryFn: async () => {
      const data = await effectivenessSource.latencyDetails();
      // Safe to read isUsingMockData here: JS is single-threaded; markMock/markReal
      // fired synchronously inside latencyDetails() before it returned.
      const isMock = effectivenessSource.isUsingMockData;
      return { data, isMock };
    },
    refetchInterval: 30_000,
  });

  // Ref-based mock-flag aggregation (mirrors ExtractionDashboard).
  // Each data source writes its mock status into `mockFlags.current[key]`
  // via `updateMockFlag`, which then derives the combined boolean and flushes
  // it into reactive state.  This avoids:
  //   - The `(prev) => prev || isMock` latch that can never go back to false.
  //   - Reading a mutable getter (`effectivenessSource.isUsingMockData`)
  //     directly in a useEffect dep array (React can't observe mutations).
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const mockFlags = useRef<Record<string, boolean>>({});

  const updateMockFlag = useCallback((panel: string, isMock: boolean) => {
    mockFlags.current[panel] = isMock;
    setIsUsingMockData(Object.values(mockFlags.current).some(Boolean));
  }, []);

  const onPipelineHealthMock = useCallback(
    (v: boolean) => updateMockFlag('pipelineHealth', v),
    [updateMockFlag]
  );
  const onLatencyHeatmapMock = useCallback(
    (v: boolean) => updateMockFlag('latency', v),
    [updateMockFlag]
  );

  // Wire extraction result → mock flag.
  useEffect(() => {
    updateMockFlag('extraction', extractionResult?.isMock ?? false);
  }, [extractionResult, updateMockFlag]);

  // Wire effectiveness source → mock flag.  The queryFn reads isUsingMockData
  // synchronously after the await, so latencyResult.isMock is always consistent
  // with the data returned by that same fetch.
  useEffect(() => {
    updateMockFlag('effectiveness', latencyResult?.isMock ?? false);
  }, [latencyResult, updateMockFlag]);

  // ---------------------------------------------------------------------------
  // WebSocket: invalidation-driven re-fetch
  // ---------------------------------------------------------------------------

  const handleWebSocketMessage = useCallback(
    (msg: { type: string }) => {
      if (msg.type === 'EXTRACTION_INVALIDATE') {
        queryClient.invalidateQueries({ queryKey: queryKeys.extraction.all });
      }
      if (msg.type === 'EFFECTIVENESS_UPDATE') {
        queryClient.invalidateQueries({ queryKey: queryKeys.effectiveness.all });
      }
    },
    [queryClient]
  );

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  useEffect(() => {
    if (isConnected) {
      subscribe(['extraction', 'effectiveness']);
    }
    return () => {
      unsubscribe(['extraction', 'effectiveness']);
    };
  }, [isConnected, subscribe, unsubscribe]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const cacheHitRate = latencyResult?.data?.cache?.hit_rate;
  const cacheHitDisplay = cacheHitRate != null ? `${(cacheHitRate * 100).toFixed(1)}%` : '--';
  const cacheHitStatus: 'healthy' | 'warning' | 'error' | undefined =
    cacheHitRate != null
      ? cacheHitRate >= 0.8
        ? 'healthy'
        : cacheHitRate >= 0.5
          ? 'warning'
          : 'error'
      : undefined;

  const avgLatency = extractionSummary?.avg_latency_ms;
  const successRate = extractionSummary?.success_rate;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Speed & Responsiveness
          </h2>
          <p className="text-sm text-muted-foreground">
            Cache performance, latency percentiles, and pipeline health
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isUsingMockData && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              Demo Data
            </Badge>
          )}
          <div className="flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`}
            />
            <span className="text-[10px] text-muted-foreground">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Hero Metric: Cache Hit Rate */}
      <HeroMetric
        label="Cache Hit Rate"
        value={cacheHitDisplay}
        subtitle="Percentage of pattern retrievals served from cache"
        status={cacheHitStatus}
        isLoading={latencyLoading}
      />

      {/* Supporting Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Avg Latency"
          value={avgLatency != null ? `${Math.round(avgLatency)}ms` : '--'}
          subtitle="End-to-end injection latency"
          icon={Clock}
          isLoading={extractionLoading}
        />
        <MetricCard
          label="Total Injections"
          value={
            extractionSummary?.total_injections != null
              ? extractionSummary.total_injections.toLocaleString()
              : '--'
          }
          subtitle="Sessions with pattern injection"
          icon={Activity}
          isLoading={extractionLoading}
        />
        <MetricCard
          label="Pipeline Success"
          value={successRate != null ? `${(successRate * 100).toFixed(1)}%` : '--'}
          subtitle="Extraction pipeline success rate"
          icon={Gauge}
          status={
            successRate != null
              ? successRate >= 0.95
                ? 'healthy'
                : successRate >= 0.8
                  ? 'warning'
                  : 'error'
              : undefined
          }
          isLoading={extractionLoading}
        />
        <MetricCard
          label="Patterns Matched"
          value={
            extractionSummary?.total_patterns_matched != null
              ? extractionSummary.total_patterns_matched.toLocaleString()
              : '--'
          }
          subtitle="Distinct patterns matched"
          icon={Database}
          isLoading={extractionLoading}
        />
      </div>

      {/* Latency Percentiles + Pipeline Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              Latency Percentiles (Treatment vs Control)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LatencyPercentilesChart data={latencyResult?.data} />
          </CardContent>
        </Card>
        <PipelineHealthPanel onMockStateChange={onPipelineHealthMock} />
      </div>

      {/* Latency Heatmap */}
      <LatencyHeatmap timeWindow={timeWindow} onMockStateChange={onLatencyHeatmapMock} />

      {/* Drill-Down Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/extraction">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors group">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="w-4 h-4 text-muted-foreground" />
                Pipeline Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Full extraction pipeline observability with error rates and volume charts.
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary group-hover:underline">
                View details
                <ArrowRight className="w-3 h-3" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/effectiveness/latency">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors group">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Latency Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Detailed P50/P95/P99 latency by cohort, trend charts, and cache hit rates.
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary group-hover:underline">
                View details
                <ArrowRight className="w-3 h-3" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
