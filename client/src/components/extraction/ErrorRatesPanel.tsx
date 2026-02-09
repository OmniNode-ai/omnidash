/**
 * Error Rates Panel (OMN-1804)
 *
 * Displays error rates by pipeline cohort with recent error samples.
 * Handles loading, error, and empty states gracefully.
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
import { AlertTriangle, XCircle } from 'lucide-react';
import type { ErrorRateEntry } from '@shared/extraction-types';

function errorRateBadge(rate: number) {
  if (rate === 0) {
    return (
      <Badge variant="outline" className="text-green-500 border-green-500/30 text-[10px]">
        0%
      </Badge>
    );
  }
  if (rate < 0.05) {
    return (
      <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-[10px]">
        {(rate * 100).toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-red-500 border-red-500/30 text-[10px]">
      {(rate * 100).toFixed(1)}%
    </Badge>
  );
}

export function ErrorRatesPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.extraction.errors(),
    queryFn: () => extractionSource.errorsSummary(),
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Error Rates</CardTitle>
          </div>
          {data && data.total_errors > 0 && (
            <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">
              {data.total_errors} total errors
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">Failure rates by cohort</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span>Failed to load error rates</span>
          </div>
        )}

        {!isLoading && !error && data && data.entries.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No error data yet. Error metrics will appear when pipeline events start flowing.
          </div>
        )}

        {!isLoading && !error && data && data.entries.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Cohort</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Failures</TableHead>
                <TableHead className="text-xs">Error Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((entry: ErrorRateEntry) => (
                <TableRow key={entry.cohort}>
                  <TableCell className="text-xs font-mono">{entry.cohort}</TableCell>
                  <TableCell className="text-xs text-right">{entry.total_events}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">
                    {entry.failure_count}
                  </TableCell>
                  <TableCell>{errorRateBadge(entry.error_rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
