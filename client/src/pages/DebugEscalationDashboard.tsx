/**
 * Debug Escalation Dashboard (OMN-2602)
 *
 * Displays circuit breaker trip events from: onex.evt.omniclaude.circuit-breaker-tripped.v1
 * Source table: debug_escalation_counts (populated by read-model-consumer.ts)
 *
 * Shows:
 * - Summary stat cards (total trips, affected agents, affected sessions, top agent)
 * - Recent tripped escalation table
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
import { AlertTriangle, User, Users, Zap } from 'lucide-react';
import type {
  DebugEscalationPayload,
  DebugEscalationRow,
} from '../../../server/projections/debug-escalation-projection';

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

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
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
          <div className="text-2xl font-bold tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function EscalationTable({
  rows,
  isLoading,
}: {
  rows: DebugEscalationRow[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          Recent Circuit Breaker Trips
        </CardTitle>
        <CardDescription>
          Last 50 tripped escalations from debug_escalation_counts table
        </CardDescription>
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
            No circuit breaker trips yet. Waiting for{' '}
            <code className="text-xs">onex.evt.omniclaude.circuit-breaker-tripped.v1</code> events.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Escalation Count</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.correlation_id}>
                  <TableCell>
                    <Badge variant="destructive" className="text-xs font-mono">
                      {row.agent_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-500">
                    {row.escalation_count}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[80px] truncate">
                    {row.session_id ?? '—'}
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

async function fetchDebugEscalationSnapshot(): Promise<DebugEscalationPayload> {
  const res = await fetch('/api/debug-escalation/snapshot');
  if (!res.ok) throw new Error('Failed to fetch debug escalation snapshot');
  return res.json() as Promise<DebugEscalationPayload>;
}

export default function DebugEscalationDashboard() {
  const queryClient = useQueryClient();

  useWebSocket({
    onMessage: useCallback(
      (msg: { type: string }) => {
        if (msg.type === 'DEBUG_ESCALATION_INVALIDATE') {
          queryClient.invalidateQueries({ queryKey: queryKeys.debugEscalation.all });
        }
      },
      [queryClient]
    ),
    debug: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.debugEscalation.snapshot(),
    queryFn: fetchDebugEscalationSnapshot,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const summary = data?.summary;
  const rows = data?.recent ?? [];

  return (
    <div className="space-y-6" data-testid="page-debug-escalation-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Debug Escalation</h1>
        <p className="text-muted-foreground">
          Circuit breaker trips from{' '}
          <code className="text-xs">onex.evt.omniclaude.circuit-breaker-tripped.v1</code>
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Failed to load debug escalation data.</p>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Trips (7d)"
          value={isLoading ? '—' : String(summary?.total_trips ?? 0)}
          icon={Zap}
          isLoading={isLoading}
        />
        <StatCard
          title="Affected Agents"
          value={isLoading ? '—' : String(summary?.affected_agents ?? 0)}
          icon={User}
          isLoading={isLoading}
        />
        <StatCard
          title="Affected Sessions"
          value={isLoading ? '—' : String(summary?.affected_sessions ?? 0)}
          icon={Users}
          isLoading={isLoading}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Agent (7d)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : summary?.top_agent ? (
              <Badge variant="destructive" className="text-xs font-mono mt-1">
                {summary.top_agent}
              </Badge>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Table */}
      <EscalationTable rows={rows} isLoading={isLoading} />
    </div>
  );
}
