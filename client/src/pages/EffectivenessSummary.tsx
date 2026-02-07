/**
 * EffectivenessSummary
 *
 * Executive summary page for injection effectiveness metrics.
 * Shows 4 metric tiles (injection rate, context utilization, agent accuracy,
 * latency delta P95), an auto-throttle warning banner, session counts,
 * and sub-navigation to the 3 detail pages.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { effectivenessSource } from '@/lib/data-sources/effectiveness-source';
import { MetricCard } from '@/components/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { Link } from 'wouter';
import type {
  EffectivenessSummary as SummaryType,
  ThrottleStatus,
} from '@shared/effectiveness-types';
import {
  Activity,
  AlertTriangle,
  Gauge,
  Target,
  Clock,
  Zap,
  Users,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

// ============================================================================
// Component
// ============================================================================

/**
 * Executive summary dashboard for injection effectiveness.
 *
 * Displays key metrics at a glance with status indicators against targets,
 * an auto-throttle warning banner when injection is paused, session counts
 * for treatment/control cohorts, and navigation links to detail pages.
 *
 * Data refreshes via 15-second polling with WebSocket-triggered invalidation
 * for real-time responsiveness.
 */
export default function EffectivenessSummary() {
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

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<SummaryType>({
    queryKey: queryKeys.effectiveness.summary(),
    queryFn: () => effectivenessSource.summary(),
    refetchInterval: 15_000,
  });

  const {
    data: throttle,
    isLoading: throttleLoading,
    refetch: refetchThrottle,
  } = useQuery<ThrottleStatus>({
    queryKey: queryKeys.effectiveness.throttle(),
    queryFn: () => effectivenessSource.throttleStatus(),
    refetchInterval: 15_000,
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchThrottle();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Injection Effectiveness
          </h2>
          <p className="text-sm text-muted-foreground">
            Executive summary of context injection performance against targets
          </p>
        </div>
        <div className="flex items-center gap-3">
          {effectivenessSource.isUsingMockData && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              Demo Data
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Auto-Throttle Warning Banner (R2) */}
      {!throttleLoading && throttle?.active && (
        <Card className="border-red-500/40 bg-red-500/[0.06]">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-red-400">Auto-Throttle Active</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {throttle.reason ?? 'Injection has been paused due to threshold violations.'}
                </p>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  {throttle.latency_delta_p95_1h != null && (
                    <span>
                      Latency delta P95 (1h):{' '}
                      <span className="font-mono text-red-400">
                        +{throttle.latency_delta_p95_1h.toFixed(0)}ms
                      </span>
                    </span>
                  )}
                  {throttle.median_utilization_1h != null && (
                    <span>
                      Median utilization (1h):{' '}
                      <span className="font-mono">
                        {(throttle.median_utilization_1h * 100).toFixed(1)}%
                      </span>
                    </span>
                  )}
                  <span>
                    Injected sessions (1h):{' '}
                    <span className="font-mono">{throttle.injected_sessions_1h}</span>
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric Tiles */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            label="Injection Rate"
            value={`${(summary.injection_rate * 100).toFixed(1)}%`}
            icon={Zap}
            status={summary.injection_rate >= summary.injection_rate_target ? 'healthy' : 'warning'}
            tooltip={`Percentage of sessions with context injection (target: ${(summary.injection_rate_target * 100).toFixed(0)}%)`}
          />
          <MetricCard
            label="Context Utilization"
            value={summary.median_utilization.toFixed(2)}
            icon={Gauge}
            status={
              summary.median_utilization >= summary.utilization_target ? 'healthy' : 'warning'
            }
            tooltip={`Median utilization score of injected patterns (target: ${summary.utilization_target})`}
          />
          <MetricCard
            label="Agent Accuracy"
            value={summary.mean_agent_accuracy.toFixed(2)}
            icon={Target}
            status={summary.mean_agent_accuracy >= summary.accuracy_target ? 'healthy' : 'warning'}
            tooltip={`Mean agent-match accuracy across sessions (target: ${summary.accuracy_target})`}
          />
          <MetricCard
            label="Latency Delta P95"
            value={`${summary.latency_delta_p95_ms >= 0 ? '+' : ''}${summary.latency_delta_p95_ms.toFixed(0)}ms`}
            icon={Clock}
            status={
              summary.latency_delta_p95_ms <= summary.latency_delta_target_ms
                ? 'healthy'
                : 'warning'
            }
            tooltip={`P95 latency overhead of injection vs control (target: +${summary.latency_delta_target_ms}ms)`}
          />
        </div>
      ) : null}

      {/* Session Counts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Session Counts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : summary ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Total
                </div>
                <div className="text-2xl font-bold font-mono">{summary.total_sessions}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Treatment
                </div>
                <div className="text-2xl font-bold font-mono text-blue-400">
                  {summary.treatment_sessions}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Control
                </div>
                <div className="text-2xl font-bold font-mono text-zinc-400">
                  {summary.control_sessions}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-10 flex items-center text-muted-foreground text-sm">
              No session data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                P50/P95/P99 latency by cohort, trend charts, and cache hit rates.
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary group-hover:underline">
                View details
                <ArrowRight className="w-3 h-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/effectiveness/utilization">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors group">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="w-4 h-4 text-muted-foreground" />
                Utilization Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Utilization distribution, per-method scores, and low-utilization sessions.
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary group-hover:underline">
                View details
                <ArrowRight className="w-3 h-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/effectiveness/ab">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors group">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                A/B Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Side-by-side treatment vs control cohort metrics and success rates.
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
