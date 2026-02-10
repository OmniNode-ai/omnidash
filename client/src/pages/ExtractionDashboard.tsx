/**
 * Extraction Dashboard (OMN-1804)
 *
 * Pattern extraction pipeline observability: pipeline health, latency heatmap,
 * pattern volume, and error rates. All data sourced from PostgreSQL via API.
 *
 * Layout: Stats row (4 metric cards) + 2x2 grid of panels.
 *
 * WebSocket integration: listens for EXTRACTION_INVALIDATE events to trigger
 * query re-fetches. The WebSocket carries no data payloads -- it only signals
 * "something changed, re-query the API".
 */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { extractionSource } from '@/lib/data-sources/extraction-source';
import { queryKeys } from '@/lib/query-keys';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, Clock, Zap, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import { MetricCard } from '@/components/MetricCard';
import { PipelineHealthPanel } from '@/components/extraction/PipelineHealthPanel';
import { LatencyHeatmap } from '@/components/extraction/LatencyHeatmap';
import { PatternVolumeChart } from '@/components/extraction/PatternVolumeChart';
import { ErrorRatesPanel } from '@/components/extraction/ErrorRatesPanel';

// ============================================================================
// Dashboard Page
// ============================================================================

export default function ExtractionDashboard() {
  const queryClient = useQueryClient();
  const [timeWindow, setTimeWindow] = useState('24h');

  // Summary stats for metric cards
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: queryKeys.extraction.summary(),
    queryFn: () => extractionSource.summary(),
    refetchInterval: 30_000,
  });

  // WebSocket invalidation: re-fetch all extraction queries on EXTRACTION_INVALIDATE
  const handleWebSocketMessage = useCallback(
    (msg: { type: string; data?: unknown; timestamp?: string }) => {
      if (msg.type === 'EXTRACTION_INVALIDATE') {
        queryClient.invalidateQueries({ queryKey: queryKeys.extraction.all });
      }
    },
    [queryClient]
  );

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  useEffect(() => {
    if (isConnected) {
      subscribe(['extraction']);
    }
    return () => {
      unsubscribe(['extraction']);
    };
  }, [isConnected, subscribe, unsubscribe]);

  // Format helpers
  const formatNumber = (n: number | null | undefined): string => {
    if (n == null) return '--';
    return n.toLocaleString();
  };

  const formatPercent = (n: number | null | undefined): string => {
    if (n == null) return '--';
    return `${(n * 100).toFixed(1)}%`;
  };

  const formatMs = (n: number | null | undefined): string => {
    if (n == null) return '--';
    return `${Math.round(n)}ms`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Extraction Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Pattern extraction pipeline observability and metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeWindow} onValueChange={setTimeWindow}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last 1h</SelectItem>
              <SelectItem value="6h">Last 6h</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7d</SelectItem>
              <SelectItem value="30d">Last 30d</SelectItem>
            </SelectContent>
          </Select>
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

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Injections"
          value={formatNumber(summary?.total_injections)}
          subtitle="Unique sessions with pattern injection"
          icon={Zap}
          isLoading={summaryLoading}
        />
        <MetricCard
          label="Patterns Matched"
          value={formatNumber(summary?.total_patterns_matched)}
          subtitle="Distinct patterns matched across all sessions"
          icon={Activity}
          isLoading={summaryLoading}
        />
        <MetricCard
          label="Avg Latency"
          value={formatMs(summary?.avg_latency_ms)}
          subtitle="End-to-end injection latency, all cohorts"
          icon={Clock}
          isLoading={summaryLoading}
        />
        <MetricCard
          label="Success Rate"
          value={formatPercent(summary?.success_rate)}
          subtitle={
            summary?.last_event_at
              ? `Last event: ${formatRelativeTime(summary.last_event_at)}`
              : undefined
          }
          icon={AlertTriangle}
          isLoading={summaryLoading}
        />
      </div>

      {/* 2x2 Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineHealthPanel />
        <LatencyHeatmap timeWindow={timeWindow} />
        <PatternVolumeChart timeWindow={timeWindow} />
        <ErrorRatesPanel />
      </div>
    </div>
  );
}
