/**
 * ValidationDashboard
 *
 * Cross-repo validation run history, violation counts, and trends.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 */

import { useState, useMemo, useEffect, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/useWebSocket';
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
import { Skeleton } from '@/components/ui/skeleton';
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
import type { ValidationRun, Violation, RepoTrends } from '@shared/validation-types';

// ============================================================================
// Types
// ============================================================================

interface RunSummary {
  run_id: string;
  repos: string[];
  validators: string[];
  triggered_by?: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  total_violations: number;
  violations_by_severity: Record<string, number>;
  violation_count: number;
}

interface RunsResponse {
  runs: RunSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface SummaryResponse {
  total_runs: number;
  completed_runs: number;
  running_runs: number;
  unique_repos: number;
  repos: string[];
  pass_rate: number;
  total_violations_by_severity: Record<string, number>;
}

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
  if (ms === undefined) return '—';
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
// Component
// ============================================================================

/**
 * Dashboard for monitoring cross-repo validation runs, violations, and per-repo trends.
 *
 * Displays summary cards, a violation trend chart, and an expandable runs table.
 * Subscribes to the 'validation' WebSocket topic so data refreshes in real-time
 * when new validation events arrive, in addition to 15-second polling as a fallback.
 */
export default function ValidationDashboard() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // WebSocket: subscribe to validation topic for real-time query invalidation
  // ---------------------------------------------------------------------------
  const queryClient = useQueryClient();

  const { subscribe } = useWebSocket({
    onMessage: (msg) => {
      if (msg.type === 'VALIDATION_EVENT') {
        queryClient.invalidateQueries({ queryKey: queryKeys.validation.all });
      }
    },
  });

  useEffect(() => {
    subscribe(['validation']);
  }, [subscribe]);

  // Fetch summary stats
  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<SummaryResponse>({
    queryKey: queryKeys.validation.summary(),
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/validation/summary');
      return res.json();
    },
    refetchInterval: 15_000,
  });

  // Fetch runs list
  const statusParam = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
  const {
    data: runsData,
    isLoading: runsLoading,
    refetch: refetchRuns,
  } = useQuery<RunsResponse>({
    queryKey: queryKeys.validation.list(statusFilter),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/validation/runs?limit=50${statusParam}`);
      return res.json();
    },
    refetchInterval: 15_000,
  });

  // Fetch expanded run detail
  const { data: runDetail } = useQuery<ValidationRun>({
    queryKey: queryKeys.validation.detail(expandedRunId ?? ''),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/validation/runs/${expandedRunId}`);
      return res.json();
    },
    enabled: !!expandedRunId,
  });

  // Fetch repo trends when a repo is selected
  const { data: repoTrends } = useQuery<RepoTrends>({
    queryKey: queryKeys.validation.trends(selectedRepo ?? ''),
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/validation/repos/${encodeURIComponent(selectedRepo!)}/trends`
      );
      return res.json();
    },
    enabled: !!selectedRepo,
  });

  const repos = useMemo(() => summary?.repos ?? [], [summary]);

  const handleRefresh = () => {
    refetchSummary();
    refetchRuns();
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
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

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
                {summary ? `${(summary.pass_rate * 100).toFixed(0)}%` : '—'}
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
                <div className="text-3xl font-bold text-blue-500">{summary?.running_runs ?? 0}</div>
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
              <Select value={selectedRepo ?? ''} onValueChange={(v) => setSelectedRepo(v || null)}>
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
                                          : '—'}
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
    </div>
  );
}
