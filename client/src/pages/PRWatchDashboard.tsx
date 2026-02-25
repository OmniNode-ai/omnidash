/**
 * PR Watch Dashboard (OMN-2602)
 *
 * Displays PR state from: onex.evt.omniclaude.pr-watch-updated.v1
 * Source table: pr_watch_state (populated by read-model-consumer.ts)
 *
 * Shows:
 * - Summary stat cards (total, open, merged, closed, checks_passing)
 * - Recent PR watch state table
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GitPullRequest, GitMerge, XCircle, CheckCircle2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  PrWatchPayload,
  PrWatchRow,
} from '../../../server/projections/pr-watch-projection';

// ============================================================================
// Helpers
// ============================================================================

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

function stateColor(state: string): string {
  if (state === 'open') return 'text-green-500';
  if (state === 'merged') return 'text-purple-500';
  if (state === 'closed') return 'text-muted-foreground';
  return '';
}

function stateBadge(state: string): 'default' | 'secondary' | 'outline' {
  if (state === 'open') return 'default';
  if (state === 'merged') return 'secondary';
  return 'outline';
}

function checksColor(status: string | null): string {
  if (status === 'success') return 'text-green-500';
  if (status === 'failure') return 'text-red-500';
  return 'text-yellow-500';
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  title,
  value,
  icon: Icon,
  valueClass,
  isLoading,
}: {
  title: string;
  value: string;
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
          <div className={cn('text-2xl font-bold tabular-nums', valueClass)}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function PRWatchTable({ rows, isLoading }: { rows: PrWatchRow[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4" />
          Recent PR State
        </CardTitle>
        <CardDescription>Last 50 PR watch events from pr_watch_state table</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No PR watch events yet. Waiting for{' '}
            <code className="text-xs">onex.evt.omniclaude.pr-watch-updated.v1</code> events.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PR</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Checks</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.correlation_id}>
                  <TableCell className="font-mono text-xs">
                    {row.pr_number != null ? `#${row.pr_number}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={stateBadge(row.state)} className="text-xs">
                      <span className={stateColor(row.state)}>{row.state}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className={cn('text-xs', checksColor(row.checks_status))}>
                    {row.checks_status ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.review_status ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[120px] truncate">
                    {row.repo ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(row.created_at)}
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

async function fetchPrWatchSnapshot(): Promise<PrWatchPayload> {
  const res = await fetch('/api/pr-watch/snapshot');
  if (!res.ok) throw new Error('Failed to fetch PR watch snapshot');
  return res.json() as Promise<PrWatchPayload>;
}

export default function PRWatchDashboard() {
  const queryClient = useQueryClient();

  useWebSocket({
    onMessage: useCallback(
      (msg: { type: string }) => {
        if (msg.type === 'PR_WATCH_INVALIDATE') {
          queryClient.invalidateQueries({ queryKey: queryKeys.prWatch.all });
        }
      },
      [queryClient]
    ),
    debug: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.prWatch.snapshot(),
    queryFn: fetchPrWatchSnapshot,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const summary = data?.summary;
  const rows = data?.recent ?? [];

  return (
    <div className="space-y-6" data-testid="page-pr-watch-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PR Watch</h1>
        <p className="text-muted-foreground">
          PR state updates from{' '}
          <code className="text-xs">onex.evt.omniclaude.pr-watch-updated.v1</code>
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Failed to load PR watch data.</p>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total (7d)"
          value={isLoading ? '—' : String(summary?.total ?? 0)}
          icon={BarChart3}
          isLoading={isLoading}
        />
        <StatCard
          title="Open"
          value={isLoading ? '—' : String(summary?.open ?? 0)}
          icon={GitPullRequest}
          valueClass="text-green-500"
          isLoading={isLoading}
        />
        <StatCard
          title="Merged"
          value={isLoading ? '—' : String(summary?.merged ?? 0)}
          icon={GitMerge}
          valueClass="text-purple-500"
          isLoading={isLoading}
        />
        <StatCard
          title="Closed"
          value={isLoading ? '—' : String(summary?.closed ?? 0)}
          icon={XCircle}
          isLoading={isLoading}
        />
        <StatCard
          title="Checks Passing"
          value={isLoading ? '—' : String(summary?.checks_passing ?? 0)}
          icon={CheckCircle2}
          valueClass="text-green-500"
          isLoading={isLoading}
        />
      </div>

      {/* Recent Table */}
      <PRWatchTable rows={rows} isLoading={isLoading} />
    </div>
  );
}
