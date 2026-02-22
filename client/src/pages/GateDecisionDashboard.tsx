/**
 * Gate Decision Dashboard (OMN-2602)
 *
 * Displays gate decision outcomes from: onex.evt.omniclaude.gate-decision.v1
 * Source table: gate_decisions (populated by read-model-consumer.ts)
 *
 * Shows:
 * - Summary stat cards (total, passed, failed, blocked, pass_rate)
 * - Recent gate decision table (last 50 rows)
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
import { CheckCircle2, XCircle, ShieldAlert, BarChart3, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  GateDecisionsPayload,
  GateDecisionRow,
} from '../../../server/projections/gate-decisions-projection';

// ============================================================================
// Helpers
// ============================================================================

function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
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

function outcomeColor(outcome: string): string {
  if (outcome === 'passed') return 'text-green-500';
  if (outcome === 'failed') return 'text-red-500';
  return 'text-yellow-500';
}

function outcomeBadge(outcome: string): 'default' | 'secondary' | 'destructive' {
  if (outcome === 'passed') return 'default';
  if (outcome === 'failed') return 'destructive';
  return 'secondary';
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

function GateDecisionTable({
  rows,
  isLoading,
}: {
  rows: GateDecisionRow[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Recent Gate Decisions
        </CardTitle>
        <CardDescription>Last 50 gate evaluations from gate_decisions table</CardDescription>
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
            No gate decision events yet. Waiting for{' '}
            <code className="text-xs">onex.evt.omniclaude.gate-decision.v1</code> events.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gate Name</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Blocking</TableHead>
                <TableHead>PR</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.correlation_id}>
                  <TableCell className="font-mono text-xs">{row.gate_name}</TableCell>
                  <TableCell>
                    <Badge variant={outcomeBadge(row.outcome)} className="text-xs">
                      <span className={outcomeColor(row.outcome)}>{row.outcome}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.blocking ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.pr_number ?? '—'}
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

async function fetchGateDecisionsSnapshot(): Promise<GateDecisionsPayload> {
  const res = await fetch('/api/gate-decisions/snapshot');
  if (!res.ok) throw new Error('Failed to fetch gate decisions snapshot');
  return res.json() as Promise<GateDecisionsPayload>;
}

export default function GateDecisionDashboard() {
  const queryClient = useQueryClient();

  useWebSocket({
    onMessage: useCallback(
      (msg: { type: string }) => {
        if (msg.type === 'GATE_DECISION_INVALIDATE') {
          queryClient.invalidateQueries({ queryKey: queryKeys.gateDecisions.all });
        }
      },
      [queryClient]
    ),
    debug: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.gateDecisions.snapshot(),
    queryFn: fetchGateDecisionsSnapshot,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const summary = data?.summary;
  const rows = data?.recent ?? [];

  return (
    <div className="space-y-6" data-testid="page-gate-decision-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gate Decisions</h1>
        <p className="text-muted-foreground">
          Pipeline gate evaluation outcomes from{' '}
          <code className="text-xs">onex.evt.omniclaude.gate-decision.v1</code>
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Failed to load gate decision data.</p>
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
          title="Passed"
          value={isLoading ? '—' : String(summary?.passed ?? 0)}
          icon={CheckCircle2}
          valueClass="text-green-500"
          isLoading={isLoading}
        />
        <StatCard
          title="Failed"
          value={isLoading ? '—' : String(summary?.failed ?? 0)}
          icon={XCircle}
          valueClass="text-red-500"
          isLoading={isLoading}
        />
        <StatCard
          title="Blocked"
          value={isLoading ? '—' : String(summary?.blocked ?? 0)}
          icon={ShieldAlert}
          valueClass={(summary?.blocked ?? 0) > 0 ? 'text-yellow-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Pass Rate"
          value={isLoading ? '—' : fmtPct(summary?.pass_rate ?? 0)}
          icon={Percent}
          valueClass={
            (summary?.pass_rate ?? 0) >= 0.8
              ? 'text-green-500'
              : (summary?.pass_rate ?? 0) >= 0.6
                ? 'text-yellow-500'
                : 'text-red-500'
          }
          isLoading={isLoading}
        />
      </div>

      {/* Recent Table */}
      <GateDecisionTable rows={rows} isLoading={isLoading} />
    </div>
  );
}
