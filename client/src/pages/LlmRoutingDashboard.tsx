/**
 * LLM Routing Effectiveness Dashboard (OMN-2279)
 *
 * Compares LLM routing vs fuzzy routing effectiveness:
 * - Agreement rate (GOLDEN METRIC — target >60%, alert if LLM disagrees >40%)
 * - Latency distribution per routing method
 * - Fallback frequency
 * - Cost per routing decision
 * - Longitudinal comparison by routing_prompt_version
 * - Top disagreement pairs table
 *
 * Events consumed from: onex.evt.omniclaude.llm-routing-decision.v1
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { llmRoutingSource } from '@/lib/data-sources/llm-routing-source';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  GitFork,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  BarChart3,
  AlertCircle,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  POLLING_INTERVAL_MEDIUM,
  POLLING_INTERVAL_SLOW,
  getPollingInterval,
} from '@/lib/constants/query-config';
import type { LlmRoutingTimeWindow, LlmRoutingDisagreement } from '@shared/llm-routing-types';

// ============================================================================
// Constants
// ============================================================================

const TIME_WINDOWS: { value: LlmRoutingTimeWindow; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

/** Threshold below which the alert fires (LLM disagrees with fuzzy >40%). */
const DISAGREEMENT_ALERT_THRESHOLD = 0.4;
/** Golden metric target. */
const AGREEMENT_TARGET = 0.6;

const METHOD_COLORS: Record<string, string> = {
  LLM: '#3b82f6',
  Fuzzy: '#8b5cf6',
};

const VERSION_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ============================================================================
// Helpers
// ============================================================================

function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.001) return `$${(usd * 1_000_000).toFixed(1)}µ`;
  return `$${usd.toFixed(4)}`;
}

