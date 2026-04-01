/**
 * Plan Reviewer Dashboard (OMN-3324)
 *
 * Displays plan-reviewer strategy run data from
 * onex.evt.omniintelligence.plan-review-strategy-run-completed.v1:
 * - Recent Runs table — timestamp, strategy badge, models, findings/BLOCK count,
 *   avg confidence, duration
 * - Strategy comparison chart — grouped bars: avg_confidence and block_rate per strategy
 * - Model accuracy leaderboard — model_id + score from latest snapshot
 */

import { useQuery } from '@tanstack/react-query';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { queryKeys } from '@/lib/query-keys';
import { buildApiUrl } from '@/lib/data-sources/api-base';
import { DemoBanner } from '@/components/DemoBanner';
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
import { RefreshCw, AlertCircle, BarChart3, Trophy, FileSearch } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { POLLING_INTERVAL_SLOW, getPollingInterval } from '@/lib/constants/query-config';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface PlanReviewRun {
  id: string;
  eventId: string;
  runId: string;
  strategy: string;
  modelsUsed: string[];
  planTextHash: string;
  findingsCount: number;
  blocksCount: number;
  categoriesWithFindings: string[];
  categoriesClean: string[];
  avgConfidence: number | null;
  tokensUsed: number | null;
  durationMs: number | null;
  strategyRunStored: boolean;
  modelWeights: Record<string, number> | null;
  emittedAt: string;
  projectedAt: string;
}

interface StrategyAggregate {
  strategy: string;
  run_count: number;
  avg_confidence: number | null;
  avg_findings_count: number;
  avg_blocks_count: number;
  block_rate: number | null;
  avg_duration_ms: number | null;
}

interface AccuracyResponse {
  label: string;
  run_id: string | null;
  strategy: string | null;
  emitted_at: string | null;
  model_weights: Record<string, number> | null;
}

// ============================================================================
// Constants
// ============================================================================

const STRATEGY_COLORS: Record<string, string> = {
  single: '#3b82f6',
  multi: '#8b5cf6',
  ensemble: '#22c55e',
  consensus: '#f59e0b',
  parallel: '#ef4444',
  sequential: '#06b6d4',
};

const DEFAULT_STRATEGY_COLOR = '#94a3b8';

function getStrategyColor(strategy: string): string {
  return STRATEGY_COLORS[strategy.toLowerCase()] ?? DEFAULT_STRATEGY_COLOR;
}

// ============================================================================
// Fetch helpers
// ============================================================================

