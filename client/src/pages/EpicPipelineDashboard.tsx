/**
 * Epic Pipeline Dashboard (OMN-2602)
 *
 * Displays epic run state from: onex.evt.omniclaude.epic-run-updated.v1
 * Source tables: epic_run_events + epic_run_lease (populated by read-model-consumer.ts)
 *
 * Shows:
 * - Summary stat cards (active runs, total events, recent event types)
 * - Active leases table
 * - Recent events table
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
import { Activity, GitBranch, Clock, List } from 'lucide-react';
import type {
  EpicRunPayload,
  EpicRunEventRow,
  EpicRunLeaseRow,
} from '../../../server/projections/epic-run-projection';

// ============================================================================
// Helpers
// ============================================================================

function relativeTime(isoTs: string | null | undefined): string {
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

function LeasesTable({ leases, isLoading }: { leases: EpicRunLeaseRow[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          Active Leases
        </CardTitle>
        <CardDescription>Epic runs currently holding a lease</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : leases.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No active leases.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Epic Run ID</TableHead>
                <TableHead>Lease Holder</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leases.map((l) => (
                <TableRow key={l.epic_run_id}>
                  <TableCell className="font-mono text-xs">{l.epic_run_id}</TableCell>
                  <TableCell className="font-mono text-xs">{l.lease_holder}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.lease_expires_at ? relativeTime(l.lease_expires_at) : 'no expiry'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(l.updated_at)}
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

function EventsTable({ events, isLoading }: { events: EpicRunEventRow[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-4 w-4" />
          Recent Epic Events
        </CardTitle>
        <CardDescription>Last 50 events from epic_run_events table</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No epic run events yet. Waiting for{' '}
            <code className="text-xs">onex.evt.omniclaude.epic-run-updated.v1</code> events.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Type</TableHead>
                <TableHead>Epic Run ID</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => (
                <TableRow key={ev.correlation_id}>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {ev.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{ev.epic_run_id}</TableCell>
                  <TableCell className="font-mono text-xs">{ev.ticket_id ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[120px] truncate">
                    {ev.repo ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(ev.created_at)}
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

async function fetchEpicRunSnapshot(): Promise<EpicRunPayload> {
  const res = await fetch('/api/epic-run/snapshot');
  if (!res.ok) throw new Error('Failed to fetch epic run snapshot');
  return res.json() as Promise<EpicRunPayload>;
}

export default function EpicPipelineDashboard() {
  const queryClient = useQueryClient();

  useWebSocket({
    onMessage: useCallback(
      (msg: { type: string }) => {
        if (msg.type === 'EPIC_RUN_INVALIDATE') {
          queryClient.invalidateQueries({ queryKey: queryKeys.epicRun.all });
        }
      },
      [queryClient]
    ),
    debug: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.epicRun.snapshot(),
    queryFn: fetchEpicRunSnapshot,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const summary = data?.summary;
  const events = data?.events ?? [];
  const leases = data?.leases ?? [];

  return (
    <div className="space-y-6" data-testid="page-epic-pipeline-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Epic Pipeline</h1>
        <p className="text-muted-foreground">
          Epic run state from{' '}
          <code className="text-xs">onex.evt.omniclaude.epic-run-updated.v1</code>
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Failed to load epic run data.</p>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Active Runs (24h)"
          value={isLoading ? '—' : String(summary?.active_runs ?? 0)}
          icon={Activity}
          isLoading={isLoading}
        />
        <StatCard
          title="Total Events (24h)"
          value={isLoading ? '—' : String(summary?.total_events ?? 0)}
          icon={Clock}
          isLoading={isLoading}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Event Types (24h)</CardTitle>
            <List className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (summary?.recent_event_types ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">None</p>
            ) : (
              <div className="flex flex-wrap gap-1 mt-1">
                {summary!.recent_event_types.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px] px-1 py-0 font-mono">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leases + Events */}
      <div className="grid gap-6 md:grid-cols-2">
        <LeasesTable leases={leases} isLoading={isLoading} />
        <EventsTable events={events} isLoading={isLoading} />
      </div>
    </div>
  );
}
