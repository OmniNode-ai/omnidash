/**
 * Pipeline Budget Dashboard (OMN-2602)
 *
 * Displays pipeline budget cap events from: onex.evt.omniclaude.budget-cap-hit.v1
 * Source table: pipeline_budget_state (populated by read-model-consumer.ts)
 *
 * Shows:
 * - Summary stat cards (total cap hits, affected pipelines, token vs cost hits)
 * - Recent cap-hit events table
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
import { DollarSign, Zap, AlertTriangle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  PipelineBudgetPayload,
  PipelineBudgetRow,
} from '../../../server/projections/pipeline-budget-projection';

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

function fmtValue(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
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

function BudgetTable({ rows, isLoading }: { rows: PipelineBudgetRow[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          Recent Budget Cap Hits
        </CardTitle>
        <CardDescription>Last 50 cap-hit events from pipeline_budget_state table</CardDescription>
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
            No budget cap events yet. Waiting for{' '}
            <code className="text-xs">onex.evt.omniclaude.budget-cap-hit.v1</code> events.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pipeline ID</TableHead>
                <TableHead>Budget Type</TableHead>
                <TableHead className="text-right">Cap Value</TableHead>
                <TableHead className="text-right">Current Value</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.correlation_id}>
                  <TableCell className="font-mono text-xs">{row.pipeline_id}</TableCell>
                  <TableCell>
                    <Badge
                      variant={row.budget_type === 'tokens' ? 'secondary' : 'outline'}
                      className="text-xs font-mono"
                    >
                      {row.budget_type === 'tokens' ? (
                        <Zap className="h-3 w-3 mr-1 inline" />
                      ) : (
                        <DollarSign className="h-3 w-3 mr-1 inline" />
                      )}
                      {row.budget_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtValue(row.cap_value)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-red-500">
                    {fmtValue(row.current_value)}
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

async function fetchPipelineBudgetSnapshot(): Promise<PipelineBudgetPayload> {
  const res = await fetch('/api/pipeline-budget/snapshot');
  if (!res.ok) throw new Error('Failed to fetch pipeline budget snapshot');
  return res.json() as Promise<PipelineBudgetPayload>;
}

export default function PipelineBudgetDashboard() {
  const queryClient = useQueryClient();

  useWebSocket({
    onMessage: useCallback(
      (msg: { type: string }) => {
        if (msg.type === 'PIPELINE_BUDGET_INVALIDATE') {
          queryClient.invalidateQueries({ queryKey: queryKeys.pipelineBudget.all });
        }
      },
      [queryClient]
    ),
    debug: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.pipelineBudget.snapshot(),
    queryFn: fetchPipelineBudgetSnapshot,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const summary = data?.summary;
  const rows = data?.recent ?? [];

  return (
    <div className="space-y-6" data-testid="page-pipeline-budget-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pipeline Budget</h1>
        <p className="text-muted-foreground">
          Budget cap hits from{' '}
          <code className="text-xs">onex.evt.omniclaude.budget-cap-hit.v1</code>
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Failed to load pipeline budget data.</p>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Cap Hits (7d)"
          value={isLoading ? '—' : String(summary?.total_cap_hits ?? 0)}
          icon={AlertTriangle}
          valueClass={(summary?.total_cap_hits ?? 0) > 0 ? 'text-yellow-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Affected Pipelines"
          value={isLoading ? '—' : String(summary?.affected_pipelines ?? 0)}
          icon={BarChart3}
          isLoading={isLoading}
        />
        <StatCard
          title="Token Cap Hits"
          value={isLoading ? '—' : String(summary?.token_cap_hits ?? 0)}
          icon={Zap}
          valueClass={(summary?.token_cap_hits ?? 0) > 0 ? 'text-yellow-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Cost Cap Hits"
          value={isLoading ? '—' : String(summary?.cost_cap_hits ?? 0)}
          icon={DollarSign}
          valueClass={(summary?.cost_cap_hits ?? 0) > 0 ? 'text-red-500' : undefined}
          isLoading={isLoading}
        />
      </div>

      {/* Recent Table */}
      <BudgetTable rows={rows} isLoading={isLoading} />
    </div>
  );
}
