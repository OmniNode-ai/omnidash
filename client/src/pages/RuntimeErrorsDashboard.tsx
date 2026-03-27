/**
 * Runtime Errors Dashboard (OMN-5528)
 *
 * Visualizes runtime error events from:
 *   onex.evt.omnibase-infra.runtime-error.v1
 *
 * Shows:
 * - Error category breakdown
 * - Top fingerprints by occurrence
 * - Recent error event log
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
import { Bug, CheckCircle2, Database, Globe, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  runtimeErrorsSource,
  type RuntimeErrorWindow,
  type RuntimeErrorsSummary,
  type RuntimeErrorsEvents,
} from '@/lib/data-sources/runtime-errors-source';

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

function SeverityBadge({ severity }: { severity: string }) {
  const sev = severity.toUpperCase();
  if (sev === 'CRITICAL') return <Badge variant="destructive">{sev}</Badge>;
  if (sev === 'ERROR')
    return (
      <Badge variant="destructive" className="bg-orange-600">
        {sev}
      </Badge>
    );
  return <Badge className="bg-yellow-500 text-black">{sev}</Badge>;
}

function CategoryBadge({ category }: { category: string }) {
  const cat = category.toUpperCase();
  const variants: Record<string, { label: string; className: string }> = {
    KAFKA_CONSUMER: { label: 'Kafka Consumer', className: 'bg-purple-600' },
    KAFKA_PRODUCER: { label: 'Kafka Producer', className: 'bg-purple-500' },
    DATABASE: { label: 'Database', className: 'bg-blue-600' },
    HTTP_CLIENT: { label: 'HTTP Client', className: 'bg-teal-600' },
    HTTP_SERVER: { label: 'HTTP Server', className: 'bg-teal-500' },
    RUNTIME: { label: 'Runtime', className: 'bg-slate-600' },
  };
  const v = variants[cat] ?? { label: category, className: 'bg-gray-500' };
  return <Badge className={`${v.className} text-white text-xs`}>{v.label}</Badge>;
}

// ============================================================================
// Component
// ============================================================================

export default function RuntimeErrorsDashboard() {
  const [window, setWindow] = useState<RuntimeErrorWindow>('24h');
  const queryClient = useQueryClient();

  const summaryQuery = useQuery<RuntimeErrorsSummary>({
    queryKey: ['runtime-errors-summary', window],
    queryFn: () => runtimeErrorsSource.summary(window),
    refetchInterval: 15_000,
  });

  const eventsQuery = useQuery<RuntimeErrorsEvents>({
    queryKey: ['runtime-errors-events', window],
    queryFn: () => runtimeErrorsSource.events(window),
    refetchInterval: 15_000,
  });

  const handleWsMessage = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['runtime-errors-summary'] });
    queryClient.invalidateQueries({ queryKey: ['runtime-errors-events'] });
  }, [queryClient]);

  useWebSocket({ onMessage: handleWsMessage });

  const summary = summaryQuery.data;
  const events = eventsQuery.data;
  const isLoading = summaryQuery.isLoading;
  const cats = summary?.categoryCounts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Runtime Errors</h1>
          <p className="text-sm text-muted-foreground">
            Structured runtime errors captured from allowlisted loggers
          </p>
        </div>
        <Select value={window} onValueChange={(v) => setWindow(v as RuntimeErrorWindow)}>
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

      {/* Category stat cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                {(summary?.totalEvents ?? 0) > 0 ? (
                  <Bug className="h-5 w-5 text-red-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                <span className={(summary?.totalEvents ?? 0) === 0 ? 'text-green-600' : undefined}>
                  {summary?.totalEvents ?? 0}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Kafka</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                <Wifi
                  className={cn(
                    'h-5 w-5',
                    (cats?.kafkaConsumer ?? 0) + (cats?.kafkaProducer ?? 0) > 0
                      ? 'text-purple-500'
                      : 'text-green-500'
                  )}
                />
                <span
                  className={
                    (cats?.kafkaConsumer ?? 0) + (cats?.kafkaProducer ?? 0) === 0
                      ? 'text-green-600'
                      : undefined
                  }
                >
                  {(cats?.kafkaConsumer ?? 0) + (cats?.kafkaProducer ?? 0)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Database</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                <Database
                  className={cn(
                    'h-5 w-5',
                    (cats?.database ?? 0) > 0 ? 'text-blue-500' : 'text-green-500'
                  )}
                />
                <span className={(cats?.database ?? 0) === 0 ? 'text-green-600' : undefined}>
                  {cats?.database ?? 0}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">HTTP</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold flex items-center gap-2">
                <Globe
                  className={cn(
                    'h-5 w-5',
                    (cats?.httpClient ?? 0) + (cats?.httpServer ?? 0) > 0
                      ? 'text-teal-500'
                      : 'text-green-500'
                  )}
                />
                <span
                  className={
                    (cats?.httpClient ?? 0) + (cats?.httpServer ?? 0) === 0
                      ? 'text-green-600'
                      : undefined
                  }
                >
                  {(cats?.httpClient ?? 0) + (cats?.httpServer ?? 0)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top fingerprints */}
      {summary && summary.topFingerprints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Error Patterns</CardTitle>
            <CardDescription>
              Most frequent error fingerprints in the {window} window
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Logger</TableHead>
                  <TableHead>Message Template</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.topFingerprints.map((fp) => (
                  <TableRow key={fp.fingerprint}>
                    <TableCell>
                      <CategoryBadge category={fp.errorCategory} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fp.loggerFamily}</TableCell>
                    <TableCell className="text-xs max-w-md truncate">
                      {fp.messageTemplate}
                    </TableCell>
                    <TableCell className="font-bold">{fp.occurrences}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(fp.lastSeenAt)}
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
          <CardTitle>Recent Errors</CardTitle>
          <CardDescription>Latest runtime error events in the {window} window</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !events?.events.length ? (
            <div className="flex items-center justify-center py-12 text-green-600">
              <CheckCircle2 className="mr-2 h-5 w-5" />
              No runtime errors in this window
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Logger</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Exception</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.events.slice(0, 50).map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <CategoryBadge category={ev.errorCategory} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{ev.loggerFamily}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={ev.severity} />
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                      {ev.messageTemplate}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                      {ev.exceptionType || '-'}
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