async function fetchRuns(limit = 50): Promise<PlanReviewRun[]> {
  const res = await fetch(buildApiUrl(`/api/plan-reviewer/runs?limit=${limit}`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchStrategies(): Promise<StrategyAggregate[]> {
  const res = await fetch(buildApiUrl('/api/plan-reviewer/strategies'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAccuracy(): Promise<AccuracyResponse> {
  const res = await fetch(buildApiUrl('/api/plan-reviewer/accuracy'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ============================================================================
// Sub-components
// ============================================================================

function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5 max-w-[60px]">
        <div
          className={cn(
            'h-1.5 rounded-full',
            pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const color = getStrategyColor(strategy);
  return (
    <Badge className="text-white text-[10px] font-medium" style={{ backgroundColor: color }}>
      {strategy}
    </Badge>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function PlanReviewer() {
  const { isDemoMode } = useDemoMode();

  const {
    data: runs,
    isLoading: runsLoading,
    isError: runsError,
    refetch: refetchRuns,
    isFetching: runsFetching,
  } = useQuery({
    queryKey: queryKeys.planReviewer.runs(50),
    queryFn: () => (isDemoMode ? Promise.resolve([]) : fetchRuns(50)),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_SLOW),
    enabled: !isDemoMode,
  });

  const {
    data: strategies,
    isLoading: strategiesLoading,
    isError: strategiesError,
  } = useQuery({
    queryKey: queryKeys.planReviewer.strategies(),
    queryFn: () => (isDemoMode ? Promise.resolve([]) : fetchStrategies()),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_SLOW),
    enabled: !isDemoMode,
  });

  const {
    data: accuracy,
    isLoading: accuracyLoading,
    isError: accuracyError,
  } = useQuery({
    queryKey: queryKeys.planReviewer.accuracy(),
    queryFn: () =>
      isDemoMode
        ? Promise.resolve({
            label: 'latest_snapshot',
            run_id: null,
            strategy: null,
            emitted_at: null,
            model_weights: null,
          })
        : fetchAccuracy(),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_SLOW),
    enabled: !isDemoMode,
  });

  const hasNoData = !runsLoading && !runsError && Array.isArray(runs) && runs.length === 0;

  // Strategy comparison chart data
  const strategyChartData = (strategies ?? []).map((s) => ({
    strategy: s.strategy,
    avg_confidence_pct: s.avg_confidence != null ? Math.round(s.avg_confidence * 100) : 0,
    block_rate_pct: s.block_rate != null ? Math.round(s.block_rate * 100) : 0,
    run_count: s.run_count,
  }));

  // Model accuracy leaderboard data
  const modelWeights = accuracy?.model_weights;
  const leaderboard = modelWeights
    ? Object.entries(modelWeights)
        .map(([model, score]) => ({ model, score: Number(score) }))
        .sort((a, b) => b.score - a.score)
    : [];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plan Reviewer</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Strategy run completions from{' '}
            <code className="text-xs bg-muted px-1 rounded">
              onex.evt.omniintelligence.plan-review-strategy-run-completed.v1
            </code>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetchRuns()}
          disabled={runsFetching}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', runsFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {isDemoMode && <DemoBanner />}

      {hasNoData && !isDemoMode && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No data yet</AlertTitle>
          <AlertDescription>
            Waiting for <code className="text-xs">plan-review-strategy-run-completed.v1</code>{' '}
            events from the omniintelligence runtime. This panel will populate once OMN-3323 is
            deployed and events flow.
          </AlertDescription>
        </Alert>
      )}

      {/* Recent Runs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Recent Runs</CardTitle>
          </div>
          <CardDescription>Latest 50 plan-review strategy run completions</CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : runsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Failed to load recent runs.</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Models</TableHead>
                    <TableHead className="text-right">Findings</TableHead>
                    <TableHead className="text-right">Blocks</TableHead>
                    <TableHead>Avg Confidence</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runs ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No runs recorded yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    (runs ?? []).map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(run.emittedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <StrategyBadge strategy={run.strategy} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {run.modelsUsed.map((m) => (
                              <Badge key={m} variant="outline" className="text-[9px] px-1 py-0">
                                {m.length > 20 ? m.slice(0, 18) + '…' : m}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.findingsCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.blocksCount > 0 ? (
                            <span className="text-red-500 font-medium">{run.blocksCount}</span>
                          ) : (
                            run.blocksCount
                          )}
                        </TableCell>
                        <TableCell>
                          <ConfidenceBar value={run.avgConfidence} />
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {run.durationMs != null ? `${run.durationMs}ms` : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy Comparison Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Strategy Comparison</CardTitle>
          </div>
          <CardDescription>
            Avg confidence (%) and block rate (%) per strategy across all runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {strategiesLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : strategiesError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Failed to load strategy aggregates.</AlertDescription>
            </Alert>
          ) : strategyChartData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No strategy data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={strategyChartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="strategy" tick={{ fontSize: 11 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `${value}%`,
                    name === 'avg_confidence_pct' ? 'Avg Confidence' : 'Block Rate',
                  ]}
                />
                <Legend
                  formatter={(value: string) =>
                    value === 'avg_confidence_pct' ? 'Avg Confidence' : 'Block Rate'
                  }
                />
                <Bar dataKey="avg_confidence_pct" name="avg_confidence_pct" radius={[3, 3, 0, 0]}>
                  {strategyChartData.map((entry) => (
                    <Cell key={entry.strategy} fill={getStrategyColor(entry.strategy)} />
                  ))}
                </Bar>
                <Bar
                  dataKey="block_rate_pct"
                  name="block_rate_pct"
                  fill="#ef4444"
                  radius={[3, 3, 0, 0]}
                  opacity={0.7}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Model Accuracy Leaderboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Model Accuracy Leaderboard</CardTitle>
          </div>
          <CardDescription>
            Latest snapshot — updates each run. Score reflects correctness weight from the most
            recent plan-review run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accuracyLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : accuracyError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Failed to load model accuracy.</AlertDescription>
            </Alert>
          ) : leaderboard.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No model weight data in latest snapshot
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, idx) => (
                <div key={entry.model} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium truncate">{entry.model}</span>
                      <span className="text-sm tabular-nums ml-2">
                        {(entry.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-muted rounded-full h-1.5">
                      <div
                        className={cn(
                          'h-1.5 rounded-full',
                          entry.score >= 0.8
                            ? 'bg-green-500'
                            : entry.score >= 0.6
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${Math.round(entry.score * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {accuracy?.emitted_at && (
                <p className="text-[10px] text-muted-foreground pt-2">
                  From run <code>{accuracy.run_id}</code> —{' '}
                  {new Date(accuracy.emitted_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
