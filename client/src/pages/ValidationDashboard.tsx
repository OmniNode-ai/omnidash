/**
 * ValidationDashboard
 *
 * Cross-repo validation run history, violation counts, trends,
 * and validation lifecycle tier tracking.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 * @see OMN-2152 - Expand Checks + Artifacts: Validation Lifecycle
 */

import { useState, useMemo, useEffect, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { validationSource } from '@/lib/data-sources/validation-source';
import type { ValidationSummary, RunsListResponse } from '@/lib/data-sources/validation-source';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard } from '@/components/MetricCard';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Activity,
  ArrowRight,
  Layers,
  ShieldAlert,
  CircleDot,
  Ban,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { queryKeys } from '@/lib/query-keys';
import type {
  ValidationRun,
  RepoTrends,
  LifecycleSummary,
  LifecycleTier,
  CandidateStatus,
} from '@shared/validation-types';
import { LIFECYCLE_TIER_LABELS } from '@shared/validation-types';

// ============================================================================
// Helpers
// ============================================================================

/** Render a colored badge for the given validation run status. */
function statusBadge(status: string) {
  switch (status) {
    case 'passed':
      return (
        <Badge variant="outline" className="text-green-500 border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Passed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="text-red-500 border-red-500/30">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="outline" className="text-orange-500 border-orange-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="outline" className="text-blue-500 border-blue-500/30">
          <Clock className="w-3 h-3 mr-1" />
          Running
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/** Render a colored badge for the given violation severity. */
function severityBadge(severity: string) {
  switch (severity) {
    case 'error':
      return (
        <Badge variant="destructive" className="text-xs">
          error
        </Badge>
      );
    case 'warning':
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
          warning
        </Badge>
      );
    case 'info':
      return (
        <Badge variant="secondary" className="text-xs">
          info
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          {severity}
        </Badge>
      );
  }
}

/** Format milliseconds into a human-readable duration string. */
function formatDuration(ms: number | undefined) {
  if (ms === undefined) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format an ISO timestamp into a short locale string. */
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// Lifecycle Helpers (OMN-2152)
// ============================================================================

/** Color configuration for candidate statuses. */
const CANDIDATE_STATUS_CONFIG: Record<
  CandidateStatus,
  { label: string; textClass: string; borderClass: string; bgClass: string }
> = {
  pending: {
    label: 'Pending',
    textClass: 'text-blue-400',
    borderClass: 'border-blue-500/30',
    bgClass: 'bg-blue-500/10',
  },
  pass: {
    label: 'PASS',
    textClass: 'text-green-400',
    borderClass: 'border-green-500/30',
    bgClass: 'bg-green-500/10',
  },
  fail: {
    label: 'FAIL',
    textClass: 'text-red-400',
    borderClass: 'border-red-500/30',
    bgClass: 'bg-red-500/10',
  },
  quarantine: {
    label: 'QUARANTINE',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500/30',
    bgClass: 'bg-orange-500/10',
  },
};

/** Color configuration for lifecycle tiers. */
const TIER_COLOR_CONFIG: Record<LifecycleTier, { bgClass: string; textClass: string }> = {
  observed: { bgClass: 'bg-slate-500/15', textClass: 'text-slate-400' },
  suggested: { bgClass: 'bg-blue-500/15', textClass: 'text-blue-400' },
  shadow_apply: { bgClass: 'bg-violet-500/15', textClass: 'text-violet-400' },
  promoted: { bgClass: 'bg-emerald-500/15', textClass: 'text-emerald-400' },
  default: { bgClass: 'bg-green-500/15', textClass: 'text-green-400' },
};

/** Render a colored badge for a candidate status. */
function candidateStatusBadge(status: CandidateStatus) {
  const config = CANDIDATE_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`${config.textClass} ${config.borderClass} text-xs`}>
      {config.label}
    </Badge>
  );
}

/** Render a colored badge for a lifecycle tier. */
function tierBadge(tier: LifecycleTier) {
  const config = TIER_COLOR_CONFIG[tier];
  return (
    <Badge variant="outline" className={`${config.textClass} text-xs`}>
      {LIFECYCLE_TIER_LABELS[tier]}
    </Badge>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * Dashboard for monitoring cross-repo validation runs, violations, per-repo trends,
 * and validation lifecycle tier progression.
 *
 * Displays two tabs:
 * - **Runs**: summary cards, violation trend chart, expandable runs table
 * - **Lifecycle**: candidate status cards, tier flow visualization, candidates table
 *
 * Subscribes to the 'validation' WebSocket topic so data refreshes in real-time
 * when new validation events arrive, in addition to 15-second polling as a fallback.
 */
export default function ValidationDashboard() {
  const [activeTab, setActiveTab] = useState<string>('runs');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // WebSocket: subscribe to validation topic for real-time query invalidation
  // ---------------------------------------------------------------------------
  const queryClient = useQueryClient();

  const { subscribe, isConnected } = useWebSocket({
    onMessage: (msg) => {
      if (msg.type === 'VALIDATION_EVENT') {
        queryClient.invalidateQueries({ queryKey: queryKeys.validation.all });
      }
    },
  });

  useEffect(() => {
    if (isConnected) {
      subscribe(['validation']);
    }
  }, [isConnected, subscribe]);

  // ---------------------------------------------------------------------------
  // Runs tab queries
  // ---------------------------------------------------------------------------

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<ValidationSummary>({
    queryKey: queryKeys.validation.summary(),
    queryFn: () => validationSource.summary(),
    refetchInterval: 15_000,
  });

  const {
    data: runsData,
    isLoading: runsLoading,
    refetch: refetchRuns,
  } = useQuery<RunsListResponse>({
    queryKey: queryKeys.validation.list(statusFilter),
    queryFn: () => validationSource.listRuns({ status: statusFilter, limit: 50 }),
    refetchInterval: 15_000,
  });

  const { data: runDetail } = useQuery<ValidationRun | null>({
    queryKey: queryKeys.validation.detail(expandedRunId ?? ''),
    queryFn: () => validationSource.getRunDetail(expandedRunId!),
    enabled: !!expandedRunId,
  });

  const { data: repoTrends } = useQuery<RepoTrends>({
    queryKey: queryKeys.validation.trends(selectedRepo ?? ''),
    queryFn: () => validationSource.getRepoTrends(selectedRepo!),
    enabled: !!selectedRepo,
  });

  // ---------------------------------------------------------------------------
  // Lifecycle tab query (OMN-2152)
  // ---------------------------------------------------------------------------

  const {
    data: lifecycle,
    isLoading: lifecycleLoading,
    refetch: refetchLifecycle,
  } = useQuery<LifecycleSummary>({
    queryKey: queryKeys.validation.lifecycle(),
    queryFn: () => validationSource.getLifecycleSummary(),
    refetchInterval: 30_000,
    enabled: activeTab === 'lifecycle',
  });

  const repos = useMemo(() => summary?.repos ?? [], [summary]);

  const handleRefresh = () => {
    refetchSummary();
    refetchRuns();
    refetchLifecycle();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Cross-Repo Validation
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitor validation runs, violations, and per-repo trends
          </p>
        </div>
        <div className="flex items-center gap-3">
          {validationSource.isUsingMockData && (
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

      {/* Tabbed Layout (OMN-2152) */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
        </TabsList>

        {/* ================================================================
            TAB 1: Runs (existing content)
            ================================================================ */}
        <TabsContent value="runs" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Runs</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-3xl font-bold">{summary?.total_runs ?? 0}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pass Rate</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-3xl font-bold text-green-500">
                    {summary ? `${(summary.pass_rate * 100).toFixed(0)}%` : '\u2014'}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Running</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-3xl font-bold text-blue-500">
                      {summary?.running_runs ?? 0}
                    </div>
                    {(summary?.running_runs ?? 0) > 0 && (
                      <Activity className="w-5 h-5 text-blue-500 animate-pulse" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Violations by Severity</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <div className="flex gap-3">
                    <span className="text-red-500 font-mono text-sm">
                      {summary?.total_violations_by_severity?.error ?? 0} err
                    </span>
                    <span className="text-yellow-500 font-mono text-sm">
                      {summary?.total_violations_by_severity?.warning ?? 0} warn
                    </span>
                    <span className="text-muted-foreground font-mono text-sm">
                      {summary?.total_violations_by_severity?.info ?? 0} info
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Repo Trends */}
          {repos.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Violation Trends</CardTitle>
                    <CardDescription>Per-repo violation counts over time</CardDescription>
                  </div>
                  <Select
                    value={selectedRepo ?? ''}
                    onValueChange={(v) => setSelectedRepo(v || null)}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Select repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo} value={repo}>
                          {repo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {selectedRepo && repoTrends?.trend && repoTrends.trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={repoTrends.trend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="errors"
                        stackId="1"
                        stroke="hsl(0, 84%, 60%)"
                        fill="hsl(0, 84%, 60%)"
                        fillOpacity={0.4}
                        name="Errors"
                      />
                      <Area
                        type="monotone"
                        dataKey="warnings"
                        stackId="1"
                        stroke="hsl(45, 93%, 47%)"
                        fill="hsl(45, 93%, 47%)"
                        fillOpacity={0.3}
                        name="Warnings"
                      />
                      <Area
                        type="monotone"
                        dataKey="infos"
                        stackId="1"
                        stroke="hsl(var(--muted-foreground))"
                        fill="hsl(var(--muted-foreground))"
                        fillOpacity={0.15}
                        name="Info"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : selectedRepo ? (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                    No trend data available for {selectedRepo}
                  </div>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                    Select a repository to view violation trends
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Runs Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Validation Runs</CardTitle>
                  <CardDescription>
                    {runsData
                      ? `${runsData.total} run${runsData.total !== 1 ? 's' : ''}`
                      : 'Loading...'}
                  </CardDescription>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : runsData && runsData.runs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Run ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Repos</TableHead>
                      <TableHead>Violations</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runsData.runs.map((run) => (
                      <Fragment key={run.run_id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          tabIndex={0}
                          role="button"
                          aria-expanded={expandedRunId === run.run_id}
                          aria-label={`Toggle details for run ${run.run_id.slice(0, 8)}`}
                          onClick={() =>
                            setExpandedRunId(expandedRunId === run.run_id ? null : run.run_id)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedRunId(expandedRunId === run.run_id ? null : run.run_id);
                            }
                          }}
                        >
                          <TableCell>
                            {expandedRunId === run.run_id ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {run.run_id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>{statusBadge(run.status)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {run.repos.map((r) => (
                                <Badge key={r} variant="outline" className="text-xs">
                                  {r}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono">{run.violation_count}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDuration(run.duration_ms)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatTime(run.started_at)}
                          </TableCell>
                        </TableRow>

                        {/* Expanded violation detail */}
                        {expandedRunId === run.run_id && runDetail && (
                          <TableRow key={`${run.run_id}-detail`}>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              {runDetail.violations.length > 0 ? (
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium mb-2">
                                    Violations ({runDetail.violations.length})
                                  </h4>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Severity</TableHead>
                                        <TableHead>Rule</TableHead>
                                        <TableHead>Repo</TableHead>
                                        <TableHead>Message</TableHead>
                                        <TableHead>File</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {runDetail.violations.slice(0, 50).map((v, i) => (
                                        <TableRow key={i}>
                                          <TableCell>{severityBadge(v.severity)}</TableCell>
                                          <TableCell className="font-mono text-xs">
                                            {v.rule_id}
                                          </TableCell>
                                          <TableCell>
                                            <Badge variant="outline" className="text-xs">
                                              {v.repo}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-sm max-w-[300px] truncate">
                                            {v.message}
                                          </TableCell>
                                          <TableCell className="font-mono text-xs text-muted-foreground">
                                            {v.file_path
                                              ? `${v.file_path}${v.line ? `:${v.line}` : ''}`
                                              : '\u2014'}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                  {runDetail.violations.length > 50 && (
                                    <p className="text-xs text-muted-foreground">
                                      Showing 50 of {runDetail.violations.length} violations
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No violations found</p>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                  No validation runs found. Events will appear here once the cross-repo validators
                  produce results.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 2: Lifecycle (OMN-2152)
            ================================================================ */}
        <TabsContent value="lifecycle" className="space-y-6">
          {/* Candidate Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard
              label="Pending"
              value={lifecycle?.by_status.pending ?? 0}
              icon={Clock}
              status="warning"
              subtitle="Awaiting validation"
              isLoading={lifecycleLoading}
            />
            <MetricCard
              label="Pass"
              value={lifecycle?.by_status.pass ?? 0}
              icon={CheckCircle}
              status="healthy"
              subtitle="Validated successfully"
              isLoading={lifecycleLoading}
            />
            <MetricCard
              label="Fail"
              value={lifecycle?.by_status.fail ?? 0}
              icon={XCircle}
              status="error"
              subtitle="Failed validation"
              isLoading={lifecycleLoading}
            />
            <MetricCard
              label="Quarantine"
              value={lifecycle?.by_status.quarantine ?? 0}
              icon={ShieldAlert}
              subtitle="Under review"
              isLoading={lifecycleLoading}
            />
          </div>

          {/* Lifecycle Tier Visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Lifecycle Tiers
              </CardTitle>
              <CardDescription>
                Candidate progression: Observed {'\u2192'} Suggested {'\u2192'} Shadow Apply{' '}
                {'\u2192'} Promoted {'\u2192'} Default
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lifecycleLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : lifecycle ? (
                <div className="flex flex-col lg:flex-row items-stretch gap-3">
                  {lifecycle.tiers.map((tierMetrics, index) => {
                    const colorConfig = TIER_COLOR_CONFIG[tierMetrics.tier];
                    const isLastTier = index === lifecycle.tiers.length - 1;

                    return (
                      <Fragment key={tierMetrics.tier}>
                        {/* Tier Card */}
                        <div
                          className={`flex-1 rounded-lg border p-4 ${colorConfig.bgClass} min-w-0`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-sm font-semibold ${colorConfig.textClass}`}>
                              {LIFECYCLE_TIER_LABELS[tierMetrics.tier]}
                            </span>
                            <span className="text-2xl font-bold font-mono">
                              {tierMetrics.count}
                            </span>
                          </div>

                          {/* Status breakdown */}
                          <div className="grid grid-cols-2 gap-1 text-xs mb-3">
                            <div className="flex items-center gap-1">
                              <CircleDot className="w-3 h-3 text-green-400" />
                              <span className="text-muted-foreground">
                                {tierMetrics.by_status.pass} pass
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <CircleDot className="w-3 h-3 text-red-400" />
                              <span className="text-muted-foreground">
                                {tierMetrics.by_status.fail} fail
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <CircleDot className="w-3 h-3 text-blue-400" />
                              <span className="text-muted-foreground">
                                {tierMetrics.by_status.pending} pend
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Ban className="w-3 h-3 text-orange-400" />
                              <span className="text-muted-foreground">
                                {tierMetrics.by_status.quarantine} quar
                              </span>
                            </div>
                          </div>

                          {/* Tier metrics */}
                          <div className="border-t border-border/50 pt-2 space-y-1">
                            {tierMetrics.tier !== 'default' && (
                              <>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Avg days</span>
                                  <span className="font-mono">
                                    {tierMetrics.avg_days_at_tier.toFixed(1)}d
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Transition</span>
                                  <span className="font-mono">
                                    {(tierMetrics.transition_rate * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </>
                            )}
                            {tierMetrics.tier === 'default' && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Terminal tier</span>
                                <span className="font-mono text-green-400">{'\u2713'}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Arrow between tiers */}
                        {!isLastTier && (
                          <div className="flex items-center justify-center lg:flex-col py-1 lg:py-0 lg:px-0">
                            <ArrowRight className="w-5 h-5 text-muted-foreground hidden lg:block" />
                            <ChevronDown className="w-5 h-5 text-muted-foreground lg:hidden" />
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                  No lifecycle data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Candidates Table */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-base">Candidates</CardTitle>
                <CardDescription>
                  {lifecycle
                    ? `${lifecycle.total_candidates} tracked candidate${lifecycle.total_candidates !== 1 ? 's' : ''}`
                    : 'Loading...'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {lifecycleLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : lifecycle && lifecycle.candidates.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Repo</TableHead>
                      <TableHead>Runs</TableHead>
                      <TableHead>Streak</TableHead>
                      <TableHead>Last Validated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lifecycle.candidates.map((candidate) => (
                      <TableRow key={candidate.candidate_id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium truncate max-w-[250px]">
                              {candidate.rule_name}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {candidate.rule_id}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{candidateStatusBadge(candidate.status)}</TableCell>
                        <TableCell>{tierBadge(candidate.tier)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {candidate.source_repo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{candidate.total_runs}</span>
                        </TableCell>
                        <TableCell>
                          {candidate.pass_streak > 0 ? (
                            <span className="text-green-400 font-mono text-sm">
                              {candidate.pass_streak} pass
                            </span>
                          ) : candidate.fail_streak > 0 ? (
                            <span className="text-red-400 font-mono text-sm">
                              {candidate.fail_streak} fail
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">{'\u2014'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatTime(candidate.last_validated_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                  No lifecycle candidates found. Candidates will appear here as validation rules
                  progress through lifecycle tiers.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