function relativeTime(isoTs: string): string {
  if (!isoTs) return 'never';
  const ts = new Date(isoTs).getTime();
  if (isNaN(ts)) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Color bucket for agreement rate (0–1). */
function agreementColor(rate: number): string {
  if (rate >= AGREEMENT_TARGET) return 'text-green-500';
  if (rate >= 0.5) return 'text-yellow-500';
  return 'text-red-500';
}

/**
 * Color bucket for a confidence score (0–1).
 * Uses separate thresholds from agreementColor because confidence scores
 * (typically 0.7–0.95) have a different meaningful range than agreement rates.
 */
function confidenceColor(score: number): string {
  if (score >= 0.7) return 'text-green-500';
  if (score >= 0.5) return 'text-yellow-500';
  return 'text-red-500';
}

function agreementBadge(rate: number): 'default' | 'secondary' | 'destructive' {
  if (rate >= AGREEMENT_TARGET) return 'default';
  if (rate >= 0.5) return 'secondary';
  return 'destructive';
}

// ============================================================================
// Sub-components
// ============================================================================

/** Segmented time window selector. */
function WindowSelector({
  value,
  onChange,
}: {
  value: LlmRoutingTimeWindow;
  onChange: (w: LlmRoutingTimeWindow) => void;
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden">
      {TIME_WINDOWS.map((w) => (
        <button
          key={w.value}
          type="button"
          onClick={() => onChange(w.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors',
            value === w.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted'
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Hero card for the Agreement Rate golden metric.
 * Shows the rate, a trend sparkline, and the target indicator.
 */
function AgreementRateHero({
  rate,
  trend,
  isLoading,
}: {
  rate: number;
  trend: Array<{ date: string; value: number }>;
  isLoading: boolean;
}) {
  const aboveTarget = rate >= AGREEMENT_TARGET;
  return (
    <Card className="col-span-full md:col-span-2 border-2 border-primary/40 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Agreement Rate
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Golden Metric — LLM and fuzzy routing select the same agent (target: &gt;60%)
          </CardDescription>
        </div>
        <Badge variant={isLoading ? 'secondary' : agreementBadge(rate)} className="text-xs">
          {isLoading
            ? '...'
            : aboveTarget
              ? 'On Target'
              : rate >= 0.5
                ? 'Below Target'
                : 'Critical'}
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-end gap-6">
            <div>
              <span className={cn('text-5xl font-bold tabular-nums', agreementColor(rate))}>
                {fmtPct(rate, 0)}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                LLM / fuzzy agreement · target {fmtPct(AGREEMENT_TARGET, 0)}
              </p>
            </div>
            {trend.length > 0 && (
              <div className="flex-1 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [fmtPct(v), 'Agreement Rate']}
                      labelFormatter={(l) => String(l).slice(0, 10)}
                      contentStyle={{ fontSize: '11px' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Simple metric stat card. */
function StatCard({
  title,
  value,
  description,
  icon: Icon,
  valueClass,
  isLoading,
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ElementType;
  valueClass?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className={cn('text-2xl font-bold tabular-nums', valueClass)}>{value}</div>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Top disagreement pairs table. */
function DisagreementsTable({
  disagreements,
  isLoading,
  isError,
}: {
  disagreements: LlmRoutingDisagreement[];
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-yellow-500" />
          Top Disagreement Pairs
        </CardTitle>
        <CardDescription>
          Agent pairs where LLM and fuzzy routing disagree most frequently
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-destructive py-4 text-center">
            Failed to load disagreement data.
          </p>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : disagreements.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No disagreements in this window.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LLM Selection</TableHead>
                <TableHead>Fuzzy Selection</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">LLM Conf.</TableHead>
                <TableHead className="text-right">Fuzzy Conf.</TableHead>
                <TableHead>Prompt Version</TableHead>
                <TableHead className="text-right">Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disagreements.map((d, idx) => (
                <TableRow
                  key={`${d.llm_agent}:${d.fuzzy_agent}:${d.routing_prompt_version}:${idx}`}
                >
                  <TableCell>
                    <span className="font-mono text-xs text-blue-400">{d.llm_agent}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-purple-400">{d.fuzzy_agent}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtCount(d.count)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn('font-mono text-xs', confidenceColor(d.avg_llm_confidence))}
                    >
                      {fmtPct(d.avg_llm_confidence)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn('font-mono text-xs', confidenceColor(d.avg_fuzzy_confidence))}
                    >
                      {fmtPct(d.avg_fuzzy_confidence)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
                      {d.routing_prompt_version}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(d.occurred_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Dashboard
// ============================================================================

export default function LlmRoutingDashboard() {
  const [timeWindow, setTimeWindow] = useState<LlmRoutingTimeWindow>('7d');
  const queryClient = useQueryClient();

  // Invalidate all LLM routing queries on WebSocket LLM_ROUTING_INVALIDATE event
  useWebSocket({
    onMessage: useCallback(
      (msg: { type: string; timestamp: string }) => {
        if (msg.type === 'LLM_ROUTING_INVALIDATE') {
          // Server emits LLM_ROUTING_INVALIDATE via llmRoutingEventEmitter in
          // server/llm-routing-events.ts, triggered by ReadModelConsumer after
          // each successful llm_routing_decisions projection (OMN-2279).
          queryClient.invalidateQueries({ queryKey: queryKeys.llmRouting.all });
        }
      },
      [queryClient]
    ),
    debug: false,
  });

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: queryKeys.llmRouting.summary(timeWindow),
    queryFn: () => llmRoutingSource.summary(timeWindow, { mockOnEmpty: true }),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM),
    staleTime: 30_000,
  });

  const {
    data: latency,
    isLoading: latencyLoading,
    isError: latencyError,
    refetch: refetchLatency,
  } = useQuery({
    queryKey: queryKeys.llmRouting.latency(timeWindow),
    queryFn: () => llmRoutingSource.latency(timeWindow, { mockOnEmpty: true }),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_SLOW),
    staleTime: 60_000,
  });

  const {
    data: byVersion,
    isLoading: versionLoading,
    isError: versionError,
    refetch: refetchVersion,
  } = useQuery({
    queryKey: queryKeys.llmRouting.byVersion(timeWindow),
    queryFn: () => llmRoutingSource.byVersion(timeWindow, { mockOnEmpty: true }),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_SLOW),
    staleTime: 60_000,
  });

  const {
    data: disagreements,
    isLoading: disagreementsLoading,
    isError: disagreementsError,
    refetch: refetchDisagreements,
  } = useQuery({
    queryKey: queryKeys.llmRouting.disagreements(timeWindow),
    queryFn: () => llmRoutingSource.disagreements(timeWindow, { mockOnEmpty: true }),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM),
    staleTime: 30_000,
  });

  const {
    data: trend,
    isLoading: trendLoading,
    isError: trendError,
    refetch: refetchTrend,
  } = useQuery({
    queryKey: queryKeys.llmRouting.trend(timeWindow),
    queryFn: () => llmRoutingSource.trend(timeWindow, { mockOnEmpty: true }),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_SLOW),
    staleTime: 60_000,
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const handleRefresh = () => {
    void refetchSummary();
    void refetchLatency();
    void refetchVersion();
    void refetchDisagreements();
    void refetchTrend();
  };

  // llmRoutingSource.isUsingMockData reads a mutable Set on the singleton.
  const [isUsingMockData, setIsUsingMockData] = useState(false);

  const allSettled =
    !summaryLoading && !latencyLoading && !versionLoading && !disagreementsLoading && !trendLoading;

  // Single effect keyed on [allSettled, timeWindow].
  // - When timeWindow changes and queries are not yet settled: clear mock state
  //   so the banner is hidden immediately during in-flight requests.
  // - When all queries are settled: read the mock state to decide whether to
  //   show the banner.
  useEffect(() => {
    if (allSettled) {
      setIsUsingMockData(llmRoutingSource.isUsingMockData);
    } else {
      // Queries are in-flight (first load or a window switch that caused a
      // cache miss). Clear and hide the banner until settled.
      llmRoutingSource.clearMockState();
      setIsUsingMockData(false);
    }
  }, [allSettled, timeWindow]);

  const disagreementRate = summary ? 1 - summary.agreement_rate : 0;
  const showDisagreementAlert =
    !summaryLoading && summary != null && disagreementRate > DISAGREEMENT_ALERT_THRESHOLD;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" data-testid="page-llm-routing-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">LLM Routing Effectiveness</h1>
          <p className="text-muted-foreground">
            Comparing LLM routing vs fuzzy routing agreement, latency, and cost
          </p>
        </div>
        <div className="flex items-center gap-3">
          <WindowSelector value={timeWindow} onChange={setTimeWindow} />
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Demo Mode Banner */}
      {isUsingMockData && (
        <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-500">Demo Mode</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Database unavailable or no LLM routing events yet. Showing representative demo data. The
            dashboard will show live data once{' '}
            <code className="text-xs">onex.evt.omniclaude.llm-routing-decision.v1</code> events are
            received.
          </AlertDescription>
        </Alert>
      )}

      {/* Disagreement Alert (golden metric health check) */}
      {showDisagreementAlert && (
        <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-red-500">High Disagreement Rate Detected</AlertTitle>
          <AlertDescription>
            LLM disagrees with fuzzy routing <strong>{fmtPct(disagreementRate)}</strong> of the time
            (threshold: {fmtPct(DISAGREEMENT_ALERT_THRESHOLD)}). This may indicate a flawed routing
            prompt or a mis-ranked fuzzy matcher. Review the top disagreement pairs below and
            compare prompt versions.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Banner */}
      {summaryError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load LLM routing data</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Hero: Agreement Rate + Stat Cards ───────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Golden metric spans 2 columns */}
        <AgreementRateHero
          rate={summary?.agreement_rate ?? 0}
          trend={summary?.agreement_rate_trend ?? []}
          isLoading={summaryLoading}
        />

        {/* Fallback Rate */}
        <StatCard
          title="Fallback Rate"
          value={summaryLoading ? '—' : fmtPct(summary?.fallback_rate ?? 0)}
          description="Decisions using fuzzy-only (LLM unavailable)"
          icon={Zap}
          valueClass={(summary?.fallback_rate ?? 0) < 0.1 ? 'text-green-500' : 'text-yellow-500'}
          isLoading={summaryLoading}
        />

        {/* Avg Cost per Decision */}
        <StatCard
          title="Avg Cost / Decision"
          value={summaryLoading ? '—' : fmtCost(summary?.avg_cost_usd ?? 0)}
          description="Estimated USD per LLM routing call"
          icon={DollarSign}
          isLoading={summaryLoading}
        />

        {/* Total Decisions */}
        <StatCard
          title="Total Decisions"
          value={summaryLoading ? '—' : fmtCount(summary?.total_decisions ?? 0)}
          description={`${fmtCount(summary?.counts.disagreed ?? 0)} disagreements`}
          icon={BarChart3}
          isLoading={summaryLoading}
        />

        {/* LLM p50 Latency */}
        <StatCard
          title="LLM p50 Latency"
          value={summaryLoading ? '—' : fmtMs(summary?.llm_p50_latency_ms ?? 0)}
          description={`p95: ${fmtMs(summary?.llm_p95_latency_ms ?? 0)}`}
          icon={Clock}
          valueClass="text-blue-400"
          isLoading={summaryLoading}
        />

        {/* Fuzzy p50 Latency */}
        <StatCard
          title="Fuzzy p50 Latency"
          value={summaryLoading ? '—' : fmtMs(summary?.fuzzy_p50_latency_ms ?? 0)}
          description={`p95: ${fmtMs(summary?.fuzzy_p95_latency_ms ?? 0)}`}
          icon={Clock}
          valueClass="text-purple-400"
          isLoading={summaryLoading}
        />
      </div>

      {/* ── Trend Chart ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Routing Effectiveness Trends
          </CardTitle>
          <CardDescription>Agreement rate, fallback rate, and cost over time</CardDescription>
        </CardHeader>
        <CardContent>
          {trendError ? (
            <p className="text-sm text-destructive py-8 text-center">Failed to load trend data.</p>
          ) : trendLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (trend?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No trend data available.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => String(v).slice(5)}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  yAxisId="rate"
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, 1]}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tickFormatter={(v: number) => `$${(v * 1_000_000).toFixed(0)}µ`}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  formatter={(v: number, name: string) => {
                    if (name === 'avg_cost_usd') return [fmtCost(v), 'Avg Cost'];
                    return [
                      fmtPct(v),
                      name === 'agreement_rate' ? 'Agreement Rate' : 'Fallback Rate',
                    ];
                  }}
                  labelFormatter={(l) => String(l).slice(0, 10)}
                  contentStyle={{ fontSize: '12px' }}
                />
                <Legend
                  formatter={(value) =>
                    value === 'agreement_rate'
                      ? 'Agreement Rate'
                      : value === 'fallback_rate'
                        ? 'Fallback Rate'
                        : 'Avg Cost'
                  }
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="agreement_rate"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="fallback_rate"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 3"
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="avg_cost_usd"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="2 4"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Latency Distribution + Version Comparison ────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Latency Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Latency Distribution
            </CardTitle>
            <CardDescription>p50 / p90 / p95 / p99 latency per routing method</CardDescription>
          </CardHeader>
          <CardContent>
            {latencyError ? (
              <p className="text-sm text-destructive py-4 text-center">
                Failed to load latency data.
              </p>
            ) : latencyLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (latency?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={latency} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="method"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tickFormatter={(v: number) => fmtMs(v)}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      fmtMs(v),
                      name === 'p50_ms'
                        ? 'p50'
                        : name === 'p90_ms'
                          ? 'p90'
                          : name === 'p95_ms'
                            ? 'p95'
                            : 'p99',
                    ]}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Legend formatter={(v) => v.replace('_ms', '').toUpperCase()} />
                  <Bar dataKey="p50_ms" radius={[4, 4, 0, 0]}>
                    {(latency ?? []).map((l) => (
                      <Cell key={l.method} fill={METHOD_COLORS[l.method] ?? '#6366f1'} />
                    ))}
                  </Bar>
                  <Bar dataKey="p95_ms" radius={[4, 4, 0, 0]}>
                    {(latency ?? []).map((l) => (
                      <Cell
                        key={l.method}
                        fill={METHOD_COLORS[l.method] ?? '#6366f1'}
                        fillOpacity={0.55}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Agreement Rate by Prompt Version */}
        <Card>
          <CardHeader>
            <CardTitle>Agreement Rate by Prompt Version</CardTitle>
            <CardDescription>
              Longitudinal comparison: improvement across routing_prompt_version releases
            </CardDescription>
          </CardHeader>
          <CardContent>
            {versionError ? (
              <p className="text-sm text-destructive py-4 text-center">
                Failed to load version data.
              </p>
            ) : versionLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (byVersion?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={byVersion}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    type="category"
                    dataKey="routing_prompt_version"
                    tick={{ fontSize: 11 }}
                    width={60}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    formatter={(v: number) => [fmtPct(v), 'Agreement Rate']}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Bar dataKey="agreement_rate" radius={[0, 4, 4, 0]}>
                    {(byVersion ?? []).map((_, idx) => (
                      <Cell key={idx} fill={VERSION_COLORS[idx % VERSION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Disagreement Pairs ────────────────────────────────────────── */}
      <DisagreementsTable
        disagreements={disagreements ?? []}
        isLoading={disagreementsLoading}
        isError={disagreementsError}
      />
    </div>
  );
}
