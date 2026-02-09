/**
 * Pipeline Health Panel (OMN-1804)
 *
 * Displays per-cohort health metrics: total events, success/failure counts,
 * success rate, and average latency. Handles loading, error, and empty states.
 *
 * Cohort represents the pipeline variant/bucket for a given run.
 */

import { useQuery } from '@tanstack/react-query';
import { extractionSource } from '@/lib/data-sources/extraction-source';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, AlertTriangle } from 'lucide-react';
import type { PipelineCohortHealth } from '@shared/extraction-types';

function healthBadge(rate: number) {
  if (rate >= 0.95) {
    return (
      <Badge variant="outline" className="text-green-500 border-green-500/30">
        Healthy
      </Badge>
    );
  }
  if (rate >= 0.8) {
    return (
      <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
        Degraded
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-red-500 border-red-500/30">
      Unhealthy
    </Badge>
  );
}

export function PipelineHealthPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.extraction.health(),
    queryFn: () => extractionSource.pipelineHealth(),
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Pipeline Health</CardTitle>
        </div>
        <CardDescription className="text-xs">Per-cohort success rates and latency</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span>Failed to load pipeline health</span>
          </div>
        )}

        {!isLoading && !error && data && data.cohorts.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No pipeline data yet. Events will appear when the extraction pipeline starts emitting.
          </div>
        )}

        {!isLoading && !error && data && data.cohorts.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Cohort</TableHead>
                <TableHead className="text-xs text-right">Events</TableHead>
                <TableHead className="text-xs text-right">Success</TableHead>
                <TableHead className="text-xs text-right">Failures</TableHead>
                <TableHead className="text-xs text-right">Avg Latency</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cohorts.map((cohort: PipelineCohortHealth) => (
                <TableRow key={cohort.cohort}>
                  <TableCell className="text-xs font-mono">{cohort.cohort}</TableCell>
                  <TableCell className="text-xs text-right">{cohort.total_events}</TableCell>
                  <TableCell className="text-xs text-right text-green-500">
                    {cohort.success_count}
                  </TableCell>
                  <TableCell className="text-xs text-right text-red-500">
                    {cohort.failure_count}
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    {cohort.avg_latency_ms != null
                      ? `${Math.round(cohort.avg_latency_ms)}ms`
                      : '--'}
                  </TableCell>
                  <TableCell>{healthBadge(cohort.success_rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
