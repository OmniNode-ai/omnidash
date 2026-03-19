/**
 * Consumer Health Dashboard (OMN-5527)
 *
 * Visualizes consumer health events from:
 *   onex.evt.omnibase-infra.consumer-health.v1
 *
 * Shows:
 * - Per-consumer health status (green/yellow/red)
 * - Severity stat cards
 * - Recent health event log
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, AlertTriangle, XCircle, Activity, Server, HeartPulse } from 'lucide-react';
import {
  consumerHealthSource,
  type ConsumerHealthWindow,
  type HealthStatus,
  type ConsumerHealthSummary,
  type ConsumerHealthEvents,
} from '@/lib/data-sources/consumer-health-source';

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

function StatusBadge({ status }: { status: HealthStatus }) {
  if (status === 'red') {
    return (
      <Badge variant="destructive" className="uppercase text-xs font-mono">
        RED
      </Badge>
    );
  }
  if (status === 'yellow') {
    return (
      <Badge className="uppercase text-xs font-mono bg-yellow-500 hover:bg-yellow-600 text-black">
        YELLOW
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="uppercase text-xs font-mono bg-green-600 hover:bg-green-700 text-white"
    >
      GREEN
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const sev = severity.toUpperCase();
  if (sev === 'CRITICAL') return <Badge variant="destructive">{sev}</Badge>;
  if (sev === 'ERROR')
    return (
      <Badge variant="destructive" className="bg-orange-600">
        {sev}
      </Badge>
    );
  if (sev === 'WARNING') return <Badge className="bg-yellow-500 text-black">{sev}</Badge>;
  return <Badge variant="secondary">{sev}</Badge>;
}

// ============================================================================
// Component
// ============================================================================

export default function ConsumerHealthDashboard() {
  const [window, setWindow] = useState<ConsumerHealthWindow>('24h');
  const queryClient = useQueryClient();

  const summaryQuery = useQuery<ConsumerHealthSummary>({
    queryKey: ['consumer-health-summary', window],
    queryFn: () => consumerHealthSource.summary(window),
    refetchInterval: 15_000,
  });

  const eventsQuery = useQuery<ConsumerHealthEvents>({
    queryKey: ['consumer-health-events', window],
    queryFn: () => consumerHealthSource.events(window),
    refetchInterval: 15_000,
  });

  const handleWsMessage = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['consumer-health-summary'] });
    queryClient.invalidateQueries({ queryKey: ['consumer-health-events'] });
  }, [queryClient]);

  useWebSocket({ onMessage: handleWsMessage });

  const summary = summaryQuery.data;
  const events = eventsQuery.data;
  const isLoading = summaryQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consumer Health</h1>
          <p className="text-sm text-muted-foreground">
            Kafka consumer heartbeat, session, and rebalance health events
          </p>
        </div>
        <Select value={window} onValueChange={(v) => setWindow(v as ConsumerHealthWindow)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                {summary?.totalEvents ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                {summary?.severityCounts.critical ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                {summary?.severityCounts.error ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Consumers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                <Server className="h-5 w-5 text-slate-500" />
                {summary?.consumers.length ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Consumer status table */}
      {summary && summary.consumers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Consumer Status</CardTitle>
            <CardDescription>Current health status per consumer</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consumer</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Event</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.consumers.map((c) => (
                  <TableRow key={c.consumerIdentity}>
                    <TableCell className="font-mono text-xs">{c.consumerIdentity}</TableCell>
                    <TableCell className="font-mono text-xs">{c.consumerGroup}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-xs">{c.lastEventType}</TableCell>
                    <TableCell>{c.eventCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(c.lastEventAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent events table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>Latest consumer health events in the {window} window</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !events?.events.length ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <HeartPulse className="mr-2 h-5 w-5" />
              No health events in this window
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consumer</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.events.slice(0, 50).map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-mono text-xs">{ev.consumerIdentity}</TableCell>
                    <TableCell className="text-xs">{ev.eventType}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={ev.severity} />
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                      {ev.errorMessage || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(ev.emittedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
