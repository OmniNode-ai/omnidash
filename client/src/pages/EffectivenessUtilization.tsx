/**
 * EffectivenessUtilization
 *
 * Utilization analytics page (R4) for injection effectiveness.
 * Shows a utilization distribution histogram, per-method median scores,
 * top pattern utilization rates, and a low-utilization session drill-down.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { effectivenessSource } from '@/lib/data-sources/effectiveness-source';
import { formatRelativeTime } from '@/lib/date-utils';
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
import type { UtilizationDetails } from '@shared/effectiveness-types';
import { BarChart3, ArrowLeft, RefreshCw, AlertCircle, TrendingDown } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// ============================================================================
// Helpers
// ============================================================================

/** Format a bucket range into a label like "0.0-0.1". */
function bucketLabel(start: number, end: number): string {
  return `${start.toFixed(1)}-${end.toFixed(1)}`;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Utilization analytics detail page for injection effectiveness.
 *
 * Displays:
 * 1. A histogram of utilization score distribution (10 buckets, 0.0 to 1.0)
 * 2. A table of utilization medians by detection method
 * 3. A table of top-20 pattern utilization rates with inline progress bars
 * 4. A drill-down table of sessions with low utilization (< 0.2)
 *
 * Data refreshes via 15-second polling with WebSocket-triggered invalidation
 * for real-time responsiveness.
 */
export default function EffectivenessUtilization() {
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

  const { data, isLoading, refetch } = useQuery<UtilizationDetails>({
    queryKey: queryKeys.effectiveness.utilization(),
    queryFn: () => effectivenessSource.utilizationDetails(),
    refetchInterval: 15_000,
  });

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const histogramData = (data?.histogram ?? []).map((bucket) => ({
    label: bucketLabel(bucket.range_start, bucket.range_end),
    count: bucket.count,
    range_start: bucket.range_start,
  }));

  const methodRows = data?.by_method ?? [];
  const patternRows = (data?.pattern_rates ?? []).slice(0, 20);
  const lowSessions = data?.low_utilization_sessions ?? [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/effectiveness">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Utilization Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Distribution, method breakdown, pattern rates, and low-utilization sessions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {effectivenessSource.isUsingMockData && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              Demo Data
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Utilization Distribution Histogram */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilization Distribution</CardTitle>
          <CardDescription>Session count by utilization score bucket (0.0 to 1.0)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : histogramData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={histogramData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
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
                  formatter={(value: number) => [value, 'Sessions']}
                />
                <ReferenceLine
                  x="0.6-0.7"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  label={{
                    value: 'Target (0.6)',
                    fill: 'hsl(var(--muted-foreground))',
                    fontSize: 11,
                    position: 'top',
                  }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
              No utilization data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column grid: Method table + Pattern table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Utilization by Method */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utilization by Method</CardTitle>
            <CardDescription>Median utilization score per detection method</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : methodRows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Median Score</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {methodRows.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell>
                        <Badge variant="outline">{row.method}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.median_score.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.session_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                No method data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Pattern Utilization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Pattern Utilization</CardTitle>
            <CardDescription>Top 20 patterns by average utilization rate</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : patternRows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pattern ID</TableHead>
                    <TableHead>Avg Utilization</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patternRows.map((row) => {
                    const pct = Math.round(row.avg_utilization * 100);
                    return (
                      <TableRow key={row.pattern_id}>
                        <TableCell className="font-mono text-xs">
                          {row.pattern_id.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-purple-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-muted-foreground w-10 text-right">
                              {pct}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.session_count}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                No pattern data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Utilization Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            Low Utilization Sessions (&lt; 0.2)
          </CardTitle>
          <CardDescription>
            Sessions where injected context was rarely or never referenced
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : lowSessions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowSessions.map((session) => (
                  <TableRow key={session.session_id}>
                    <TableCell className="font-mono text-xs">
                      {session.session_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-mono text-sm ${
                          session.utilization_score < 0.1
                            ? 'text-red-500 font-semibold'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {session.utilization_score.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {session.agent_name ?? <span className="text-muted-foreground">--</span>}
                    </TableCell>
                    <TableCell>
                      {session.detection_method ? (
                        <Badge variant="outline" className="text-xs">
                          {session.detection_method}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatRelativeTime(session.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              <TrendingDown className="w-4 h-4 mr-2" />
              No low-utilization sessions found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
